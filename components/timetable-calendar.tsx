"use client"
import type { TimetableEntry } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TimetableCalendarProps {
  entries: TimetableEntry[]
}

// Days of the week
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const dayAbbreviations = ["MON", "TUE", "WED", "THU", "FRI"]

// Time slots from 8am to 9pm
const timeSlots = Array.from({ length: 14 }, (_, i) => i + 8)

export function TimetableCalendar({ entries }: TimetableCalendarProps) {
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

  // Create a map of day -> hour -> entries
  const calendarMap: Record<string, Record<number, TimetableEntry[]>> = {}

  days.forEach((day, index) => {
    const abbr = dayAbbreviations[index]
    calendarMap[day] = {}
    timeSlots.forEach((hour) => {
      calendarMap[day][hour] = []
    })

    // Find entries for this day
    const dayEntries = entries.filter((entry) => entry.dayFormatted === day)

    // Populate the calendar map
    dayEntries.forEach((entry) => {
      const startHour = timeToHour(entry.startTime)
      const endHour = timeToHour(entry.endTime)

      // Only add if the time is within our display range
      if (startHour >= 8 && startHour < 22) {
        const startMinutes = timeToMinutes(entry.startTime)
        const endMinutes = timeToMinutes(entry.endTime)

        // Calculate duration in hours
        const duration = endHour - startHour + (endMinutes - startMinutes) / 60

        if (!calendarMap[day][startHour]) {
          calendarMap[day][startHour] = []
        }

        calendarMap[day][startHour].push({
          ...entry,
          duration,
        })
      }
    })
  })

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header row with days */}
        <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1">
          <div className="bg-gray-100 p-2 text-center font-medium rounded-md">Time</div>
          {days.map((day) => (
            <div key={day} className="bg-gray-100 p-2 text-center font-medium rounded-md">
              {day}
            </div>
          ))}
        </div>

        {/* Time slots */}
        {timeSlots.map((hour) => (
          <div key={hour} className="grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1">
            <div className="bg-gray-50 p-2 text-center text-sm rounded-md">
              {hour % 12 || 12}
              {hour >= 12 ? "pm" : "am"}
            </div>

            {days.map((day) => (
              <div key={`${day}-${hour}`} className="relative min-h-[60px] bg-gray-50 rounded-md">
                {calendarMap[day][hour]?.map((entry, idx) => (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card
                          className="absolute inset-0 m-0.5 overflow-hidden bg-blue-100 border-blue-200 cursor-help"
                          style={{
                            height: `calc(${entry.duration * 60}px - 4px)`,
                            maxHeight: "100%",
                          }}
                        >
                          <CardContent className="p-1 text-xs">
                            <div className="font-medium truncate">{entry.activityTypeFormatted}</div>
                            <div className="truncate">{entry.locationFormatted}</div>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <div className="space-y-1">
                          <p className="font-bold">{entry.class}</p>
                          <p>
                            <span className="font-semibold">Time:</span> {entry.dayFormatted} {entry.startTime} -{" "}
                            {entry.endTime}
                          </p>
                          <p>
                            <span className="font-semibold">Location:</span> {entry.location}
                          </p>
                          {entry.teachingStaff && (
                            <p>
                              <span className="font-semibold">Staff:</span> {entry.teachingStaff}
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

