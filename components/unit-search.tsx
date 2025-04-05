"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { fetchTimetableData } from "@/lib/timetable-actions"
import type { TimetableEntry } from "@/lib/types"
import { TimetableResults } from "./timetable-results"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Search, AlertCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teachingPeriods } from "@/lib/teaching-periods"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function UnitSearch() {
  const { toast } = useToast()
  const [unitCode, setUnitCode] = useState("")
  const [unitName, setUnitName] = useState("")
  const [teachingPeriodId, setTeachingPeriodId] = useState("621050") // Default to Semester 1 2025
  const [timetableData, setTimetableData] = useState<TimetableEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show toast on first render
  useEffect(() => {
    toast({
      title: "Unit Search",
      description: "Hover over classes to see more details about them.",
      duration: 5000,
    })
  }, [toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchTimetableData(unitCode.trim().toUpperCase(), teachingPeriodId.trim())
      setTimetableData(data)

      // Extract unit name from the first entry if available
      if (data.length > 0 && data[0].unitName) {
        setUnitName(data[0].unitName)
      } else {
        setUnitName("")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timetable data")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
        <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
          <CardTitle className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
            Search for a Unit
          </CardTitle>
          <CardDescription className="dark:text-gray-400 transition-colors duration-300">
            Need to check when your classes actually are? Or maybe you're like me and just want to show up to practicals
            when you happen to be on campus?
            <br/>
            <br/>
            Quickly find class times, locations, and staff for any QUT unit.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 dark:bg-gray-900 transition-colors duration-300">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unitCode" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                  Unit Code
                </Label>
                <Input
                  id="unitCode"
                  placeholder="e.g. CAB202"
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value)}
                  required
                  disabled={isLoading}
                  className="focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="teachingPeriod"
                  className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
                >
                  Teaching Period
                </Label>
                <Select value={teachingPeriodId} onValueChange={setTeachingPeriodId} disabled={isLoading}>
                  <SelectTrigger
                    id="teachingPeriod"
                    className="focus:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                  >
                    <SelectValue placeholder="Select a teaching period" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 rounded-lg">
                    {teachingPeriods.map((period) => (
                      <SelectItem
                        key={period.id}
                        value={period.id}
                        className="focus:bg-[#003A6E]/10 dark:focus:bg-blue-900/30 transition-colors duration-200"
                      >
                        {period.name} {period.campus ? `- ${period.campus}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching Timetable...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Unit
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert
          variant="destructive"
          className="rounded-lg shadow-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 animate-in fade-in-50 duration-300"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-[#003A6E] dark:text-blue-300" />
        </div>
      )}

      {!isLoading && timetableData.length > 0 && <TimetableResults entries={timetableData} unitName={unitName} />}
    </div>
  )
}

