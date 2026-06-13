"use client"

import { useState } from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { teachingPeriods } from "@/lib/qut/periods"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"

export function UnitSearch() {
  const [unitCode, setUnitCode] = useState("")
  const [teachingPeriodId, setTeachingPeriodId] = useState(teachingPeriods[0].id)
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    const formattedCode = unitCode.trim().toUpperCase()
    if (!formattedCode) return

    if (!/^[A-Z]{3}\d{3}$/.test(formattedCode)) {
      toast.error("Invalid unit code format. Expected like CAB201.")
      return
    }

    setIsLoading(true)
    setResults([])

    try {
      const response = await fetch("/api/timetable/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCode: formattedCode, teachingPeriodId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Search failed")
      }

      setResults(data.data)
      toast.success(`Found ${data.data.length} classes for ${formattedCode}`)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <Card className="max-w-2xl mx-auto md:mx-0">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <label htmlFor="unit-code" className="text-sm font-medium">
                Unit Code
              </label>
              <Input
                id="unit-code"
                placeholder="e.g. CAB201"
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                className="uppercase"
              />
            </div>
            <div className="flex-1 space-y-2">
              <label htmlFor="period" className="text-sm font-medium">
                Teaching Period
              </label>
              <Select value={teachingPeriodId} onValueChange={setTeachingPeriodId}>
                <SelectTrigger id="period">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {teachingPeriods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Results for {unitCode.toUpperCase()}</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((cls, idx) => (
              <Card key={idx} className="overflow-hidden">
                <div className="bg-[#003A6E] text-white px-4 py-2 text-sm font-bold flex justify-between">
                  <span>{cls.activityType}</span>
                  <span>{cls.class}</span>
                </div>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Day:</span>
                    <span className="font-medium">{cls.dayFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time:</span>
                    <span className="font-medium">{cls.startTime} - {cls.endTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{cls.location}</span>
                  </div>
                  <div className="pt-2 border-t mt-2 flex justify-between">
                    <span className="text-muted-foreground italic truncate max-w-[150px]">{cls.teachingStaff}</span>
                    <Button variant="outline" size="sm">Add</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
