"use client"

import { DialogFooter } from "@/components/ui/dialog"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Calendar, Loader2, Wand2, Search, Info, AlertTriangle, AlertCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { checkCache } from "@/lib/storage-utils"
import type { TimetableEntry, SelectedClass } from "@/lib/types"
import { doClassesOverlap, extractWeeksInfo } from "@/lib/format-utils"
import { TimeBlockSelector } from "./time-block-selector"
import { Input } from "@/components/ui/input"
import { filterUnitCodes } from "@/lib/unit-codes"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/use-mobile"

// Add this to the top of the file, after the imports
// Update the existing SelectedClass type from @/lib/types
declare module "@/lib/types" {
  interface SelectedClass extends TimetableEntry {
    id: string
    hasConflict?: boolean
  }
}

interface AutoTimetableGeneratorProps {
  onAddClasses: (classes: SelectedClass[]) => void
  existingClasses: SelectedClass[]
  onAddSearchedUnit?: (unitCode: string, teachingPeriodId: string) => void
}

type UnavailableBlock = {
  day: string
  startHour: number
  endHour: number
}

type PreferenceOption = "spread" | "balanced" | "compact"

type GenerationResult = {
  success: boolean
  classes: SelectedClass[]
  message: string
  warnings: string[]
  hasConflictsWithUnavailability: boolean
  score: number
}

// Monte Carlo simulation parameters
const SIMULATION_ITERATIONS = 5000
const SIMULATION_TIMEOUT_MS = 5000 // 5 seconds max

export function AutoTimetableGenerator({
  onAddClasses,
  existingClasses,
  onAddSearchedUnit,
}: AutoTimetableGeneratorProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("units")
  const [unitCodes, setUnitCodes] = useState<string[]>([])
  const [currentUnitCode, setCurrentUnitCode] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [unavailableBlocks, setUnavailableBlocks] = useState<UnavailableBlock[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [generatedClasses, setGeneratedClasses] = useState<SelectedClass[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [dayDistributionPreference, setDayDistributionPreference] = useState<PreferenceOption>("spread")
  const [simulationStats, setSimulationStats] = useState<{
    iterations: number
    bestScore: number
    timeElapsed: number
  } | null>(null)
  const [hasConflictsWithUnavailability, setHasConflictsWithUnavailability] = useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Update suggestions when input value changes
  const handleUnitCodeChange = (value: string) => {
    setCurrentUnitCode(value)

    if (value.length >= 2) {
      // Only show suggestions after at least 2 characters
      const filteredCodes = filterUnitCodes(value)
      setSuggestions(filteredCodes.slice(0, 5)) // Limit to exactly 5 results
    } else {
      setSuggestions([])
    }
  }

  // Add a unit to the list
  const handleAddUnit = () => {
    if (!currentUnitCode.trim()) return

    // Validate unit code format
    const unitCodePattern = /^[A-Za-z]{3}[0-9]{3}$/
    if (!unitCodePattern.test(currentUnitCode.trim())) {
      setError("Unit code must be 3 letters followed by 3 digits (e.g., CAB202)")
      return
    }

    const formattedUnitCode = currentUnitCode.trim().toUpperCase()

    // Check if unit is already in the list
    if (unitCodes.includes(formattedUnitCode)) {
      setError("This unit is already in your list")
      return
    }

    setUnitCodes([...unitCodes, formattedUnitCode])
    setCurrentUnitCode("")
    setSuggestions([])
    setError(null)
  }

  // Select a suggestion
  const handleSelectSuggestion = (code: string) => {
    setCurrentUnitCode(code)
    setSuggestions([])

    // Automatically add the unit after selecting from dropdown
    setTimeout(() => {
      const formattedUnitCode = code.trim().toUpperCase()

      // Check if unit is already in the list
      if (unitCodes.includes(formattedUnitCode)) {
        setError("This unit is already in your list")
        return
      }

      setUnitCodes([...unitCodes, formattedUnitCode])
      setCurrentUnitCode("")
      setError(null)
    }, 100)
  }

  // Remove a unit from the list
  const handleRemoveUnit = (unitCode: string) => {
    setUnitCodes(unitCodes.filter((code) => code !== unitCode))
  }

  // Handle unavailability changes from the TimeBlockSelector
  const handleUnavailabilityChange = useCallback((blocks: UnavailableBlock[]) => {
    setUnavailableBlocks(blocks)
  }, [])

  // Generate a timetable based on units and unavailabilities
  const handleGenerateTimetable = async () => {
    if (unitCodes.length === 0) {
      setError("Please add at least one unit")
      return
    }

    setIsGenerating(true)
    setError(null)
    setWarnings([])
    setSimulationStats(null)
    setHasConflictsWithUnavailability(false)

    try {
      // Collect all available classes for each unit
      const allClasses: Record<string, TimetableEntry[]> = {}
      const teachingPeriodId = "621052" // Default to Semester 2 2025 (All Campuses)

      for (const unitCode of unitCodes) {
        try {
          // Check cache for unit data
          const cachedData = checkCache(unitCode, teachingPeriodId)

          if (cachedData && cachedData.length > 0) {
            allClasses[unitCode] = cachedData
          } else {
            // If not in cache, fetch from API
            const response = await fetch("/api/timetable/search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                unitCode,
                teachingPeriodId,
              }),
            })

            const result = await response.json()

            if (result.error) {
              if (result.rateLimitExceeded) {
                throw new Error(
                  "Rate limit exceeded. You have used your 15 searches for today. Please try again tomorrow.",
                )
              }
              throw new Error(`Failed to fetch data for ${unitCode}: ${result.message}`)
            }

            if (result.data && result.data.length > 0) {
              allClasses[unitCode] = result.data
            } else {
              setWarnings((prev) => [...prev, `No classes found for ${unitCode}. This unit will be skipped.`])
            }
          }
        } catch (err) {
          setWarnings((prev) => [...prev, `Error fetching data for ${unitCode}. This unit will be skipped.`])
        }
      }

      // Check if we have any classes to work with
      if (Object.keys(allClasses).length === 0) {
        throw new Error("Could not fetch class data for any of the units. Please try again later.")
      }

      // Generate timetable with Monte Carlo simulation
      const result = generateTimetableWithMonteCarlo(
        allClasses,
        unavailableBlocks,
        existingClasses,
        dayDistributionPreference,
      )

      // Always set generated classes, even if there are warnings or conflicts
      setGeneratedClasses(result.classes)
      setIsComplete(true)
      setActiveTab("preview")

      // Set warnings and conflicts
      if (result.warnings.length > 0) {
        setWarnings((prev) => [...prev, ...result.warnings])
      }

      if (result.hasConflictsWithUnavailability) {
        setHasConflictsWithUnavailability(true)
      }

      // Set simulation stats
      setSimulationStats({
        iterations: result.iterations || 0,
        bestScore: result.score,
        timeElapsed: result.timeElapsed || 0,
      })

      // Only set error if there's a critical issue and no classes were generated
      if (!result.success && result.classes.length === 0) {
        setError(result.message || "Could not generate a valid timetable with your constraints")
      }

      // Check for class conflicts
      const hasClassConflicts = generatedClasses.some((cls1, i) =>
        generatedClasses.some((cls2, j) => i !== j && doClassesOverlap(cls1, cls2)),
      )

      if (hasClassConflicts) {
        setWarnings((prev) => [
          ...prev,
          "Some classes overlap with each other. This was allowed to include all required classes.",
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate timetable")

      // Even if there's an error, try to generate a basic timetable with whatever data we have
      try {
        const fallbackResult = generateFallbackTimetable(unitCodes)
        if (fallbackResult.classes.length > 0) {
          setGeneratedClasses(fallbackResult.classes)
          setIsComplete(true)
          setActiveTab("preview")
          setWarnings((prev) => [...prev, "Using a basic timetable due to errors. Some classes may be missing."])
        }
      } catch (fallbackErr) {
        console.error("Error generating fallback timetable:", fallbackErr)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  // Generate a basic fallback timetable when the main algorithm fails
  const generateFallbackTimetable = (unitCodes: string[]): { classes: SelectedClass[] } => {
    // This is a very simple fallback that just creates placeholder classes
    const fallbackClasses: SelectedClass[] = []

    // Create a simple placeholder timetable
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    const times = ["9:00am", "11:00am", "1:00pm", "3:00pm"]

    unitCodes.forEach((unitCode, i) => {
      const day = days[i % days.length]
      const startTime = times[i % times.length]
      const endTime = startTime.includes("9:00")
        ? "10:00am"
        : startTime.includes("11:00")
          ? "12:00pm"
          : startTime.includes("1:00")
            ? "2:00pm"
            : "4:00pm"

      fallbackClasses.push({
        id: `fallback-${unitCode}-lecture`,
        unitCode,
        activityType: "LEC",
        dayFormatted: day,
        startTime,
        endTime,
        location: "TBD",
        class: "Placeholder",
      })
    })

    return { classes: fallbackClasses }
  }

  // Update the handleApplyTimetable function to avoid state updates during rendering
  const handleApplyTimetable = () => {
    // Create a Set to track which units we've already processed
    const processedUnits = new Set<string>()

    // First add each unit to the recent searches in the sidebar
    // Do this BEFORE adding classes to ensure the sidebar is updated
    unitCodes.forEach((unitCode) => {
      // Create a unique key for this unit + teaching period combination
      const unitKey = `${unitCode}-621050`

      // Only process each unit once
      if (!processedUnits.has(unitKey) && onAddSearchedUnit) {
        processedUnits.add(unitKey)
        // Make sure to call this with the correct parameters
        onAddSearchedUnit(unitCode, "621052") // Default to Semester 2 2025
      }
    })

    // Group generated classes by unit code and activity type
    const classesByUnitAndType: Record<string, Record<string, SelectedClass>> = {}

    generatedClasses.forEach((cls) => {
      if (!classesByUnitAndType[cls.unitCode]) {
        classesByUnitAndType[cls.unitCode] = {}
      }

      // Only keep one class per activity type (the last one processed)
      classesByUnitAndType[cls.unitCode][cls.activityType] = cls
    })

    // Flatten the grouped classes back into an array
    const uniqueClasses: SelectedClass[] = []
    Object.values(classesByUnitAndType).forEach((activityTypes) => {
      Object.values(activityTypes).forEach((cls) => {
        uniqueClasses.push(cls)
      })
    })

    // Then add the classes to the timetable
    onAddClasses(uniqueClasses)

    // Use setTimeout to ensure toast is called after render is complete
    setTimeout(() => {
      toast({
        title: "Timetable Generated",
        description: `Added ${uniqueClasses.length} classes to your timetable.`,
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })
    }, 0)

    // Close the modal automatically after applying the timetable
    resetAndClose()
  }

  // Reset the form and close the modal
  const resetAndClose = () => {
    setUnitCodes([])
    setCurrentUnitCode("")
    setSuggestions([])
    setUnavailableBlocks([])
    setError(null)
    setWarnings([])
    setGeneratedClasses([])
    setIsComplete(false)
    setActiveTab("units")
    setIsOpen(false)
    setHasConflictsWithUnavailability(false)
    setSimulationStats(null)
  }

  // Generate a timetable using Monte Carlo simulation
  function generateTimetableWithMonteCarlo(
    allClasses: Record<string, TimetableEntry[]>,
    unavailableBlocks: UnavailableBlock[],
    existingClasses: SelectedClass[],
    preference: PreferenceOption,
  ): GenerationResult & { iterations?: number; timeElapsed?: number } {
    // Group classes by unit and activity type
    const classesByUnitAndType: Record<string, Record<string, TimetableEntry[]>> = {}
    const warnings: string[] = []
    let hasConflictsWithUnavailability = false

    // Process all classes
    Object.entries(allClasses).forEach(([unitCode, classes]) => {
      classesByUnitAndType[unitCode] = {}

      // Group by activity type
      classes.forEach((cls) => {
        if (!cls.activityType) return

        if (!classesByUnitAndType[unitCode][cls.activityType]) {
          classesByUnitAndType[unitCode][cls.activityType] = []
        }

        // Include all classes, even those that conflict with unavailable times
        classesByUnitAndType[unitCode][cls.activityType].push(cls)
      })
    })

    // Check if any activity type has no available classes
    const missingActivityTypes: { unitCode: string; activityType: string }[] = []

    for (const unitCode in classesByUnitAndType) {
      for (const activityType in classesByUnitAndType[unitCode]) {
        if (classesByUnitAndType[unitCode][activityType].length === 0) {
          missingActivityTypes.push({ unitCode, activityType })
        }
      }
    }

    if (missingActivityTypes.length > 0) {
      missingActivityTypes.forEach(({ unitCode, activityType }) => {
        warnings.push(`No ${activityType} classes found for ${unitCode}.`)
      })
    }

    // Prepare activity types for Monte Carlo simulation
    const unitActivities: Array<{
      unitCode: string
      activityType: string
      classes: TimetableEntry[]
      isLecture: boolean
    }> = []

    Object.entries(classesByUnitAndType).forEach(([unitCode, activityTypes]) => {
      Object.entries(activityTypes).forEach(([activityType, classes]) => {
        // Check if this is a lecture (lower priority for unavailability constraints)
        const isLecture = activityType.toLowerCase().includes("lec")

        unitActivities.push({
          unitCode,
          activityType,
          classes,
          isLecture,
        })
      })
    })

    // Monte Carlo simulation
    let bestSolution: SelectedClass[] = []
    let bestScore = Number.NEGATIVE_INFINITY
    let iterations = 0
    const startTime = Date.now()
    const endTime = startTime + SIMULATION_TIMEOUT_MS

    // Run simulation until timeout or max iterations
    while (iterations < SIMULATION_ITERATIONS && Date.now() < endTime) {
      iterations++

      // Generate a random timetable
      const solution = generateRandomTimetable(unitActivities, unavailableBlocks, preference)

      // Score the solution
      const score = scoreTimetable(solution, unitActivities, unavailableBlocks, preference)

      // Update best solution if this one is better
      if (score > bestScore) {
        bestScore = score
        bestSolution = [...solution]
      }
    }

    const timeElapsed = Date.now() - startTime

    // Check if the best solution has conflicts with unavailable times
    hasConflictsWithUnavailability = bestSolution.some((cls) => conflictsWithUnavailability(cls, unavailableBlocks))

    if (hasConflictsWithUnavailability) {
      warnings.push("Some classes had to be scheduled during your unavailable times.")

      // Identify which classes conflict with unavailable times
      bestSolution.forEach((cls) => {
        if (conflictsWithUnavailability(cls, unavailableBlocks)) {
          warnings.push(
            `${cls.unitCode} ${cls.activityType} on ${cls.dayFormatted} at ${cls.startTime} conflicts with your unavailable times.`,
          )
        }
      })
    }

    // Check if we have a complete solution (all activity types included)
    const includedActivities = new Set(bestSolution.map((cls) => `${cls.unitCode}-${cls.activityType}`))
    const allActivities = unitActivities.map((activity) => `${activity.unitCode}-${activity.activityType}`)
    const missingActivities = allActivities.filter((activity) => !includedActivities.has(activity))

    const isComplete = missingActivities.length === 0

    if (!isComplete) {
      warnings.push("Could not include all required classes in the timetable.")
      missingActivities.forEach((activity) => {
        const [unitCode, activityType] = activity.split("-")
        warnings.push(`Could not schedule ${activityType} for ${unitCode}.`)
      })
    }

    // If we couldn't find a solution, try to create a partial one
    if (bestSolution.length === 0) {
      const partialSolution = createPartialSolution(unitActivities, unavailableBlocks, preference)

      return {
        success: false,
        classes: partialSolution,
        message: "Could not create a complete timetable. Using best partial solution.",
        warnings: [
          ...warnings,
          "Some classes may conflict with each other or with your unavailable times.",
          "Review the timetable carefully and make manual adjustments if needed.",
        ],
        hasConflictsWithUnavailability: true,
        score: bestScore,
        iterations,
        timeElapsed,
      }
    }

    // Return the best solution found
    return {
      success: isComplete,
      classes: bestSolution,
      message: isComplete ? "" : "Could not include all required classes in the timetable.",
      warnings,
      hasConflictsWithUnavailability,
      score: bestScore,
      iterations,
      timeElapsed,
    }
  }

  // Generate a random timetable for Monte Carlo simulation
  function generateRandomTimetable(
    unitActivities: Array<{
      unitCode: string
      activityType: string
      classes: TimetableEntry[]
      isLecture: boolean
    }>,
    unavailableBlocks: UnavailableBlock[],
    preference: PreferenceOption,
  ): SelectedClass[] {
    const solution: SelectedClass[] = []

    // Keep track of occupied time slots to prevent stacking
    const occupiedSlots: Record<string, boolean> = {}

    // Shuffle the unit activities to try different combinations
    const shuffledActivities = [...unitActivities].sort(() => Math.random() - 0.5)

    // For each activity, try to find a class that doesn't conflict
    shuffledActivities.forEach(({ unitCode, activityType, classes, isLecture }) => {
      // For lectures, only select one per unit (allow multiple lecture options to clash)
      // Also check for virtual vs in-person alternatives
      if (isLecture || activityType.toLowerCase().includes("virtual")) {
        // Check if we already have a lecture or virtual class for this unit
        const existingLectureOrVirtual = solution.find(
          (cls) =>
            cls.unitCode === unitCode &&
            (cls.activityType.toLowerCase().includes("lec") || cls.activityType.toLowerCase().includes("virtual")),
        )
        if (existingLectureOrVirtual) {
          return // Skip this since we already have a lecture/virtual class for this unit
        }
      }

      // For other activity types, check if we already have a virtual or in-person version
      const baseActivityType = activityType.replace(/virtual/i, "").trim()
      const existingActivity = solution.find(
        (cls) =>
          cls.unitCode === unitCode &&
          (cls.activityType.toLowerCase() === activityType.toLowerCase() ||
            cls.activityType
              .toLowerCase()
              .replace(/virtual/i, "")
              .trim() === baseActivityType.toLowerCase()),
      )

      if (existingActivity && !isLecture && !activityType.toLowerCase().includes("virtual")) {
        return // Skip if we already have this activity type (virtual or in-person)
      }

      // Prioritize in-person classes over virtual ones (unless user prefers virtual)
      const shuffledClasses = [...classes].sort(() => Math.random() - 0.5)
      const prioritizedClasses = shuffledClasses.sort((a, b) => {
        const aIsVirtual = a.activityType.toLowerCase().includes("virtual")
        const bIsVirtual = b.activityType.toLowerCase().includes("virtual")

        // Prefer in-person over virtual (can be made configurable later)
        if (aIsVirtual !== bIsVirtual) {
          return aIsVirtual ? 1 : -1
        }

        const aConflictsWithUnavailable = conflictsWithUnavailability(a, unavailableBlocks)
        const bConflictsWithUnavailable = conflictsWithUnavailability(b, unavailableBlocks)

        // If one conflicts and the other doesn't, prioritize the non-conflicting one
        if (aConflictsWithUnavailable !== bConflictsWithUnavailable) {
          // For lectures, we give a smaller penalty for conflicts
          if (isLecture) {
            return aConflictsWithUnavailable ? 0.5 : -0.5
          }
          return aConflictsWithUnavailable ? 1 : -1
        }

        // Otherwise, randomize
        return Math.random() - 0.5
      })

      // Rest of the existing logic remains the same...

      // Shuffle the classes to try different options

      // Prioritize classes that don't conflict with unavailable times
      // For lectures, we're more flexible with unavailable times

      // First try to find a class without conflicts
      let classAdded = false
      // Try each class until we find one that doesn't conflict with existing selections
      for (const cls of prioritizedClasses) {
        // Create a unique key for this time slot
        const timeSlotKey = `${cls.dayFormatted}-${cls.startTime}-${cls.endTime}`

        // Check if this time slot is already occupied
        if (occupiedSlots[timeSlotKey]) {
          continue // Skip this class as the time slot is already taken
        }

        // For lectures, allow conflicts with other lectures but not with other activity types
        const hasConflict = solution.some((selectedCls) => {
          const overlap = doClassesOverlap(selectedCls, cls)
          if (!overlap) return false

          // If this is a lecture and it conflicts with another lecture, allow it
          if (isLecture && selectedCls.activityType.toLowerCase().includes("lec")) {
            return false // Don't consider lecture-lecture conflicts as blocking
          }

          return true // Block conflicts with non-lecture classes
        })

        if (!hasConflict) {
          // For non-lectures, mark this time slot as occupied
          if (!isLecture) {
            occupiedSlots[timeSlotKey] = true
          }

          // Add this class to the solution
          solution.push({
            ...cls,
            id: `${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.endTime}`,
          })
          classAdded = true
          break
        }
      }

      // If no non-conflicting class was found, add one with conflicts as a last resort
      // But for lectures, be more lenient about conflicts
      if (!classAdded && prioritizedClasses.length > 0) {
        // Choose the first class (already prioritized above)
        const cls = prioritizedClasses[0]

        // For lectures, always add even if there are conflicts
        // For other activities, only add if absolutely necessary
        if (isLecture || solution.filter((s) => s.unitCode === unitCode).length === 0) {
          // Add this class to the solution even though it conflicts
          solution.push({
            ...cls,
            id: `${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.endTime}`,
            hasConflict: !isLecture, // Don't mark lectures as having conflicts since they're allowed to clash
          })
        }
      }
    })

    return solution
  }

  // Score a timetable solution based on various criteria
  function scoreTimetable(
    solution: SelectedClass[],
    unitActivities: Array<{
      unitCode: string
      activityType: string
      classes: TimetableEntry[]
      isLecture: boolean
    }>,
    unavailableBlocks: UnavailableBlock[],
    preference: PreferenceOption,
  ): number {
    // Start with a base score
    let score = 0

    // 1. Completeness score - most important
    // Check how many activity types are included in the solution
    const includedActivities = new Set(solution.map((cls) => `${cls.unitCode}-${cls.activityType}`))
    const allActivities = unitActivities.map((activity) => `${activity.unitCode}-${activity.activityType}`)
    const completenessRatio = includedActivities.size / allActivities.length

    // Heavily weight completeness - we want all activities included
    score += completenessRatio * 1000

    // 2. Conflict score - penalize conflicts but allow them
    // Count how many classes conflict with each other, but exclude lecture-lecture conflicts
    // and virtual vs in-person alternatives
    let conflictCount = 0
    for (let i = 0; i < solution.length; i++) {
      for (let j = i + 1; j < solution.length; j++) {
        if (doClassesOverlap(solution[i], solution[j])) {
          // Don't penalize lecture-lecture conflicts
          const bothLectures =
            solution[i].activityType.toLowerCase().includes("lec") &&
            solution[j].activityType.toLowerCase().includes("lec")

          // Don't penalize virtual vs in-person conflicts for same activity
          const sameUnitAndActivity =
            solution[i].unitCode === solution[j].unitCode &&
            solution[i].activityType
              .toLowerCase()
              .replace(/virtual/i, "")
              .trim() ===
              solution[j].activityType
                .toLowerCase()
                .replace(/virtual/i, "")
                .trim()

          if (!bothLectures && !sameUnitAndActivity) {
            conflictCount++
          }
        }
      }
    }

    // Penalize conflicts, but less than missing classes entirely
    score -= conflictCount * 30

    // 3. Unavailability conflicts score
    // Count how many classes conflict with unavailable times
    const unavailabilityConflicts = solution.filter((cls) => conflictsWithUnavailability(cls, unavailableBlocks)).length

    // Penalize unavailability conflicts, but less for lectures
    const lectureConflicts = solution.filter(
      (cls) => cls.activityType.toLowerCase().includes("lec") && conflictsWithUnavailability(cls, unavailableBlocks),
    ).length

    const nonLectureConflicts = unavailabilityConflicts - lectureConflicts

    // Heavier penalty for non-lecture conflicts
    score -= nonLectureConflicts * 50
    score -= lectureConflicts * 20

    // 4. Day distribution score
    // Count classes per day
    const classesPerDay: Record<string, number> = {
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
    }

    solution.forEach((cls) => {
      if (cls.dayFormatted) {
        classesPerDay[cls.dayFormatted]++
      }
    })

    // Count days with classes
    const daysWithClasses = Object.values(classesPerDay).filter((count) => count > 0).length

    // Calculate day distribution score based on preference
    let dayDistributionScore = 0

    switch (preference) {
      case "spread":
        // Prefer more days with fewer classes per day
        dayDistributionScore = daysWithClasses * 10
        break
      case "balanced":
        // Balance between number of days and even distribution
        dayDistributionScore = daysWithClasses * 5

        // Calculate standard deviation of class counts (lower is better)
        const counts = Object.values(classesPerDay)
        const mean = counts.reduce((sum, count) => sum + count, 0) / 5
        const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / 5
        const stdDev = Math.sqrt(variance)

        // Penalize uneven distribution
        dayDistributionScore -= stdDev * 5
        break
      case "compact":
        // Prefer fewer days with more classes per day
        dayDistributionScore = (5 - daysWithClasses) * 10
        break
    }

    score += dayDistributionScore

    // 5. Gap minimization score
    // Calculate gaps between classes on the same day
    let totalGapHours = 0
    const daySchedules: Record<string, { start: number; end: number }[]> = {}

    solution.forEach((cls) => {
      const day = cls.dayFormatted
      if (!day) return

      if (!daySchedules[day]) {
        daySchedules[day] = []
      }

      const startHour = timeToHour(cls.startTime)
      const endHour = timeToHour(cls.endTime)

      daySchedules[day].push({
        start: startHour,
        end: endHour,
      })
    })

    // Calculate gaps for each day
    Object.values(daySchedules).forEach((schedules) => {
      if (schedules.length <= 1) return

      // Sort by start time
      schedules.sort((a, b) => a.start - b.start)

      // Calculate gaps
      for (let i = 1; i < schedules.length; i++) {
        const gap = schedules[i].start - schedules[i - 1].end
        if (gap > 0) {
          totalGapHours += gap
        }
      }
    })

    // Penalize gaps, but less for "spread" preference
    const gapPenalty = preference === "spread" ? 2 : preference === "balanced" ? 5 : 10
    score -= totalGapHours * gapPenalty

    return score
  }

  // Create a partial solution when Monte Carlo fails
  function createPartialSolution(
    unitActivities: Array<{
      unitCode: string
      activityType: string
      classes: TimetableEntry[]
      isLecture: boolean
    }>,
    unavailableBlocks: UnavailableBlock[],
    preference: PreferenceOption,
  ): SelectedClass[] {
    // Run multiple random attempts and take the best one
    let bestSolution: SelectedClass[] = []
    let bestScore = Number.NEGATIVE_INFINITY

    for (let i = 0; i < 100; i++) {
      const solution = generateRandomTimetable(unitActivities, unavailableBlocks, preference)
      const score = scoreTimetable(solution, unitActivities, unavailableBlocks, preference)

      if (score > bestScore) {
        bestScore = score
        bestSolution = [...solution]
      }
    }

    return bestSolution
  }

  return (
    <div>
      <div className="w-full flex justify-center sm:justify-start">
        <Button
          onClick={() => setIsOpen(true)}
          className="bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
        >
          <Wand2 className="mr-2 h-4 w-4" />
          Auto Generate Timetable
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-gray-900 transition-colors duration-300 rounded-xl mx-2 sm:mx-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-center">
              Auto Timetable Generator
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400 transition-colors duration-300 text-center">
              Enter your units and unavailable times to automatically generate an optimal timetable.
              <span className="block mt-1 text-amber-600 dark:text-amber-400 text-xs">
                Note: This feature is experimental and may not always create a perfect timetable.
              </span>
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid grid-cols-3 mb-4 w-full">
              <TabsTrigger
                value="units"
                className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm"
                disabled={isGenerating || isComplete}
              >
                1. Add Units
              </TabsTrigger>
              <TabsTrigger
                value="unavailability"
                className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm"
                disabled={isGenerating || isComplete || unitCodes.length === 0}
              >
                2. Set Unavailability
              </TabsTrigger>
              <TabsTrigger
                value="preview"
                className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 text-xs sm:text-sm"
                disabled={isGenerating || !isComplete}
              >
                3. Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="units" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-center block sm:text-left">
                    Add Units to Your Timetable
                  </Label>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                    <div className="flex-grow relative">
                      <Input
                        value={currentUnitCode}
                        onChange={(e) => handleUnitCodeChange(e.target.value)}
                        placeholder="Enter unit code (e.g. CAB202)"
                        className="w-full focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddUnit()
                          }
                        }}
                      />

                      {suggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-md">
                          {suggestions.map((code) => (
                            <div
                              key={code}
                              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm"
                              onClick={() => handleSelectSuggestion(code)}
                            >
                              {code}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleAddUnit}
                      className="bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300"
                    >
                      <Search className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Add Unit</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive" className="dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-center block sm:text-left">
                    Your Units
                  </Label>
                  <div className="min-h-[100px] p-4 border rounded-lg dark:border-gray-700">
                    {unitCodes.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400 text-center sm:text-left text-xs">
                        No units added yet. Add units above to get started.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {unitCodes.map((code) => (
                          <Badge
                            key={code}
                            className="bg-[#003A6E]/10 text-[#003A6E] dark:bg-blue-900/20 dark:text-blue-300 hover:bg-[#003A6E]/20 dark:hover:bg-blue-900/30 transition-colors duration-200 flex items-center"
                          >
                            {code}
                            <button
                              className="ml-1 rounded-full hover:bg-[#003A6E]/20 dark:hover:bg-blue-900/50 p-0.5"
                              onClick={() => handleRemoveUnit(code)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-center sm:justify-end gap-2">
                  <Button
                    onClick={() => setActiveTab("unavailability")}
                    className="bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300 w-full sm:w-auto"
                  >
                    <span className="hidden sm:inline">Set Unavailability</span>
                    <span className="sm:hidden">Next</span>
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="unavailability" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-center block sm:text-left">
                    Select Times When You&apos;re Unavailable
                  </Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
                    Tap and drag on the grid to mark times when you can&apos;t attend classes.
                  </p>

                  <div className="overflow-hidden">
                    <TimeBlockSelector onBlocksChange={handleUnavailabilityChange} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-center sm:justify-between">
                    <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-center">
                      Day Distribution Preference
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-gray-400 ml-2" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            <strong>Spread out:</strong> Classes distributed across more days with fewer per day
                          </p>
                          <p>
                            <strong>Balanced:</strong> Mix of days with varying class loads
                          </p>
                          <p>
                            <strong>Compact:</strong> Classes concentrated on fewer days with more per day
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div
                      className={`border rounded-lg p-3 cursor-pointer transition-all duration-200 ${
                        dayDistributionPreference === "spread"
                          ? "bg-[#003A6E]/10 border-[#003A6E] dark:bg-blue-900/30 dark:border-blue-700"
                          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                      onClick={() => setDayDistributionPreference("spread")}
                    >
                      <div className="font-medium text-sm text-center mb-2">Spread Out</div>
                      <div className="flex justify-center space-x-1">
                        {["M", "T", "W", "Th", "F"].map((day, i) => (
                          <div key={`spread-${day}-${i}`} className="w-5 h-10 bg-[#003A6E] dark:bg-blue-900 rounded" />
                        ))}
                      </div>
                      <div className="text-xs text-center mt-2 text-gray-500 dark:text-gray-400">
                        Classes across many days
                      </div>
                    </div>

                    <div
                      className={`border rounded-lg p-3 cursor-pointer transition-all duration-200 ${
                        dayDistributionPreference === "balanced"
                          ? "bg-[#003A6E]/10 border-[#003A6E] dark:bg-blue-900/30 dark:border-blue-700"
                          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                      onClick={() => setDayDistributionPreference("balanced")}
                    >
                      <div className="font-medium text-sm text-center mb-2">Balanced</div>
                      <div className="flex justify-center space-x-1">
                        {["M", "T", "W", "Th", "F"].map((day, i) => (
                          <div
                            key={`balanced-${day}-${i}`}
                            className={`w-5 h-10 rounded ${
                              i === 0 || i === 2 || i === 4
                                ? "bg-[#003A6E]/60 dark:bg-blue-900"
                                : "bg-[#003A6E]/20 dark:bg-blue-900/50"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-center mt-2 text-gray-500 dark:text-gray-400">
                        Balance between free days and workload
                      </div>
                    </div>

                    <div
                      className={`border rounded-lg p-3 cursor-pointer transition-all duration-200 ${
                        dayDistributionPreference === "compact"
                          ? "bg-[#003A6E]/10 border-[#003A6E] dark:bg-blue-900/30 dark:border-blue-700"
                          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                      onClick={() => setDayDistributionPreference("compact")}
                    >
                      <div className="font-medium text-sm text-center mb-2">Compact</div>
                      <div className="flex justify-center space-x-1">
                        {["M", "T", "W", "Th", "F"].map((day, i) => (
                          <div
                            key={`compact-${day}-${i}`}
                            className={`w-5 h-10 rounded ${
                              i === 1 || i === 2
                                ? "bg-[#003A6E]/80 dark:bg-blue-900 h-10"
                                : "bg-[#003A6E]/10 dark:bg-blue-900/50"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-center mt-2 text-gray-500 dark:text-gray-400">
                        Concentrate classes on fewer days
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-center sm:justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("units")}
                    className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 w-full sm:w-auto"
                  >
                    <span className="hidden sm:inline">Back to Units</span>
                    <span className="sm:hidden">Back</span>
                  </Button>
                  <Button
                    onClick={handleGenerateTimetable}
                    className="bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300 w-full sm:w-auto"
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span className="hidden sm:inline">Generating...</span>
                        <span className="sm:hidden">Loading...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Generate Timetable</span>
                        <span className="sm:hidden">Generate</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-center block sm:text-left">
                    Generated Timetable Preview
                  </Label>

                  {error && (
                    <Alert
                      variant="destructive"
                      className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
                    >
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {hasConflictsWithUnavailability && (
                    <Alert
                      variant="warning"
                      className="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Some classes had to be scheduled during your unavailable times. Review the timetable carefully.
                      </AlertDescription>
                    </Alert>
                  )}

                  {warnings.length > 0 && (
                    <div className="space-y-2">
                      {warnings.map((warning, index) => (
                        <Alert
                          key={index}
                          className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                        >
                          <Info className="h-4 w-4" />
                          <AlertDescription>{warning}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}

                  {simulationStats && (
                    <Alert className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        We generated {simulationStats.iterations} timetable combinations in{" "}
                        {Math.round(simulationStats.timeElapsed / 10) / 100} seconds just to find the best match for
                        you!
                      </AlertDescription>
                    </Alert>
                  )}

                  {generatedClasses.length > 0 ? (
                    <div className="border rounded-lg p-4 dark:border-gray-700 overflow-x-auto">
                      <h3 className="font-medium mb-2 text-center sm:text-left">Selected Classes:</h3>
                      <div className="space-y-2 min-w-[300px]">
                        {generatedClasses.map((cls) => {
                          // Check if this class conflicts with any other class (excluding lecture-lecture conflicts)
                          const conflictingClasses = generatedClasses.filter((otherCls) => {
                            if (otherCls.id === cls.id) return false
                            if (!doClassesOverlap(cls, otherCls)) return false

                            // Don't consider lecture-lecture conflicts as problematic
                            const bothLectures =
                              cls.activityType.toLowerCase().includes("lec") &&
                              otherCls.activityType.toLowerCase().includes("lec")
                            return !bothLectures
                          })
                          const hasTimeConflict = conflictingClasses.length > 0

                          return (
                            <div
                              key={cls.id}
                              className={`p-2 rounded-lg ${
                                conflictsWithUnavailability(cls, unavailableBlocks)
                                  ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                                  : hasTimeConflict
                                    ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
                                    : "bg-[#003A6E]/5 dark:bg-blue-900/20"
                              }`}
                            >
                              <div className="font-medium">
                                {cls.unitCode} - {cls.activityType}
                              </div>
                              <div className="text-sm">
                                {cls.dayFormatted} {cls.startTime} - {cls.endTime}
                              </div>
                              <div className="text-sm">{cls.location}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {extractWeeksInfo(cls.class)}
                              </div>
                              {conflictsWithUnavailability(cls, unavailableBlocks) && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Conflicts with your unavailable times
                                </div>
                              )}
                              {hasTimeConflict && (
                                <div className="text-xs text-purple-600 dark:text-purple-400 mt-1 flex items-center">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Conflicts with{" "}
                                  {conflictingClasses.map((c) => `${c.unitCode} ${c.activityType}`).join(", ")}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-lg p-4 dark:border-gray-700 text-center">
                      <p className="text-gray-500 dark:text-gray-400">
                        No classes could be generated with your constraints.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row justify-center sm:justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsComplete(false)
                      setActiveTab("unavailability")
                    }}
                    className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 w-full sm:w-auto"
                  >
                    <span className="hidden sm:inline">Back to Unavailability</span>
                    <span className="sm:hidden">Back</span>
                  </Button>
                  <Button
                    onClick={handleApplyTimetable}
                    className="bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300 w-full sm:w-auto"
                    disabled={generatedClasses.length === 0}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Apply to Timetable</span>
                    <span className="sm:hidden">Apply</span>
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="p-6 pt-2">
            <Button
              variant="outline"
              onClick={resetAndClose}
              className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 w-full sm:w-auto"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Helper function to check if a class conflicts with unavailable blocks
function conflictsWithUnavailability(classEntry: TimetableEntry, unavailableBlocks: UnavailableBlock[]): boolean {
  // Convert class time to hours
  const dayFormatted = classEntry.dayFormatted

  const startHour = timeToHour(classEntry.startTime)
  const endHour = timeToHour(classEntry.endTime)

  // Check if class time overlaps with any unavailable block
  return unavailableBlocks.some((block) => {
    return (
      block.day === dayFormatted &&
      ((startHour >= block.startHour && startHour < block.endHour) ||
        (endHour > block.startHour && endHour <= block.endHour) ||
        (startHour <= block.startHour && endHour >= block.endHour))
    )
  })
}

// Convert time string to hour number (e.g., "10:00am" -> 10)
function timeToHour(timeStr: string): number {
  const isPM = timeStr.toLowerCase().includes("pm")
  const [hourStr, minuteStr] = timeStr.replace(/[ap]m/i, "").split(":")

  let hour = Number.parseInt(hourStr, 10)
  const minute = Number.parseInt(minuteStr, 10) / 60 // Convert minutes to fraction of hour

  // Convert to 24-hour format
  if (isPM && hour < 12) hour += 12
  if (!isPM && hour === 12) hour = 0

  return hour + minute
}
