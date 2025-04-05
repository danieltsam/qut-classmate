"use client"

import { useState, useEffect } from "react"
import type { SelectedClass, TimetableEntry } from "@/lib/types"
import { WeeklyTimetable } from "./weekly-timetable"
import { TimetableSidebar } from "./timetable-sidebar"
import { Button } from "@/components/ui/button"
import { exportToICS } from "@/lib/export-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Download } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { doTimesOverlap, generateClassId } from "@/lib/format-utils"

export function TimetableMaker() {
  const { toast } = useToast()
  const [selectedClasses, setSelectedClasses] = useState<SelectedClass[]>([])
  const [hoveredClass, setHoveredClass] = useState<TimetableEntry | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])
  const [searchedUnits, setSearchedUnits] = useState<{ unitCode: string; teachingPeriodId: string }[]>([])

  // Show toast on first render
  useEffect(() => {
    toast({
      title: "Timetable Maker",
      description: "Hover over classes to see more details about them.",
      duration: 5000,
    })
  }, [toast])

  // Handle class hover for preview
  const handleClassHover = (classEntry: TimetableEntry | null) => {
    setHoveredClass(classEntry)
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

  // Check if a class conflicts with already selected classes
  const checkConflicts = (newClass: TimetableEntry): string[] => {
    const conflicts: string[] = []

    selectedClasses.forEach((selected) => {
      // Skip classes from the same unit and activity type
      if (selected.unitCode === newClass.unitCode && selected.activityType === newClass.activityType) {
        return
      }

      // Check for time overlap
      if (
        doTimesOverlap(
          selected.dayFormatted,
          selected.startTime,
          selected.endTime,
          newClass.dayFormatted,
          newClass.startTime,
          newClass.endTime,
        )
      ) {
        conflicts.push(
          `Conflicts with ${selected.unitCode} ${selected.classTitle || selected.activityType} on ${selected.dayFormatted} at ${selected.startTime}-${selected.endTime}`,
        )
      }
    })

    return conflicts
  }

  // Check if two classes are the same (same unit, activity, day, time, but potentially different modes)
  const isSameClass = (class1: TimetableEntry, class2: TimetableEntry): boolean => {
    return (
      class1.unitCode === class2.unitCode &&
      class1.activityType === class2.activityType &&
      class1.dayFormatted === class2.dayFormatted &&
      class1.startTime === class2.startTime &&
      class1.endTime === class2.endTime &&
      class1.class === class2.class // Include the class description to differentiate between online/on-campus
    )
  }

  // Toggle class selection (select if not selected, deselect if already selected)
  const toggleClass = (classEntry: TimetableEntry) => {
    // Generate a unique ID for this class
    const classId = generateClassId(classEntry)

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
      })
    } else {
      // Check for conflicts before selecting
      const newConflicts = checkConflicts(classEntry)
      setConflicts(newConflicts)

      if (newConflicts.length === 0) {
        // Remove any existing selection for the same unit and activity type
        const filteredClasses = selectedClasses.filter(
          (cls) => !(cls.unitCode === classEntry.unitCode && cls.activityType === classEntry.activityType),
        )

        // Add the new selection
        setSelectedClasses([
          ...filteredClasses,
          {
            ...classEntry,
            id: classId,
          },
        ])

        toast({
          title: "Class added",
          description: `${classEntry.unitCode} ${classEntry.classTitle || classEntry.activityType} has been added to your timetable.`,
          variant: "default",
        })
      }
    }
  }

  // Export the timetable to ICS
  const handleExport = () => {
    if (selectedClasses.length > 0) {
      exportToICS(selectedClasses)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1">
        <TimetableSidebar
          onClassHover={handleClassHover}
          onClassToggle={toggleClass}
          selectedClasses={selectedClasses}
          searchedUnits={searchedUnits}
          onAddSearchedUnit={addSearchedUnit}
        />
      </div>

      <div className="lg:col-span-3">
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
              <Button
                onClick={handleExport}
                variant="outline"
                size="sm"
                className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
              >
                <Download className="mr-2 h-4 w-4" />
                Export to Calendar (.ics)
              </Button>
            )}
          </div>

          <WeeklyTimetable selectedClasses={selectedClasses} hoveredClass={hoveredClass} onClassToggle={toggleClass} />
        </div>
      </div>
    </div>
  )
}

