"use client"

import { useState } from "react"
import type { Unit, TimetableEntry, SelectedClass } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { X, Check } from "lucide-react"

interface UnitListProps {
  units: Unit[]
  onUnitRemove: (unitCode: string) => void
  onClassHover: (classEntry: TimetableEntry | null) => void
  onClassSelect: (classEntry: TimetableEntry) => void
  selectedClasses: SelectedClass[]
}

export function UnitList({ units, onUnitRemove, onClassHover, onClassSelect, selectedClasses }: UnitListProps) {
  const [expandedActivities, setExpandedActivities] = useState<Record<string, string[]>>({})

  // Toggle activity expansion
  const toggleActivity = (unitCode: string, activityType: string) => {
    setExpandedActivities((prev) => {
      const unitActivities = prev[unitCode] || []

      if (unitActivities.includes(activityType)) {
        return {
          ...prev,
          [unitCode]: unitActivities.filter((type) => type !== activityType),
        }
      } else {
        return {
          ...prev,
          [unitCode]: [...unitActivities, activityType],
        }
      }
    })
  }

  // Check if a class is selected
  const isClassSelected = (classEntry: TimetableEntry): boolean => {
    return selectedClasses.some(
      (cls) =>
        cls.unitCode === classEntry.unitCode &&
        cls.activityType === classEntry.activityType &&
        cls.day === classEntry.day &&
        cls.startTime === classEntry.startTime,
    )
  }

  // Get color for unit
  const getUnitColor = (unitCode: string): string => {
    // Generate a consistent color based on the unit code
    const colors = [
      "bg-blue-100 border-blue-300 text-blue-800",
      "bg-green-100 border-green-300 text-green-800",
      "bg-purple-100 border-purple-300 text-purple-800",
      "bg-amber-100 border-amber-300 text-amber-800",
      "bg-pink-100 border-pink-300 text-pink-800",
      "bg-cyan-100 border-cyan-300 text-cyan-800",
      "bg-indigo-100 border-indigo-300 text-indigo-800",
      "bg-rose-100 border-rose-300 text-rose-800",
    ]

    // Use a hash function to get a consistent index
    const hash = unitCode.split("").reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)

    return colors[Math.abs(hash) % colors.length]
  }

  if (units.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <p>No units added yet</p>
            <p className="text-sm mt-1">Search for units in the Unit Search tab to add them to your planner</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {units.map((unit) => {
        const unitColor = getUnitColor(unit.unitCode)
        const activityTypes = Object.keys(unit.groupedClasses)

        return (
          <Card key={unit.unitCode} className="overflow-hidden">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-medium">
                {unit.unitCode}
                <span className="text-xs text-gray-500 block mt-1">{unit.teachingPeriodName}</span>
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onUnitRemove(unit.unitCode)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Remove</span>
              </Button>
            </CardHeader>

            <CardContent className="px-0 py-0">
              <Accordion type="multiple" className="w-full">
                {activityTypes.map((activityType) => {
                  const classes = unit.groupedClasses[activityType]
                  const isExpanded = (expandedActivities[unit.unitCode] || []).includes(activityType)
                  const hasSelectedClass = selectedClasses.some(
                    (cls) => cls.unitCode === unit.unitCode && cls.activityType === activityType,
                  )

                  return (
                    <AccordionItem
                      key={`${unit.unitCode}-${activityType}`}
                      value={`${unit.unitCode}-${activityType}`}
                      className="border-b-0 last:border-0"
                    >
                      <AccordionTrigger
                        className="px-4 py-2 hover:no-underline"
                        onClick={() => toggleActivity(unit.unitCode, activityType)}
                      >
                        <div className="flex items-center">
                          <span>{activityType}</span>
                          {hasSelectedClass && (
                            <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                              <Check className="h-3 w-3 mr-1" />
                              Selected
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pt-0 pb-1">
                        <div className="space-y-1 px-4 pb-2">
                          {classes.map((classEntry, idx) => {
                            const isSelected = isClassSelected(classEntry)

                            return (
                              <div
                                key={idx}
                                className={`p-2 rounded-md text-sm cursor-pointer transition-colors
                                  ${isSelected ? `${unitColor} border` : "hover:bg-gray-50 border border-transparent"}`}
                                onMouseEnter={() => onClassHover(classEntry)}
                                onMouseLeave={() => onClassHover(null)}
                                onClick={() => onClassSelect(classEntry)}
                              >
                                <div className="flex justify-between">
                                  <div className="font-medium">{classEntry.day}</div>
                                  <div>
                                    {classEntry.startTime} - {classEntry.endTime}
                                  </div>
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  <div>{classEntry.location}</div>
                                  {classEntry.teachingStaff && (
                                    <div className="truncate">{classEntry.teachingStaff}</div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
