"use client"

import type { TimetableEntry, SelectedClass } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { formatActivityType } from "@/lib/format-utils"

interface WeeklyTimetableProps {
  selectedClasses: SelectedClass[]
  hoveredClass: TimetableEntry | null
  onClassToggle: (classEntry: TimetableEntry | SelectedClass) => void
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

  // Extract weeks information
  const getWeeksInfo = (entry: TimetableEntry | SelectedClass): string => {
    // Default to "Weeks 1-13" if we can't extract specific weeks
    let weeksInfo = "Weeks 1-13"

    // Try to extract weeks from class info
    const classInfo = entry.class
    const weeksMatch = classInfo.match(/Week[s]?\s+(\d+)[-–](\d+)/i)

    if (weeksMatch && weeksMatch.length >= 3) {
      weeksInfo = `Weeks ${weeksMatch[1]}-${weeksMatch[2]}`
    }

    return weeksInfo
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

  return (
    <Card className="h-full border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg sticky top-4">
      <CardContent className="p-4 dark:bg-gray-900 transition-colors duration-300">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header row with days */}
            <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1">
              <div className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-2 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md">
                Time
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-2 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Time slots */}
            {timeSlots.map((hour) => (
              <div key={hour} className="grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1">
                <div className="bg-[#003A6E]/5 dark:bg-blue-900/20 p-2 text-center text-sm text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md">
                  {hour % 12 || 12}
                  {hour >= 12 ? "pm" : "am"}
                </div>

                {days.map((day) => {
                  // Filter classes for this day and hour
                  const classesForSlot = selectedClasses.filter(
                    (cls) =>
                      cls.dayFormatted === day && timeToHour(cls.startTime) <= hour && timeToHour(cls.endTime) > hour,
                  )

                  // Filter preview classes for this day and hour
                  const previewClassesForSlot = previewClasses.filter(
                    (cls) =>
                      cls.dayFormatted === day && timeToHour(cls.startTime) <= hour && timeToHour(cls.endTime) > hour,
                  )

                  // Check if hovered class is for this day and hour
                  const isHoveredHere =
                    hoveredClass &&
                    hoveredClass.dayFormatted === day &&
                    timeToHour(hoveredClass.startTime) <= hour &&
                    timeToHour(hoveredClass.endTime) > hour

                  return (
                    <div
                      key={`${day}-${hour}`}
                      className="relative min-h-[60px] bg-gray-50 dark:bg-gray-800 transition-colors duration-300 rounded-md"
                    >
                      {/* Render selected classes */}
                      {classesForSlot.map((cls) => {
                        // Only render at the starting hour
                        if (timeToHour(cls.startTime) === hour) {
                          const position = calculateClassPosition(cls)
                          const colors = getUnitColor(cls.unitCode)
                          const classMode = getClassMode(cls)
                          const weeksInfo = getWeeksInfo(cls)
                          const activityTypeFull = formatActivityType(cls.activityType)

                          return (
                            <TooltipProvider key={cls.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`absolute inset-x-0 rounded-md border ${colors.bg} ${colors.border} ${colors.text} p-1 overflow-hidden text-xs cursor-pointer transition-all duration-200 hover:shadow-md animate-in fade-in-50 shadow-sm`}
                                    style={{
                                      top: position.top,
                                      height: position.height,
                                      zIndex: 10,
                                      margin: "0 2px",
                                    }}
                                    onClick={() => onClassToggle(cls)}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="font-medium">
                                          {cls.unitCode} {activityTypeFull}
                                        </div>
                                        <div className="text-xs whitespace-nowrap">
                                          {cls.startTime} - {cls.endTime}
                                        </div>
                                        <div className="text-xs truncate">{cls.location}</div>
                                      </div>
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
                                    <p>{cls.location}</p>
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
                      {previewClassesForSlot.map((cls, idx) => {
                        // Only render at the starting hour and if not already selected
                        if (
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

                          return (
                            <div
                              key={`preview-${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.location}-${idx}`}
                              className={`absolute inset-x-0 rounded-md border-dashed border ${colors.bg.replace("/50", "/30")} ${colors.border} ${colors.text} p-1 overflow-hidden text-xs opacity-50 transition-all duration-200`}
                              style={{
                                top: position.top,
                                height: position.height,
                                zIndex: 5,
                                margin: "0 2px",
                              }}
                            >
                              <div className="font-medium">
                                {cls.unitCode} {activityTypeFull}
                              </div>
                              <div className="text-xs whitespace-nowrap">
                                {cls.startTime} - {cls.endTime}
                              </div>
                            </div>
                          )
                        }
                        return null
                      })}

                      {/* Render hovered class preview */}
                      {isHoveredHere && hoveredClass && timeToHour(hoveredClass.startTime) === hour && (
                        <div
                          className="absolute inset-x-0 rounded-md border border-dashed bg-[#003A6E]/5 dark:bg-blue-900/20 p-1 overflow-hidden text-xs transition-all duration-200 animate-in fade-in-50"
                          style={{
                            ...calculateClassPosition(hoveredClass),
                            zIndex: 5,
                            margin: "0 2px",
                          }}
                        >
                          <div className="font-medium">
                            {hoveredClass.unitCode} {formatActivityType(hoveredClass.activityType)}
                          </div>
                          <div className="text-xs whitespace-nowrap">
                            {hoveredClass.startTime} - {hoveredClass.endTime}
                          </div>
                          <div className="text-xs truncate">{hoveredClass.location}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

