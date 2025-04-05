"use client"
import type { TimetableEntry } from "@/lib/types"
import { TimetableTable } from "./timetable-table"
import { getTeachingPeriodWithCampus } from "@/lib/teaching-periods"

interface TimetableResultsProps {
  entries: TimetableEntry[]
  unitName?: string
}

export function TimetableResults({ entries, unitName }: TimetableResultsProps) {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h2 className="text-xl font-semibold text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
          {entries.length > 0 && entries[0].unitCode ? (
            <>
              {entries[0].unitCode} {unitName && <span className="font-normal">- {unitName}</span>}
            </>
          ) : (
            "Timetable Results"
          )}
          {entries.length > 0 && entries[0].unitCode && (
            <span className="block text-sm font-normal text-gray-500 dark:text-gray-400 transition-colors duration-300">
              {getTeachingPeriodWithCampus(entries[0].teachingPeriodId || "621050")}
            </span>
          )}
        </h2>
      </div>

      <TimetableTable entries={entries} />
    </div>
  )
}

