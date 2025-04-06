"use client"

import { useState, useMemo } from "react"
import type { TimetableEntry } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatActivityType } from "@/lib/format-utils"
import { Info, ArrowRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { getTeachingPeriodWithCampus } from "@/lib/teaching-periods"

interface TimetableTableProps {
  entries: TimetableEntry[]
  onViewInTimetableMaker?: (entry: TimetableEntry) => void
}

type SortField = "type" | "day" | "time" | "location" | "staff"
type SortDirection = "asc" | "desc"

export function TimetableTable({ entries, onViewInTimetableMaker }: TimetableTableProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimetableEntry | null>(null)
  const [sortField, setSortField] = useState<SortField>("type")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  // Extract class mode (Online/On Campus)
  const getClassMode = (entry: TimetableEntry): string => {
    const classInfo = entry.class.toLowerCase()
    if (classInfo.includes("online")) return "Online"
    if (classInfo.includes("on campus") || classInfo.includes("internal")) return "On Campus"
    return ""
  }

  // Extract weeks information
  const getWeeksInfo = (entry: TimetableEntry): string => {
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

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      // Set new field and default to ascending
      setSortField(field)
      setSortDirection("asc")
    }
  }

  // Generate a unique key for each entry
  const getUniqueKey = (entry: TimetableEntry, index: number): string => {
    return `${entry.unitCode}-${entry.activityType}-${entry.dayFormatted}-${entry.startTime}-${entry.location}-${index}`
  }

  // Sort entries based on current sort field and direction
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case "type":
          comparison = a.activityType.localeCompare(b.activityType)
          break
        case "day":
          // Custom day order: Monday, Tuesday, etc.
          const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 }
          comparison = (dayOrder[a.dayFormatted] || 0) - (dayOrder[b.dayFormatted] || 0)
          break
        case "time":
          // Convert time to minutes for comparison
          const getMinutes = (time: string) => {
            const isPM = time.toLowerCase().includes("pm")
            const [hourStr, minuteStr] = time.replace(/[ap]m/i, "").split(":")
            let hour = Number.parseInt(hourStr, 10)
            const minute = Number.parseInt(minuteStr, 10)
            if (isPM && hour < 12) hour += 12
            if (!isPM && hour === 12) hour = 0
            return hour * 60 + minute
          }
          comparison = getMinutes(a.startTime) - getMinutes(b.startTime)
          break
        case "location":
          comparison = a.location.localeCompare(b.location)
          break
        case "staff":
          comparison = a.teachingStaff.localeCompare(b.teachingStaff)
          break
      }

      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [entries, sortField, sortDirection])

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 inline" />
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-4 w-4 inline" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4 inline" />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#003A6E]/20 dark:border-blue-900/30 shadow-sm">
      <Table className="border-collapse">
        <TableHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 transition-colors duration-300 rounded-t-xl">
          <TableRow>
            <TableHead
              className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 cursor-pointer hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30"
              onClick={() => handleSort("type")}
            >
              Type {renderSortIcon("type")}
            </TableHead>
            <TableHead
              className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 cursor-pointer hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30"
              onClick={() => handleSort("day")}
            >
              Day {renderSortIcon("day")}
            </TableHead>
            <TableHead
              className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 cursor-pointer hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30"
              onClick={() => handleSort("time")}
            >
              Time {renderSortIcon("time")}
            </TableHead>
            <TableHead
              className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 cursor-pointer hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30"
              onClick={() => handleSort("location")}
            >
              Location {renderSortIcon("location")}
            </TableHead>
            <TableHead
              className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 cursor-pointer hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30"
              onClick={() => handleSort("staff")}
            >
              Staff {renderSortIcon("staff")}
            </TableHead>
            <TableHead className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">Details</TableHead>
            {onViewInTimetableMaker && (
              <TableHead className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                Actions
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntries.map((entry, index) => {
            const classMode = getClassMode(entry)
            const weeksInfo = getWeeksInfo(entry)
            const uniqueKey = getUniqueKey(entry, index)

            return (
              <TableRow
                key={uniqueKey}
                className="border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200"
              >
                <TableCell className="font-medium">
                  <div>{formatActivityType(entry.activityType)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {weeksInfo.replace("Weeks", "Week")} {classMode && `| ${classMode}`}
                  </div>
                </TableCell>
                <TableCell>{entry.dayFormatted}</TableCell>
                <TableCell>
                  {entry.startTime} - {entry.endTime}
                </TableCell>
                <TableCell>{entry.location}</TableCell>
                <TableCell className="max-w-[200px] truncate">{entry.teachingStaff}</TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-[#003A6E] dark:text-blue-300"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <Info className="h-4 w-4" />
                        <span className="sr-only">View details</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md dark:bg-gray-800 dark:border-gray-700 rounded-lg">
                      <DialogHeader>
                        <DialogTitle className="text-[#003A6E] dark:text-blue-300">
                          {entry.unitCode} - {formatActivityType(entry.activityType)}
                        </DialogTitle>
                        <DialogDescription className="text-gray-600 dark:text-gray-400">
                          {entry.unitName && <div className="font-medium">{entry.unitName}</div>}
                          {entry.teachingPeriodId && (
                            <div className="text-xs">{getTeachingPeriodWithCampus(entry.teachingPeriodId)}</div>
                          )}
                          <div className="mt-1">{entry.class}</div>
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 mt-4">
                        <div>
                          <p className="text-sm font-medium text-[#003A6E] dark:text-blue-300">Time</p>
                          <p className="text-sm">
                            {entry.dayFormatted} {entry.startTime} - {entry.endTime}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#003A6E] dark:text-blue-300">Location</p>
                          <p className="text-sm">{entry.location}</p>
                        </div>
                        {entry.teachingStaff && (
                          <div>
                            <p className="text-sm font-medium text-[#003A6E] dark:text-blue-300">Teaching Staff</p>
                            <p className="text-sm">{entry.teachingStaff}</p>
                          </div>
                        )}
                        <div className="flex gap-2 mt-4">
                          <Badge variant="outline" className="text-xs">
                            {weeksInfo}
                          </Badge>
                          {classMode && (
                            <Badge variant="outline" className="text-xs">
                              {classMode}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
                {onViewInTimetableMaker && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[#003A6E] dark:text-blue-300 hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30"
                      onClick={() => onViewInTimetableMaker(entry)}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" />
                      <span className="text-xs">Add to Timetable</span>
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

