"use client"

import type { TimetableEntry } from "@/lib/types"
import { TimetableTable } from "./timetable-table"
import { formatActivityType } from "@/lib/format-utils"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { getTeachingPeriodWithCampus } from "@/lib/teaching-periods"
import { Download, Calendar } from "lucide-react"
import { exportToICS } from "@/lib/export-utils"
import { useToast } from "@/components/ui/use-toast"

interface TimetableResultsProps {
  entries: TimetableEntry[]
  unitName?: string
  onViewInTimetableMaker?: (entry: TimetableEntry) => void
}

export function TimetableResults({ entries, unitName, onViewInTimetableMaker }: TimetableResultsProps) {
  const { toast } = useToast()
  const [selectedActivityType, setSelectedActivityType] = useState<string | null>(null)

  // Group entries by activity type
  const groupedByActivityType = entries.reduce<Record<string, TimetableEntry[]>>((acc, entry) => {
    const key = entry.activityType
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(entry)
    return acc
  }, {})

  // Get unique activity types
  const activityTypes = Object.keys(groupedByActivityType)

  // Filter entries by selected activity type
  const filteredEntries = selectedActivityType ? groupedByActivityType[selectedActivityType] : entries

  // Export the timetable to ICS
  const handleExport = () => {
    if (entries.length > 0) {
      exportToICS(entries)
      toast({
        title: "Timetable Exported",
        description: "Your timetable has been exported as an .ics file.",
        duration: 5000,
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })
    }
  }

  // Export to Google Calendar
  const handleGoogleCalendarExport = () => {
    if (entries.length === 0) return

    // Create a base URL for Google Calendar
    const baseUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE"

    // Open a new window for each class
    entries.forEach((cls, index) => {
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

      // Create Google Calendar URL for this class
      let url = `${baseUrl}&text=${encodeURIComponent(`${cls.unitCode} - ${cls.classTitle || cls.activityType}`)}`
      url += `&dates=${start}/${end}`
      url += `&location=${encodeURIComponent(cls.location)}`
      url += `&details=${encodeURIComponent(`${cls.class}\nTeaching Staff: ${cls.teachingStaff}`)}`

      // Open in a new tab with a slight delay to prevent popup blocking
      setTimeout(() => {
        window.open(url, `_blank${index}`)
      }, index * 300)
    })

    toast({
      title: "Google Calendar Export",
      description: `${entries.length} classes have been exported to Google Calendar. Please check your browser for popup windows. (You may have to allow pop-ups in the address bar)`,
      duration: 5000,
    })
  }

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
            {entries[0]?.unitCode} {unitName && <span className="font-normal">- {unitName}</span>}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300">
            {entries[0]?.teachingPeriodId && getTeachingPeriodWithCampus(entries[0].teachingPeriodId)} •{" "}
            {entries.length} classes
          </p>
        </div>

        <div className="flex space-x-2 animate-in slide-in-from-right-5 duration-300">
          <Button
            onClick={handleGoogleCalendarExport}
            variant="outline"
            size="sm"
            className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Google Calendar
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
      </div>

      {activityTypes.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4 animate-in fade-in-50 slide-in-from-bottom-5 duration-500">
          <Button
            variant={selectedActivityType === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedActivityType(null)}
            className={`rounded-lg ${
              selectedActivityType === null
                ? "bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700"
                : "border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300"
            }`}
          >
            All Classes
            <Badge variant="secondary" className="ml-2 bg-white text-[#003A6E] dark:bg-blue-900 dark:text-blue-300">
              {entries.length}
            </Badge>
          </Button>
          {activityTypes.map((type, index) => (
            <Button
              key={type}
              variant={selectedActivityType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedActivityType(type)}
              className={`rounded-lg ${
                selectedActivityType === type
                  ? "bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700"
                  : "border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300"
              }`}
              style={{
                animationDelay: `${(index + 1) * 50}ms`,
                opacity: 0,
                animation: "fadeIn 0.5s forwards",
              }}
            >
              {formatActivityType(type)}
              <Badge variant="secondary" className="ml-2 bg-white text-[#003A6E] dark:bg-blue-900 dark:text-blue-300">
                {groupedByActivityType[type].length}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      <div className="animate-in fade-in-50 slide-in-from-bottom-5 duration-700">
        <TimetableTable entries={filteredEntries} onViewInTimetableMaker={onViewInTimetableMaker} />
      </div>
    </div>
  )
}

