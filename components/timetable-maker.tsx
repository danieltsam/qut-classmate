"use client"

import { useState, useEffect } from "react"
import type { SelectedClass, TimetableEntry } from "@/lib/types"
import { WeeklyTimetable } from "./weekly-timetable"
import { TimetableSidebar } from "./timetable-sidebar"
import { Button } from "@/components/ui/button"
import { exportToICS } from "@/lib/export-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Download, Calendar } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { doClassesOverlap, extractWeeksInfo, formatActivityType } from "@/lib/format-utils"

export function TimetableMaker() {
  const { toast } = useToast()
  const [selectedClasses, setSelectedClasses] = useState<SelectedClass[]>([])
  const [hoveredClass, setHoveredClass] = useState<TimetableEntry | null>(null)
  const [hoveredActivityType, setHoveredActivityType] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])
  const [searchedUnits, setSearchedUnits] = useState<{ unitCode: string; teachingPeriodId: string }[]>([])
  const [previewClasses, setPreviewClasses] = useState<TimetableEntry[]>([])
  const [toastShown, setToastShown] = useState(false)
  const [allClasses, setAllClasses] = useState<TimetableEntry[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Handle class hover
  const handleClassHover = (classEntry: TimetableEntry | null) => {
    setHoveredClass(classEntry)
  }

  // Remove the toast and just handle animation
  useEffect(() => {
    // Set loaded state after a small delay for animations
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 200)

    return () => clearTimeout(timer)
  }, [])

  // Check for class from Unit Search
  useEffect(() => {
    const storedEntry = localStorage.getItem("viewInTimetableMaker")
    if (storedEntry) {
      try {
        const entry = JSON.parse(storedEntry) as TimetableEntry
        toggleClass(entry)
        localStorage.removeItem("viewInTimetableMaker")
      } catch (error) {
        console.error("Error parsing stored entry:", error)
      }
    }
  }, [])

  // Update the handleActivityTypeHover function to fix the filtering logic
  // and add more detailed debugging

  // Handle activity type hover for preview
  const handleActivityTypeHover = (activityType: string | null, unitCode: string | null) => {
    setHoveredActivityType(activityType)

    if (activityType && unitCode) {
      // Filter classes by activity type and unit code
      const matchingClasses = allClasses.filter((cls) => {
        // Normalize strings for comparison (trim whitespace and convert to uppercase)
        const clsActivityType = cls.activityType?.trim().toUpperCase()
        const clsUnitCode = cls.unitCode?.trim().toUpperCase()
        const targetActivityType = activityType.trim().toUpperCase()
        const targetUnitCode = unitCode.trim().toUpperCase()

        return clsActivityType === targetActivityType && clsUnitCode === targetUnitCode
      })

      setPreviewClasses(matchingClasses)
    } else {
      setPreviewClasses([])
    }
  }

  // Add a searched unit to the history
  const addSearchedUnit = (unitCode: string, teachingPeriodId: string) => {
    // Check if this unit is already in the history
    const exists = searchedUnits.some(
      (unit) => unit.unitCode === unitCode && unit.teachingPeriodId === teachingPeriodId,
    )

    if (!exists) {
      setSearchedUnits((prev) => [
        { unitCode, teachingPeriodId },
        ...prev.filter((unit) => unit.unitCode !== unitCode || unit.teachingPeriodId !== teachingPeriodId),
      ])
    }
  }

  // Add classes to the all classes collection
  const addClasses = (classes: TimetableEntry[]) => {
    setAllClasses((prev) => {
      const newClasses = [...prev]

      // Add only classes that don't already exist
      classes.forEach((cls) => {
        const exists = newClasses.some(
          (existing) =>
            existing.unitCode === cls.unitCode &&
            existing.activityType === cls.activityType &&
            existing.dayFormatted === cls.dayFormatted &&
            existing.startTime === cls.startTime &&
            existing.class === cls.class, // Include class description to differentiate between online/on-campus
        )

        if (!exists) {
          newClasses.push(cls)
        }
      })

      console.log(`All classes collection now has ${newClasses.length} classes`)
      return newClasses
    })
  }

  // Check if a class conflicts with already selected classes
  const checkConflicts = (newClass: TimetableEntry): string[] => {
    const conflicts: string[] = []

    selectedClasses.forEach((selected) => {
      // Skip classes from the same unit and activity type
      if (selected.unitCode === newClass.unitCode && selected.activityType === newClass.activityType) {
        return
      }

      // Check for time and week overlap
      if (doClassesOverlap(selected, newClass)) {
        const selectedWeeks = extractWeeksInfo(selected.class)
        const newClassWeeks = extractWeeksInfo(newClass.class)

        conflicts.push(
          `Conflicts with ${selected.unitCode} ${selected.classTitle || selected.activityType} on ${selected.dayFormatted} at ${selected.startTime}-${selected.endTime} (${selectedWeeks} overlaps with ${newClassWeeks})`,
        )
      }
    })

    return conflicts
  }

  // Generate a unique ID for a class entry
  const generateUniqueClassId = (classEntry: TimetableEntry): string => {
    // Extract week information to include in the ID
    const weekInfo = extractWeeksInfo(classEntry.class)

    return `${classEntry.unitCode}-${classEntry.activityType}-${classEntry.dayFormatted}-${classEntry.startTime}-${classEntry.endTime}-${classEntry.location}-${weekInfo}`
  }

  // Check if two classes are the same (same unit, activity, day, time, location, and class description)
  const isSameClass = (class1: TimetableEntry, class2: TimetableEntry): boolean => {
    return (
      class1.unitCode === class2.unitCode &&
      class1.activityType === class2.activityType &&
      class1.dayFormatted === class2.dayFormatted &&
      class1.startTime === class2.startTime &&
      class1.endTime === class2.endTime &&
      class1.location === class2.location &&
      extractWeeksInfo(class1.class) === extractWeeksInfo(class2.class) // Compare week information
    )
  }

  // Toggle class selection (select if not selected, deselect if already selected)
  const toggleClass = (classEntry: TimetableEntry) => {
    // Generate a unique ID for this class
    const classId = generateUniqueClassId(classEntry)

    // Check if this class is already selected
    const isSelected = selectedClasses.some((cls) => isSameClass(cls, classEntry))

    if (isSelected) {
      // Deselect the class
      setSelectedClasses(selectedClasses.filter((cls) => !isSameClass(cls, classEntry)))
      setConflicts([])

      toast({
        title: "Class removed",
        description: `${classEntry.unitCode} ${classEntry.classTitle || classEntry.activityType} has been removed from your timetable.`,
        variant: "default",
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })
    } else {
      // Check for conflicts before selecting
      const newConflicts = checkConflicts(classEntry)

      // Check if a class with the same activity type and unit code is already selected
      const duplicateActivityType = selectedClasses.find(
        (cls) =>
          cls.unitCode === classEntry.unitCode &&
          cls.activityType === classEntry.activityType &&
          !isSameClass(cls, classEntry),
      )

      // Add the new selection (without removing existing classes of the same type)
      setSelectedClasses([
        ...selectedClasses,
        {
          ...classEntry,
          id: classId,
        },
      ])

      // Set conflicts if any (but still allow the class to be added)
      if (newConflicts.length > 0) {
        setConflicts(newConflicts)

        toast({
          title: "Time Conflict Warning",
          description:
            "This class conflicts with other classes in your timetable. You can still add it, but be aware of the overlap.",
          variant: "destructive",
          duration: 15000,
        })
      } else {
        setConflicts([])
      }

      // Show warning if duplicate activity type
      if (duplicateActivityType) {
        toast({
          title: "Duplicate Activity Type",
          description: `You've added another ${formatActivityType(classEntry.activityType)} for ${classEntry.unitCode}. This is unusual but allowed.`,
          variant: "warning",
          duration: 15000,
        })
      } else {
        toast({
          title: "Class added",
          description: `${classEntry.unitCode} ${classEntry.classTitle || classEntry.activityType} has been added to your timetable.`,
          variant: "default",
          className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
        })
      }
    }
  }

  // Export the timetable to ICS
  const handleExport = () => {
    if (selectedClasses.length > 0) {
      exportToICS(selectedClasses)
      toast({
        title: "Timetable Exported",
        description: "Your timetable has been exported as an .ics file.",
        duration: 3000,
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })
    }
  }

  // Export to Google Calendar
  const handleGoogleCalendarExport = () => {
    if (selectedClasses.length === 0) return

    // Create a base URL for Google Calendar
    const baseUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE"

    // Open a new window for each class
    selectedClasses.forEach((cls, index) => {
      // Format date for Google Calendar
      const startDate = new Date()
      const dayMap: Record<string, number> = {
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        Sunday: 0,
      }

      // Set to next occurrence of the day
      const currentDay = startDate.getDay()
      const targetDay = dayMap[cls.dayFormatted]
      let daysToAdd = targetDay - currentDay
      if (daysToAdd <= 0) daysToAdd += 7

      startDate.setDate(startDate.getDate() + daysToAdd)

      // Parse time
      const [hourStr, minuteStr] = cls.startTime.replace(/[ap]m/i, "").split(":")
      const [endHourStr, endMinuteStr] = cls.endTime.replace(/[ap]m/i, "").split(":")

      let hour = Number.parseInt(hourStr)
      const minute = Number.parseInt(minuteStr)
      let endHour = Number.parseInt(endHourStr)
      const endMinute = Number.parseInt(endMinuteStr)

      // Convert to 24-hour format
      if (cls.startTime.toLowerCase().includes("pm") && hour < 12) hour += 12
      if (cls.startTime.toLowerCase().includes("am") && hour === 12) hour = 0
      if (cls.endTime.toLowerCase().includes("pm") && endHour < 12) endHour += 12
      if (cls.endTime.toLowerCase().includes("am") && endHour === 12) endHour = 0

      // Format dates for Google Calendar
      const startDateTime = new Date(startDate)
      startDateTime.setHours(hour, minute, 0, 0)

      const endDateTime = new Date(startDate)
      endDateTime.setHours(endHour, endMinute, 0, 0)

      // Format as ISO strings and remove timezone part
      const start = startDateTime
        .toISOString()
        .replace(/\.\d{3}Z$/, "")
        .replace(/[-:]/g, "")
      const end = endDateTime
        .toISOString()
        .replace(/\.\d{3}Z$/, "")
        .replace(/[-:]/g, "")

      // Get weeks information
      const weeksInfo = extractWeeksInfo(cls.class)

      // Create Google Calendar URL for this class
      let url = `${baseUrl}&text=${encodeURIComponent(`${cls.unitCode} - ${cls.classTitle || cls.activityType}`)}`
      url += `&dates=${start}/${end}`
      url += `&location=${encodeURIComponent(cls.location)}`
      url += `&details=${encodeURIComponent(`${cls.class}
Teaching Staff: ${cls.teachingStaff}
${weeksInfo}`)}`

      // Open in a new tab with a slight delay to prevent popup blocking
      setTimeout(() => {
        window.open(url, `_blank${index}`)
      }, index * 300)
    })

    toast({
      title: "Google Calendar Export",
      description: `${selectedClasses.length} classes have been exported to Google Calendar. Please check your browser for popup windows.`,
      duration: 5000,
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div
        className={`lg:col-span-1 transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-x-(-4)"}`}
      >
        <TimetableSidebar
          onClassHover={handleClassHover}
          onClassToggle={toggleClass}
          onActivityTypeHover={handleActivityTypeHover}
          selectedClasses={selectedClasses}
          searchedUnits={searchedUnits}
          onAddSearchedUnit={addSearchedUnit}
          onAddClasses={addClasses}
        />
      </div>

      <div
        className={`lg:col-span-3 transition-all duration-500 ${isLoaded ? "opacity-100 transform-none" : "opacity-0 translate-x-4"}`}
      >
        <div className="space-y-4">
          {conflicts.length > 0 && (
            <Alert
              variant="destructive"
              className="dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 rounded-lg shadow-md animate-in fade-in-50 duration-300"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-1">Time conflicts detected:</div>
                <ul className="list-disc pl-5 text-sm">
                  {conflicts.map((conflict, index) => (
                    <li key={index}>{conflict}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
              Your Timetable
            </h2>
            {selectedClasses.length > 0 && (
              <div className="flex space-x-2 animate-in slide-in-from-right-5 duration-300">
                <Button
                  onClick={handleGoogleCalendarExport}
                  variant="outline"
                  size="sm"
                  className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Add to Google Calendar
                </Button>
                <Button
                  onClick={handleExport}
                  variant="outline"
                  size="sm"
                  className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export (.ics)
                </Button>
              </div>
            )}
          </div>

          <div className="animate-in fade-in-50 slide-in-from-bottom-5 duration-500">
            <WeeklyTimetable
              selectedClasses={selectedClasses}
              hoveredClass={hoveredClass}
              onClassToggle={toggleClass}
              previewClasses={previewClasses}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
