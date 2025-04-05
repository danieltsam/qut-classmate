"use client"

import { useState } from "react"
import type { TimetableEntry } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TimetableTableProps {
  entries: TimetableEntry[]
}

type SortField = "classTitle" | "dayFormatted" | "startTime" | "location" | "teachingStaff"
type SortDirection = "asc" | "desc"

export function TimetableTable({ entries }: TimetableTableProps) {
  const [sortField, setSortField] = useState<SortField>("dayFormatted")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

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

  // Sort entries based on current sort field and direction
  const sortedEntries = [...entries].sort((a, b) => {
    let comparison = 0

    // Special handling for day of week
    if (sortField === "dayFormatted") {
      const dayOrder = {
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        Sunday: 7,
      }
      comparison =
        (dayOrder[a.dayFormatted as keyof typeof dayOrder] || 0) -
        (dayOrder[b.dayFormatted as keyof typeof dayOrder] || 0)
    }
    // Special handling for time
    else if (sortField === "startTime") {
      const timeToMinutes = (timeStr: string): number => {
        const isPM = timeStr.toLowerCase().includes("pm")
        const [hourStr, minuteStr] = timeStr.replace(/[ap]m/i, "").split(":")

        let hour = Number.parseInt(hourStr, 10)
        const minute = Number.parseInt(minuteStr, 10)

        // Convert to 24-hour format
        if (isPM && hour < 12) hour += 12
        if (!isPM && hour === 12) hour = 0

        return hour * 60 + minute
      }

      comparison = timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    }
    // Default string comparison
    else {
      comparison = (a[sortField] || "").localeCompare(b[sortField] || "")
    }

    return sortDirection === "asc" ? comparison : -comparison
  })

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

  return (
    <div className="rounded-xl border border-[#003A6E]/20 dark:border-blue-900/30 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
      <Table>
        <TableHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 transition-colors duration-300">
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("classTitle")}
                className="p-0 h-auto font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
              >
                Class Type
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("dayFormatted")}
                className="p-0 h-auto font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
              >
                Day
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("startTime")}
                className="p-0 h-auto font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
              >
                Time
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("location")}
                className="p-0 h-auto font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
              >
                Location
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("teachingStaff")}
                className="p-0 h-auto font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
              >
                Teaching Staff
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="dark:bg-gray-900 transition-colors duration-300">
          {sortedEntries.map((entry, index) => {
            const classMode = getClassMode(entry)
            const weeksInfo = getWeeksInfo(entry)

            return (
              <TableRow
                key={index}
                className="hover:bg-[#003A6E]/5 dark:hover:bg-blue-900/20 transition-colors duration-200"
              >
                <TableCell className="font-medium">
                  <div>{entry.classTitle || entry.activityType}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {weeksInfo} {classMode && `| ${classMode}`}
                  </div>
                </TableCell>
                <TableCell>{entry.dayFormatted}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {entry.startTime} - {entry.endTime}
                </TableCell>
                <TableCell>{entry.location}</TableCell>
                <TableCell>{entry.teachingStaff}</TableCell>
                <TableCell className="text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#003A6E] dark:text-blue-300 transition-colors duration-200 hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/20 rounded-full"
                        >
                          <Info className="h-4 w-4" />
                          <span className="sr-only">View details</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md dark:bg-gray-800 dark:border-gray-700 rounded-lg shadow-lg">
                        <div className="space-y-1">
                          <p className="font-bold">{entry.class}</p>
                          <p className="text-[#003A6E] dark:text-blue-300">
                            <span className="font-semibold">Time:</span> {entry.dayFormatted} {entry.startTime} -{" "}
                            {entry.endTime}
                          </p>
                          <p>
                            <span className="font-semibold">Location:</span>{" "}
                            {entry.locationBuilding && `${entry.locationBuilding} - `}
                            {entry.locationRoom}
                          </p>
                          {entry.teachingStaff && (
                            <p>
                              <span className="font-semibold">Staff:</span> {entry.teachingStaff}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {weeksInfo} {classMode && `| ${classMode}`}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

