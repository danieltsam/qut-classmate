"use client"

import { useState, useEffect } from "react"
import { WeeklyTimetable } from "./weekly-timetable"
import { TimetableSidebar } from "./timetable-sidebar"
import type { TimetableEntry, SelectedClass } from "@/lib/types"
import { doClassesOverlap, extractWeeksInfo } from "@/lib/format-utils"
import { useToast } from "@/components/ui/use-toast"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { exportToICS } from "@/lib/export-utils"
import { Download, Calendar } from "lucide-react"
import { AutoTimetableGenerator } from "./auto-timetable-generator"

export function TimetableMaker() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [selectedClasses, setSelectedClasses] = useState<SelectedClass[]>([])
  const [hoveredClass, setHoveredClass] = useState<TimetableEntry | null>(null)
  const [searchedUnits, setSearchedUnits] = useState<{ unitCode: string; teachingPeriodId: string }[]>([])
  const [hoveredActivityType, setHoveredActivityType] = useState<{ type: string | null; unitCode: string | null }>({
    type: null,
    unitCode: null,
  })
  const [previewClasses, setPreviewClasses] = useState<TimetableEntry[]>([])

  // Check URL parameters for unit code
  useEffect(() => {
    const unitCode = searchParams.get("unitCode")
    if (unitCode) {
      // Add to searched units if not already there
      setSearchedUnits((prev) => {
        if (!prev.some((unit) => unit.unitCode === unitCode)) {
          return [...prev, { unitCode, teachingPeriodId: "621050" }] // Default to Semester 1 2025
        }
        return prev
      })
    }
  }, [searchParams])

  // Load selected classes from localStorage
  useEffect(() => {
    const savedClasses = localStorage.getItem("selectedClasses")
    if (savedClasses) {
      try {
        setSelectedClasses(JSON.parse(savedClasses))
      } catch (error) {
        console.error("Error loading saved classes:", error)
      }
    }
  }, [])

  // Load searched units from localStorage
  useEffect(() => {
    const savedUnits = localStorage.getItem("searchedUnits")
    if (savedUnits) {
      try {
        setSearchedUnits(JSON.parse(savedUnits))
      } catch (error) {
        console.error("Error loading saved units:", error)
      }
    }
  }, [])

  // Save selected classes to localStorage
  useEffect(() => {
    if (selectedClasses.length > 0) {
      localStorage.setItem("selectedClasses", JSON.stringify(selectedClasses))
    }
  }, [selectedClasses])

  // Handle class hover in sidebar
  const handleClassHover = (classEntry: TimetableEntry | null) => {
    setHoveredClass(classEntry)
  }

  // Handle activity type hover in sidebar
  const handleActivityTypeHover = (activityType: string | null, unitCode: string | null) => {
    setHoveredActivityType({ type: activityType, unitCode })

    // If hovering over an activity type, show all classes of that type
    if (activityType && unitCode) {
      // Find all classes of this activity type for this unit
      const matchingClasses = searchedUnits
        .filter((unit) => unit.unitCode === unitCode)
        .flatMap((unit) => {
          // Get classes from localStorage
          const cacheKey = `timetable-${unit.unitCode}-${unit.teachingPeriodId}`
          const cachedData = localStorage.getItem(cacheKey)
          if (cachedData) {
            try {
              const parsed = JSON.parse(cachedData)
              return parsed.data.filter((cls: TimetableEntry) => cls.activityType === activityType)
            } catch (error) {
              console.error("Error parsing cached data:", error)
              return []
            }
          }
          return []
        })

      setPreviewClasses(matchingClasses)
    } else {
      setPreviewClasses([])
    }
  }

  const handleClassToggle = (classEntry: TimetableEntry | SelectedClass, forceRemove = false) => {
    // Check if the class already has an ID (it's a SelectedClass)
    const id =
      "id" in classEntry
        ? classEntry.id
        : `${classEntry.unitCode}-${classEntry.activityType}-${classEntry.dayFormatted}-${classEntry.startTime}-${classEntry.endTime}-${classEntry.location}-${extractWeeksInfo(classEntry.class)}`

    // Check if the class is already selected
    const isSelected = selectedClasses.some((cls) => cls.id === id)

    if (isSelected || forceRemove) {
      // Remove the class - use the ID for reliable filtering
      setSelectedClasses((prevClasses) => {
        const updatedClasses = prevClasses.filter((cls) => cls.id !== id)

        // Save to localStorage immediately
        localStorage.setItem("selectedClasses", JSON.stringify(updatedClasses))

        return updatedClasses
      })

      toast({
        title: "Class Removed",
        description: `Removed ${classEntry.unitCode} ${classEntry.activityType} on ${classEntry.dayFormatted}`,
        duration: 3000,
      })
    } else {
      // Check if there's already a class of the same activity type for this unit
      const existingClassOfSameType = selectedClasses.find(
        (cls) => cls.unitCode === classEntry.unitCode && cls.activityType === classEntry.activityType,
      )

      if (existingClassOfSameType) {
        // Replace the existing class with the new one
        setSelectedClasses((prevClasses) => {
          const updatedClasses = prevClasses.filter((cls) => cls.id !== existingClassOfSameType.id)
          const newClass = {
            ...classEntry,
            id,
          } as SelectedClass

          const result = [...updatedClasses, newClass]

          // Save to localStorage immediately
          localStorage.setItem("selectedClasses", JSON.stringify(result))

          return result
        })

        toast({
          title: "Class Updated",
          description: `Updated ${classEntry.unitCode} ${classEntry.activityType} to ${classEntry.dayFormatted} ${classEntry.startTime}`,
          duration: 3000,
        })
      } else {
        // Check for conflicts with existing classes
        const conflictingClass = selectedClasses.find((cls) => doClassesOverlap(cls, classEntry))

        if (conflictingClass) {
          // Show warning toast but still allow adding
          toast({
            title: "Time Conflict",
            description: `This class conflicts with ${conflictingClass.unitCode} ${conflictingClass.activityType} on ${conflictingClass.dayFormatted}`,
            variant: "destructive",
            duration: 5000,
          })
        }

        // Add the class
        const newClass = {
          ...classEntry,
          id,
        } as SelectedClass

        setSelectedClasses((prevClasses) => {
          const updatedClasses = [...prevClasses, newClass]

          // Save to localStorage immediately
          localStorage.setItem("selectedClasses", JSON.stringify(updatedClasses))

          return updatedClasses
        })

        toast({
          title: "Class Added",
          description: `Added ${classEntry.unitCode} ${classEntry.activityType} on ${classEntry.dayFormatted}`,
          duration: 3000,
        })
      }
    }
  }

  // Handle adding a searched unit
  const handleAddSearchedUnit = (unitCode: string, teachingPeriodId: string) => {
    // Check if already in the list
    if (!searchedUnits.some((unit) => unit.unitCode === unitCode && unit.teachingPeriodId === teachingPeriodId)) {
      // Use functional update to ensure we're working with the latest state
      setSearchedUnits((prevUnits) => {
        // Create a Map to deduplicate units
        const uniqueUnitsMap = new Map()

        // Add existing units to the map
        prevUnits.forEach((unit) => {
          const key = `${unit.unitCode}-${unit.teachingPeriodId}`
          uniqueUnitsMap.set(key, unit)
        })

        // Add the new unit
        const newKey = `${unitCode}-${teachingPeriodId}`
        uniqueUnitsMap.set(newKey, { unitCode, teachingPeriodId })

        // Convert map values back to array
        const newUnits = Array.from(uniqueUnitsMap.values())

        // Save to localStorage for persistence
        try {
          localStorage.setItem("searchedUnits", JSON.stringify(newUnits))
        } catch (error) {
          console.error("Error saving searched units to localStorage:", error)
        }

        return newUnits
      })
    }
  }

  // Also update the handleAddClasses function to avoid calling toast during rendering
  const handleAddClasses = (classes: TimetableEntry[] | SelectedClass[]) => {
    // Extract unique unit codes from the classes
    const uniqueUnitCodes = [...new Set(classes.map((cls) => cls.unitCode))]

    // Add units to search history
    uniqueUnitCodes.forEach((unitCode) => {
      if (unitCode) {
        handleAddSearchedUnit(unitCode, "621050") // Default to Semester 1 2025
      }
    })

    // Add the classes to the timetable
    setSelectedClasses((prevClasses) => {
      // Create a map of existing classes by ID for quick lookup
      const existingClassesMap = new Map(prevClasses.map((cls) => [cls.id, cls]))

      // Process new classes
      const classesToAdd = classes.map((cls) => {
        // Generate ID if not already present
        const id =
          "id" in cls
            ? cls.id
            : `${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.endTime}-${cls.location}-${extractWeeksInfo(cls.class)}`

        // Ensure the class has an ID
        return { ...cls, id } as SelectedClass
      })

      // Combine existing and new classes, replacing any with the same ID
      classesToAdd.forEach((cls) => {
        existingClassesMap.set(cls.id, cls)
      })

      // Convert map back to array
      const updatedClasses = Array.from(existingClassesMap.values())

      // Save to localStorage
      localStorage.setItem("selectedClasses", JSON.stringify(updatedClasses))

      return updatedClasses
    })
  }

  // Handle export to ICS
  const handleExport = () => {
    if (selectedClasses.length > 0) {
      exportToICS(selectedClasses)
      toast({
        title: "Timetable Exported",
        description: "Your timetable has been exported as an .ics file.",
        duration: 5000,
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })
    } else {
      toast({
        title: "No Classes Selected",
        description: "Please select at least one class to export.",
        variant: "destructive",
        duration: 3000,
      })
    }
  }

  // Handle export to Google Calendar
  const handleExportToGoogle = () => {
    if (selectedClasses.length === 0) {
      toast({
        title: "No Classes Selected",
        description: "Please select at least one class to export.",
        variant: "destructive",
        duration: 3000,
      })
      return
    }

    // Create Google Calendar events
    const events = selectedClasses.map((cls) => {
      // Format date strings for Google Calendar
      const day = cls.dayFormatted
      const startTime = cls.startTime
      const endTime = cls.endTime
      const title = `${cls.unitCode} - ${cls.activityType}`
      const location = cls.location
      const description = `${cls.class}\nTeaching Staff: ${cls.teachingStaff || "N/A"}`

      // Create Google Calendar URL
      const baseUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      const eventUrl = `${baseUrl}&text=${encodeURIComponent(title)}&location=${encodeURIComponent(
        location,
      )}&details=${encodeURIComponent(description)}`

      return eventUrl
    })

    // Open the first event in a new tab
    if (events.length > 0) {
      window.open(events[0], "_blank")

      // Show toast with instructions for multiple events
      if (events.length > 1) {
        toast({
          title: "Multiple Classes",
          description: "You'll need to add each class separately. The first one has been opened.",
          duration: 5000,
        })
      }
    }
  }

  // Clear all selected classes
  const handleClearAll = () => {
    if (selectedClasses.length === 0) return

    if (confirm("Are you sure you want to clear all selected classes?")) {
      setSelectedClasses([])
      localStorage.removeItem("selectedClasses")
      toast({
        title: "Timetable Cleared",
        description: "All classes have been removed from your timetable.",
        duration: 3000,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-semibold text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
          Timetable Creator
        </h2>
        <div className="flex flex-wrap gap-2">
          <AutoTimetableGenerator
            onAddClasses={handleAddClasses}
            existingClasses={selectedClasses}
            onAddSearchedUnit={handleAddSearchedUnit}
          />

          <Button
            onClick={handleExport}
            variant="outline"
            className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
            disabled={selectedClasses.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Export (.ics)</span>
            <span className="sm:hidden">Export</span>
          </Button>

          <Button
            onClick={handleExportToGoogle}
            variant="outline"
            className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
            disabled={selectedClasses.length === 0}
          >
            <Calendar className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Google Calendar</span>
            <span className="sm:hidden">Google</span>
          </Button>

          {selectedClasses.length > 0 && (
            <Button
              onClick={handleClearAll}
              variant="outline"
              className="border-red-200 hover:bg-red-50 text-red-600 dark:border-red-800 dark:hover:bg-red-900/30 dark:text-red-400 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <TimetableSidebar
            onClassHover={handleClassHover}
            onClassToggle={handleClassToggle}
            onActivityTypeHover={handleActivityTypeHover}
            selectedClasses={selectedClasses}
            searchedUnits={searchedUnits}
            onAddSearchedUnit={handleAddSearchedUnit}
            onAddClasses={handleAddClasses}
          />
        </div>
        <div className="lg:col-span-2">
          {selectedClasses.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center justify-center sm:justify-start">
              <span className="inline-flex items-center">
                <span className="mr-1">💡</span> Tip: Click on any class in the timetable to remove it
              </span>
            </div>
          )}
          <WeeklyTimetable
            selectedClasses={selectedClasses}
            hoveredClass={hoveredClass}
            onClassToggle={handleClassToggle}
            previewClasses={previewClasses}
          />
        </div>
      </div>
    </div>
  )
}
