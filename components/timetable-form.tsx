"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface TimetableFormProps {
  onSubmit: (unitCode: string, teachingPeriodId: string) => Promise<void>
  isLoading: boolean
}

export function TimetableForm({ onSubmit, isLoading }: TimetableFormProps) {
  const [unitCode, setUnitCode] = useState("")
  const [teachingPeriodId, setTeachingPeriodId] = useState("621050") // Default to Semester 1 2025

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(unitCode.trim().toUpperCase(), teachingPeriodId.trim())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter Unit Details</CardTitle>
        <CardDescription>
          Sick of QUT's awful UI? Same, let's fix that! Enter a QUT unit code and teaching period ID to view it's
          schedule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitCode">Unit Code</Label>
              <Input
                id="unitCode"
                placeholder="e.g. CAB202"
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teachingPeriodId">Teaching Period ID</Label>
              <Input
                id="teachingPeriodId"
                placeholder="e.g. 621050"
                value={teachingPeriodId}
                onChange={(e) => setTeachingPeriodId(e.target.value)}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500">Default: 621050 (Semester 1 2025)</p>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Schedule...
              </>
            ) : (
              "Get Unit Schedule"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

