"use client"

import { useState } from "react"
import { fetchTimetableData } from "@/lib/timetable-actions"
import type { TimetableEntry } from "@/lib/types"
import { TimetableForm } from "./timetable-form"
import { TimetableTable } from "./timetable-table"
import { TimetableCalendar } from "./timetable-calendar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { exportToICS } from "@/lib/export-utils"

export function TimetablePlanner() {
  const [timetableData, setTimetableData] = useState<TimetableEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (unitCode: string, teachingPeriodId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchTimetableData(unitCode, teachingPeriodId)
      setTimetableData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timetable data")
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = () => {
    if (timetableData.length > 0) {
      exportToICS(timetableData)
    }
  }

  return (
    <div className="space-y-6">
      <TimetableForm onSubmit={handleSubmit} isLoading={isLoading} />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      )}

      {!isLoading && timetableData.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Timetable Results</h2>
            <Button onClick={handleExport} variant="outline">
              Export to Calendar (.ics)
            </Button>
          </div>

          <Tabs defaultValue="table">
            <TabsList>
              <TabsTrigger value="table">Table View</TabsTrigger>
              <TabsTrigger value="calendar">Calendar View</TabsTrigger>
            </TabsList>
            <TabsContent value="table">
              <TimetableTable entries={timetableData} />
            </TabsContent>
            <TabsContent value="calendar">
              <TimetableCalendar entries={timetableData} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
