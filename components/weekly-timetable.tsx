"use client"

import type { TimetableEntry, SelectedClass } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { formatActivityType, extractWeeksInfo, doClassesOverlap } from "@/lib/format-utils"
import { useMediaQuery } from "@/hooks/use-mobile"
import React, { useState } from "react"

interface WeeklyTimetableProps {
  selectedClasses: SelectedClass[]
  hoveredClass: TimetableEntry | null
  onClassToggle: (classEntry: TimetableEntry | SelectedClass, isRemoval?: boolean) => void
  previewClasses?: TimetableEntry[]
}

// Days of the week (Monday to Friday)
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

// Time slots from 8am to 10pm
const timeSlots = Array.from({ length: 15 }, (_, i) => i + 8)

export function WeeklyTimetable({
  selectedClasses,
  hoveredClass,
  onClassToggle,
  previewClasses = [],
}: WeeklyTimetableProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [showScrollMessage, setShowScrollMessage] = useState(true)

  // Hide scroll message after 30 seconds
  React.useEffect(() => {
    if (isMobile) {
      const timer = setTimeout(() => {
        setShowScrollMessage(false)
      }, 30000)

      return () => clearTimeout(timer)
    }
  }, [isMobile])

  // Function to convert time string to hour number (e.g., "10:00am" -> 10)
  const timeToHour = (timeStr: string): number => {
    const isPM = timeStr.toLowerCase().includes("pm")
    const [hourStr, minuteStr] = timeStr.replace(/[ap]m/i, "").split(":")

    let hour = Number.parseInt(hourStr, 10)
    const minute = Number.parseInt(minuteStr, 10)

    // Convert to 24-hour format
    if (isPM && hour < 12) hour += 12
    if (!isPM && hour === 12) hour = 0

    return hour
  }

  // Function to convert time string to minutes past the hour (e.g., "10:30am" -> 30)
  const timeToMinutes = (timeStr: string): number => {
    const [_, minuteStr] = timeStr.replace(/[ap]m/i, "").split(":")
    return Number.parseInt(minuteStr, 10)
  }

  // Calculate position and height for a class entry
  const calculateClassPosition = (classEntry: TimetableEntry | SelectedClass) => {
    const startHour = timeToHour(classEntry.startTime)
    const endHour = timeToHour(classEntry.endTime)
    const startMinutes = timeToMinutes(classEntry.startTime)
    const endMinutes = timeToMinutes(classEntry.endTime)

    // Calculate top position (percentage of the hour)
    const topOffset = (startMinutes / 60) * 100

    // Calculate height (in percentage of hours)
    const durationHours = endHour - startHour + (endMinutes - startMinutes) / 60
    const height = durationHours * 100

    return {
      top: `${topOffset}%`,
      height: `${height}%`,
    }
  }

  // Extract class mode (Online/On Campus)
  const getClassMode = (entry: TimetableEntry | SelectedClass): string => {
    const classInfo = entry.class.toLowerCase()
    if (classInfo.includes("online")) return "Online"
    if (classInfo.includes("on campus") || classInfo.includes("internal")) return "On Campus"
    return ""
  }

  // Get color for unit
  const getUnitColor = (unitCode: string): { bg: string; border: string; text: string } => {
    // Generate a consistent color based on the unit code
    const colors = [
      { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800" },
      { bg: "bg-green-100", border: "border-green-300", text: "text-green-800" },
      { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800" },
      { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800" },
      { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-800" },
      { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800" },
      { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
      { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800" },
      { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-800" },
      { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
      { bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-800" },
      { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
    ]

    // Dark mode variants
    const darkColors = [
      { bg: "dark:bg-blue-900/50", border: "dark:border-blue-700", text: "dark:text-blue-300" },
      { bg: "dark:bg-green-900/50", border: "dark:border-green-700", text: "dark:text-green-300" },
      { bg: "dark:bg-purple-900/50", border: "dark:border-purple-700", text: "dark:text-purple-300" },
      { bg: "dark:bg-amber-900/50", border: "dark:border-amber-700", text: "dark:text-amber-300" },
      { bg: "dark:bg-pink-900/50", border: "dark:border-pink-700", text: "dark:text-pink-300" },
      { bg: "dark:bg-cyan-900/50", border: "dark:border-cyan-700", text: "dark:text-cyan-300" },
      { bg: "dark:bg-indigo-900/50", border: "dark:border-indigo-700", text: "dark:text-indigo-300" },
      { bg: "dark:bg-rose-900/50", border: "dark:border-rose-700", text: "dark:text-rose-300" },
      { bg: "dark:bg-teal-900/50", border: "dark:border-teal-700", text: "dark:text-teal-300" },
      { bg: "dark:bg-orange-900/50", border: "dark:border-orange-700", text: "dark:text-orange-300" },
      { bg: "dark:bg-lime-900/50", border: "dark:border-lime-700", text: "dark:text-lime-300" },
      { bg: "dark:bg-emerald-900/50", border: "dark:border-emerald-700", text: "dark:text-emerald-300" },
    ]

    // Use a hash function to get a consistent index
    const hash = unitCode.split("").reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)

    const index = Math.abs(hash) % colors.length

    return {
      bg: `${colors[index].bg} ${darkColors[index].bg}`,
      border: `${colors[index].border} ${darkColors[index].border}`,
      text: `${colors[index].text} ${darkColors[index].text}`,
    }
  }

  // Detect overlapping classes for a specific day and hour
  const getOverlappingClasses = (day: string, hour: number, classes: (SelectedClass | TimetableEntry)[]) => {
    // Filter classes that start at this hour on this day
    const classesAtHour = classes.filter((cls) => cls.dayFormatted === day && timeToHour(cls.startTime) === hour)

    // If there's only one or no class, no need for special handling
    if (classesAtHour.length <= 1) return []

    // Group classes by unit code
    const groupedByUnit: Record<string, (SelectedClass | TimetableEntry)[]> = {}

    classesAtHour.forEach((cls) => {
      const key = cls.unitCode || "unknown"
      if (!groupedByUnit[key]) {
        groupedByUnit[key] = []
      }
      groupedByUnit[key].push(cls)
    })

    // For each unit, group classes by activity type
    const unitGroups: (SelectedClass | TimetableEntry)[][] = []

    Object.values(groupedByUnit).forEach((unitClasses) => {
      // Group by activity type within this unit
      const activityGroups: Record<string, (SelectedClass | TimetableEntry)[]> = {}

      unitClasses.forEach((cls) => {
        const key = cls.activityType || "unknown"
        if (!activityGroups[key]) {
          activityGroups[key] = []
        }
        activityGroups[key].push(cls)
      })

      // If there's more than one activity type for this unit, add them as a group
      if (Object.keys(activityGroups).length > 1) {
        const allClassesForUnit: (SelectedClass | TimetableEntry)[] = []
        Object.values(activityGroups).forEach((group) => {
          allClassesForUnit.push(...group)
        })
        unitGroups.push(allClassesForUnit)
      }
    })

    // Now check for overlaps between different units
    const overlappingGroups: (SelectedClass | TimetableEntry)[][] = [...unitGroups]

    // Create a flat list of all classes that are not part of a unit group
    const remainingClasses = classesAtHour.filter(
      (cls) => !unitGroups.some((group) => group.some((g) => g.id === (cls as SelectedClass).id)),
    )

    // Check each remaining class against others for time overlaps
    const processedIds = new Set<string>()

    remainingClasses.forEach((cls) => {
      if (processedIds.has((cls as SelectedClass).id)) return

      const overlappingClasses: (SelectedClass | TimetableEntry)[] = [cls]
      processedIds.add((cls as SelectedClass).id)

      remainingClasses.forEach((otherCls) => {
        if ((cls as SelectedClass).id === (otherCls as SelectedClass).id) return
        if (processedIds.has((otherCls as SelectedClass).id)) return

        // Check if they overlap in time and weeks, ignoring activity type
        if (doClassesOverlap(cls, otherCls, true)) {
          overlappingClasses.push(otherCls)
          processedIds.add((otherCls as SelectedClass).id)
        }
      })

      if (overlappingClasses.length > 1) {
        overlappingGroups.push(overlappingClasses)
      }
    })

    return overlappingGroups
  }

  // Merge classes with the same details but different weeks
  const mergeClassesByWeek = (classes: SelectedClass[]): SelectedClass[] => {
    const mergedClassesMap = new Map<string, SelectedClass>()

    classes.forEach((cls) => {
      // Create a key that identifies the class without the week information
      const key = `${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.endTime}-${cls.location}`

      if (mergedClassesMap.has(key)) {
        // If we already have this class, extract the week info from both and combine
        const existingClass = mergedClassesMap.get(key)!
        const existingWeekInfo = extractWeeksInfo(existingClass.class)
        const newWeekInfo = extractWeeksInfo(cls.class)

        // Only merge if the weeks are different
        if (existingWeekInfo !== newWeekInfo) {
          // Create a combined class description with merged week information
          const combinedClass = {
            ...existingClass,
            class: existingClass.class.replace(existingWeekInfo, combineWeekInfo(existingWeekInfo, newWeekInfo)),
          }
          mergedClassesMap.set(key, combinedClass)
        }
      } else {
        // If this is the first time we're seeing this class, add it to the map
        mergedClassesMap.set(key, cls)
      }
    })

    return Array.from(mergedClassesMap.values())
  }

  // Helper function to combine week information
  const combineWeekInfo = (week1: string, week2: string): string => {
    // Extract just the week numbers from strings like "Week 9" or "Weeks 1-13" or "Weeks 3 & 7"
    const extractNumbers = (weekStr: string): number[] => {
      const numbers: number[] = []

      // Handle ranges like "Weeks 1-13"
      const rangeMatch = weekStr.match(/Weeks\s+(\d+)-(\d+)/i)
      if (rangeMatch) {
        const start = Number.parseInt(rangeMatch[1])
        const end = Number.parseInt(rangeMatch[2])
        for (let i = start; i <= end; i++) {
          numbers.push(i)
        }
        return numbers
      }

      // Handle single weeks like "Week 9"
      const singleMatch = weekStr.match(/Week\s+(\d+)/i)
      if (singleMatch) {
        numbers.push(Number.parseInt(singleMatch[1]))
        return numbers
      }

      // Handle comma-separated or ampersand-separated weeks like "Weeks 1, 3, 5" or "Weeks 3 & 7"
      const commaMatch = weekStr.match(/Weeks\s+([\d,\s&]+)/i)
      if (commaMatch) {
        // Split by both commas and ampersands
        const weekNumbers = commaMatch[1].split(/[,&]/).map((w) => Number.parseInt(w.trim()))
        return weekNumbers.filter((w) => !isNaN(w))
      }

      return numbers
    }

    // Extract week numbers from both strings
    const numbers1 = extractNumbers(week1)
    const numbers2 = extractNumbers(week2)

    // Combine and sort all week numbers
    const allNumbers = [...new Set([...numbers1, ...numbers2])].sort((a, b) => a - b)

    // If we have no numbers, return the original
    if (allNumbers.length === 0) return week1

    // Format the combined week information
    if (allNumbers.length === 1) {
      return `Week ${allNumbers[0]}`
    } else {
      return `Weeks ${allNumbers.join(" & ")}`
    }
  }

  return (
    <Card className="h-full border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md transition-all duration-300 hover:shadow-lg sticky top-4 z-10 w-full max-h-[85vh] overflow-hidden">
      <CardContent className="p-2 sm:p-3 dark:bg-gray-900 transition-colors duration-300 overflow-y-auto h-full max-h-[calc(85vh-2rem)]">
        <div className={`pb-2 max-w-full h-full ${isMobile ? "overflow-x-auto" : "overflow-x-hidden"}`}>
          {isMobile && showScrollMessage && (
            <div className="text-xs text-center text-gray-500 dark:text-gray-400 mb-2 animate-pulse bg-gray-100 dark:bg-gray-800 p-2 rounded-md mx-auto">
              ← Scroll horizontally to see all days →
            </div>
          )}
          <div className={isMobile ? "min-w-[700px] max-w-[700px]" : "w-full"}>
            {/* Header row with days - sticky on mobile */}
            <div className="sticky top-0 z-20 grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1 bg-white dark:bg-gray-900 pt-1">
              <div className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-1 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md text-sm select-none">
                Time
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-1 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md text-sm select-none"
                >
                  {isMobile ? day.substring(0, 3) : day}
                </div>
              ))}
            </div>

            {/* Time slots */}
            {timeSlots.map((hour) => (
              <div key={hour} className="grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1">
                <div className="bg-[#003A6E]/5 dark:bg-blue-900/20 p-1 text-center text-xs text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md">
                  {hour % 12 || 12}
                  {hour >= 12 ? "pm" : "am"}
                </div>

                {days.map((day) => (
                  <div
                    key={`${day}-${hour}`}
                    className="relative min-h-[50px] bg-gray-50 dark:bg-gray-800 transition-colors duration-300 rounded-md"
                  >
                    {/* Render selected classes */}
                    {mergeClassesByWeek(selectedClasses).map((cls) => {
                      // Only render at the starting hour
                      if (cls.dayFormatted === day && timeToHour(cls.startTime) === hour) {
                        const position = calculateClassPosition(cls)
                        const colors = getUnitColor(cls.unitCode)
                        const classMode = getClassMode(cls)
                        const weeksInfo = extractWeeksInfo(cls.class)
                        const activityTypeFull = formatActivityType(cls.activityType)

                        // Find overlapping classes
                        const overlappingGroups = getOverlappingClasses(day, hour, mergeClassesByWeek(selectedClasses))
                        const isOverlapping = overlappingGroups.some((group) =>
                          group.some((overlapCls) => overlapCls.id === cls.id),
                        )

                        // Find which group this class belongs to
                        const overlapGroupIndex = overlappingGroups.findIndex((group) =>
                          group.some((overlapCls) => overlapCls.id === cls.id),
                        )

                        // Find position in the group
                        const positionInGroup =
                          overlapGroupIndex >= 0
                            ? overlappingGroups[overlapGroupIndex].findIndex((overlapCls) => overlapCls.id === cls.id)
                            : 0

                        // Calculate width and left offset for overlapping classes
                        const totalInGroup = overlapGroupIndex >= 0 ? overlappingGroups[overlapGroupIndex].length : 1
                        const widthPercentage = isOverlapping ? 100 / totalInGroup : 100
                        const leftOffset = isOverlapping ? positionInGroup * widthPercentage : 0

                        return (
                          <TooltipProvider key={cls.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={`absolute rounded-md border ${colors.bg} ${colors.border} ${colors.text} p-1 overflow-hidden text-xs cursor-pointer transition-all duration-200 hover:shadow-md animate-in fade-in-50 shadow-sm ${isOverlapping ? "border-dashed" : ""}`}
                                  style={{
                                    top: position.top,
                                    height: position.height,
                                    width: isOverlapping ? `calc(${widthPercentage}% - 4px)` : "calc(100% - 4px)",
                                    left: isOverlapping ? `${leftOffset}%` : "2px",
                                    zIndex: 10,
                                  }}
                                  onClick={() => {
                                    // Make sure we're passing the exact class object with the correct ID
                                    onClassToggle(cls, true)
                                  }}
                                >
                                  <div className="flex flex-col h-full">
                                    {(() => {
                                      const startHour = timeToHour(cls.startTime)
                                      const endHour = timeToHour(cls.endTime)
                                      const duration = endHour - startHour
                                      const isShortClass = duration <= 1

                                      return (
                                        <>
                                          <div
                                            className={`font-medium ${isOverlapping || isMobile || isShortClass ? "text-[9px]" : "truncate"} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                          >
                                            {cls.unitCode} {activityTypeFull}
                                          </div>
                                          <div
                                            className={`${isOverlapping || isMobile || isShortClass ? "text-[8px]" : "text-xs"} whitespace-normal ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                          >
                                            {cls.startTime} - {cls.endTime}
                                          </div>
                                          {!isShortClass || duration > 1.5 ? (
                                            <>
                                              <div
                                                className={`${isOverlapping || isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isOverlapping ? "break-words" : "truncate"}`}
                                              >
                                                {cls.location}
                                              </div>
                                              <div
                                                className={`${isOverlapping || isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isOverlapping ? "break-words" : "truncate"}`}
                                              >
                                                {weeksInfo}
                                              </div>
                                            </>
                                          ) : (
                                            <div className={`text-[7px] truncate leading-relaxed`}>
                                              {cls.location.split(" - ")[0]}
                                            </div>
                                          )}
                                        </>
                                      )
                                    })()}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md dark:bg-gray-800 dark:border-gray-700 rounded-lg shadow-lg">
                                <div className="space-y-1">
                                  <p className="font-bold">
                                    {cls.unitCode} - {activityTypeFull}
                                  </p>
                                  <p>{cls.class}</p>
                                  <p className="text-[#003A6E] dark:text-blue-300">
                                    {cls.dayFormatted} {cls.startTime} - {cls.endTime}
                                  </p>
                                  <p>
                                    <span className="font-semibold">Location:</span>{" "}
                                    {cls.locationBuilding
                                      ? `${cls.locationBuilding} - ${cls.locationRoom}`
                                      : cls.location}
                                  </p>
                                  <p>
                                    <span className="font-semibold">Weeks:</span> {extractWeeksInfo(cls.class)}
                                  </p>
                                  {cls.teachingStaff && <p>Staff: {cls.teachingStaff}</p>}
                                  <div className="flex gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      {weeksInfo}
                                    </Badge>
                                    {classMode && (
                                      <Badge variant="outline" className="text-xs">
                                        {classMode}
                                      </Badge>
                                    )}
                                    {isOverlapping && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700"
                                      >
                                        Overlapping
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Click to remove from timetable
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                      }
                      return null
                    })}

                    {/* Render preview classes */}
                    {previewClasses.map((cls, idx) => {
                      // Only render at the starting hour and if not already selected
                      if (
                        cls.dayFormatted === day &&
                        timeToHour(cls.startTime) === hour &&
                        !selectedClasses.some(
                          (selected) =>
                            selected.unitCode === cls.unitCode &&
                            selected.activityType === cls.activityType &&
                            selected.dayFormatted === cls.dayFormatted &&
                            selected.startTime === cls.startTime &&
                            selected.location === cls.location,
                        )
                      ) {
                        const position = calculateClassPosition(cls)
                        const colors = getUnitColor(cls.unitCode)
                        const activityTypeFull = formatActivityType(cls.activityType)
                        const weeksInfo = extractWeeksInfo(cls.class)

                        // Check for overlaps with selected classes
                        const overlappingWithSelected = selectedClasses.some((selected) =>
                          doClassesOverlap(selected, cls, true),
                        )

                        return (
                          <div
                            key={`preview-${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.location}-${idx}`}
                            className={`absolute rounded-md border-dashed border ${colors.border} ${colors.text} p-1 overflow-hidden text-xs opacity-90 transition-all duration-200`}
                            style={{
                              top: position.top,
                              height: position.height,
                              width: "calc(100% - 4px)",
                              left: "2px",
                              zIndex: 5,
                              backgroundColor: "rgba(0, 58, 110, 0.15)",
                              borderColor: overlappingWithSelected ? "rgba(234, 179, 8, 0.8)" : undefined,
                              borderWidth: "1.5px",
                            }}
                          >
                            {(() => {
                              const startHour = timeToHour(cls.startTime)
                              const endHour = timeToHour(cls.endTime)
                              const duration = endHour - startHour
                              const isShortClass = duration <= 1

                              return (
                                <>
                                  <div
                                    className={`font-medium break-words ${isMobile || isShortClass ? "text-[9px]" : ""} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                  >
                                    {cls.unitCode} {activityTypeFull}
                                  </div>
                                  <div
                                    className={`whitespace-normal break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                  >
                                    {cls.startTime} - {cls.endTime}
                                  </div>
                                  {!isShortClass || duration > 1.5 ? (
                                    <>
                                      <div
                                        className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                      >
                                        {cls.location}
                                      </div>
                                      <div
                                        className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                      >
                                        {weeksInfo}
                                      </div>
                                    </>
                                  ) : (
                                    <div className={`text-[7px] truncate leading-relaxed`}>
                                      {cls.location.split(" - ")[0]}
                                    </div>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        )
                      }
                      return null
                    })}

                    {/* Render hovered class preview */}
                    {hoveredClass &&
                      hoveredClass.dayFormatted === day &&
                      timeToHour(hoveredClass.startTime) === hour && (
                        <div
                          className="absolute inset-x-0 rounded-md border border-dashed p-1 overflow-hidden text-xs transition-all duration-200 animate-in fade-in-50"
                          style={{
                            ...calculateClassPosition(hoveredClass),
                            zIndex: 5,
                            margin: "0 2px",
                            backgroundColor: "rgba(0, 58, 110, 0.2)",
                            borderColor: selectedClasses.some((selected) =>
                              doClassesOverlap(selected, hoveredClass, true),
                            )
                              ? "rgba(234, 179, 8, 0.8)"
                              : "rgba(0, 58, 110, 0.6)",
                            borderWidth: "1.5px",
                          }}
                        >
                          {(() => {
                            const startHour = timeToHour(hoveredClass.startTime)
                            const endHour = timeToHour(hoveredClass.endTime)
                            const duration = endHour - startHour
                            const isShortClass = duration <= 1

                            return (
                              <>
                                <div
                                  className={`font-medium break-words ${isMobile || isShortClass ? "text-[9px]" : ""} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                >
                                  {hoveredClass.unitCode} {formatActivityType(hoveredClass.activityType)}
                                </div>
                                <div
                                  className={`whitespace-normal break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                >
                                  {hoveredClass.startTime} - {hoveredClass.endTime}
                                </div>
                                {!isShortClass || duration > 1.5 ? (
                                  <>
                                    <div
                                      className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                    >
                                      {hoveredClass.location}
                                    </div>
                                    <div
                                      className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                    >
                                      {extractWeeksInfo(hoveredClass.class)}
                                    </div>
                                  </>
                                ) : (
                                  <div className={`text-[7px] truncate leading-relaxed`}>
                                    {hoveredClass.location.split(" - ")[0]}
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
