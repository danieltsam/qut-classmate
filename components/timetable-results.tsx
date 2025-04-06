"use client"

import type { TimetableEntry } from "@/lib/types"
import { TimetableTable } from "./timetable-table"
import { formatActivityType } from "@/lib/format-utils"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { getTeachingPeriodWithCampus } from "@/lib/teaching-periods"
import { Download } from "lucide-react"
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

