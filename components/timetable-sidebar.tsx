"use client"

import type React from "react"

import { useState } from "react"
import type { SelectedClass, TimetableEntry } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, Check } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teachingPeriods, getTeachingPeriodWithCampus } from "@/lib/teaching-periods"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatActivityType } from "@/lib/format-utils"
import { Badge } from "@/components/ui/badge"
import { fetchTimetableData } from "@/lib/timetable-actions"
import { useToast } from "@/components/ui/use-toast"

interface TimetableSidebarProps {
  onClassHover: (classEntry: TimetableEntry | null) => void
  onClassToggle: (classEntry: TimetableEntry) => void
  onActivityTypeHover?: (activityType: string | null, unitCode: string | null) => void
  selectedClasses: SelectedClass[]
  searchedUnits?: { unitCode: string; teachingPeriodId: string }[]
  onAddSearchedUnit?: (unitCode: string, teachingPeriodId: string) => void
  onAddClasses?: (classes: TimetableEntry[]) => void
}

// Constants for rate limiting
const RATE_LIMIT_KEY = "qut_timetable_search_count"
const RATE_LIMIT_DATE_KEY = "qut_timetable_search_date"
const DAILY_RATE_LIMIT = 15
const REQUEST_INTERVAL = 2000 // 2 seconds

export function TimetableSidebar({
  onClassHover,
  onClassToggle,
  onActivityTypeHover = () => {},
  selectedClasses,
  searchedUnits = [],
  onAddSearchedUnit = () => {},
  onAddClasses = () => {},
}: TimetableSidebarProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"search" | "selected">("search")
  const [unitCode, setUnitCode] = useState("")
  const [unitName, setUnitName] = useState("")
  const [teachingPeriodId, setTeachingPeriodId] = useState("621050") // Default to Semester 1 2025
  const [searchResults, setSearchResults] = useState<TimetableEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedActivities, setExpandedActivities] = useState<Record<string, string[]>>({})
  const [searchHistory, setSearchHistory] = useState<Record<string, TimetableEntry[]>>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [lastRequestTime, setLastRequestTime] = useState(0)
  const [searchCount, setSearchCount] = useState(0)

  // Initialize rate limiting from localStorage
  useState(() => {
    const storedDate = localStorage.getItem(RATE_LIMIT_DATE_KEY)
    const today = new Date().toDateString()

    if (storedDate !== today) {
      // Reset count for a new day
      localStorage.setItem(RATE_LIMIT_DATE_KEY, today)
      localStorage.setItem(RATE_LIMIT_KEY, "0")
      setSearchCount(0)
    } else {
      // Get current count
      const count = Number.parseInt(localStorage.getItem(RATE_LIMIT_KEY) || "0", 10)
      setSearchCount(count)
    }
  })

  // Validate unit code
  const validateUnitCode = (code: string): boolean => {
    // Empty check
    if (!code.trim()) {
      setValidationError("Please enter a unit code")
      return false
    }

    // Format check: 3 letters followed by 3 digits
    const unitCodePattern = /^[A-Za-z]{3}[0-9]{3}$/
    if (!unitCodePattern.test(code.trim())) {
      setValidationError("Unit code must be 3 letters followed by 3 digits (e.g., CAB202)")
      return false
    }

    setValidationError(null)
    return true
  }

  // Check rate limits
  const checkRateLimits = (): boolean => {
    // Check daily limit
    if (searchCount >= DAILY_RATE_LIMIT) {
      toast({
        title: "Daily Search Limit Reached",
        description: `You've reached the maximum of ${DAILY_RATE_LIMIT} searches per day. Please try again tomorrow.`,
        variant: "destructive",
        duration: 6000,
      })
      return false
    }

    // Check request interval
    const now = Date.now()
    if (now - lastRequestTime < REQUEST_INTERVAL) {
      toast({
        title: "Please wait",
        description: "Too many requests. Please wait a moment before trying again.",
        variant: "destructive",
      })
      return false
    }

    return true
  }

  // Update search count
  const incrementSearchCount = () => {
    const newCount = searchCount + 1
    setSearchCount(newCount)
    localStorage.setItem(RATE_LIMIT_KEY, newCount.toString())

    // Show toast when approaching limit
    if (newCount === DAILY_RATE_LIMIT - 3) {
      toast({
        title: "Search Limit Warning",
        description: `You have only 3 searches remaining today. Daily limit: ${DAILY_RATE_LIMIT} searches.`,
        duration: 5000,
      })
    }
  }

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

  // Handle search form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate unit code
    if (!validateUnitCode(unitCode)) {
      return
    }

    // Check rate limits
    if (!checkRateLimits()) {
      return
    }

    setLastRequestTime(Date.now())
    setIsLoading(true)
    setError(null)

    try {
      const formattedUnitCode = unitCode.trim().toUpperCase()
      const data = await fetchTimetableData(formattedUnitCode, teachingPeriodId.trim())
      setSearchResults(data)
      incrementSearchCount()

      // Extract unit name from the first entry if available
      if (data.length > 0 && data[0].unitName) {
        setUnitName(data[0].unitName)
      } else {
        setUnitName("")
      }

      // Add to search history
      const key = `${formattedUnitCode}-${teachingPeriodId}`
      setSearchHistory((prev) => ({
        ...prev,
        [key]: data,
      }))

      // Notify parent component
      onAddSearchedUnit(formattedUnitCode, teachingPeriodId)
      onAddClasses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timetable data")
    } finally {
      setIsLoading(false)
    }
  }

  // Load a previously searched unit
  const loadSearchedUnit = async (unitCode: string, teachingPeriodId: string) => {
    const key = `${unitCode}-${teachingPeriodId}`

    // If we already have the data in history, use it
    if (searchHistory[key]) {
      setSearchResults(searchHistory[key])
      setUnitCode(unitCode)
      setTeachingPeriodId(teachingPeriodId)
      return
    }

    // Otherwise fetch it
    setUnitCode(unitCode)
    setTeachingPeriodId(teachingPeriodId)
    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchTimetableData(unitCode, teachingPeriodId)
      setSearchResults(data)
      incrementSearchCount()

      // Extract unit name from the first entry if available
      if (data.length > 0 && data[0].unitName) {
        setUnitName(data[0].unitName)
      } else {
        setUnitName("")
      }

      // Add to search history
      setSearchHistory((prev) => ({
        ...prev,
        [key]: data,
      }))

      // Notify parent component
      onAddClasses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timetable data")
    } finally {
      setIsLoading(false)
    }
  }

  // Generate a unique ID for a class entry
  const generateUniqueClassId = (classEntry: TimetableEntry): string => {
    return `${classEntry.unitCode}-${classEntry.activityType}-${classEntry.dayFormatted}-${classEntry.startTime}-${classEntry.endTime}-${classEntry.location}`
  }

  // Check if a class is selected
  const isClassSelected = (classEntry: TimetableEntry): boolean => {
    return selectedClasses.some(
      (cls) =>
        cls.unitCode === classEntry.unitCode &&
        cls.activityType === classEntry.activityType &&
        cls.dayFormatted === classEntry.dayFormatted &&
        cls.startTime === classEntry.startTime &&
        cls.endTime === classEntry.endTime &&
        cls.location === classEntry.location,
    )
  }

  // Group search results by activity type
  const groupedSearchResults = searchResults.reduce(
    (acc, cls) => {
      const key = cls.activityType
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(cls)
      return acc
    },
    {} as Record<string, TimetableEntry[]>,
  )

  // Group selected classes by unit code
  const selectedByUnit = selectedClasses.reduce(
    (acc, cls) => {
      if (!acc[cls.unitCode]) {
        acc[cls.unitCode] = []
      }
      acc[cls.unitCode].push(cls)
      return acc
    },
    {} as Record<string, SelectedClass[]>,
  )

  // Get color for unit
  const getUnitColor = (unitCode: string): string => {
    // Generate a consistent color based on the unit code
    const colors = [
      "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300",
      "bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300",
      "bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300",
      "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300",
      "bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-300",
      "bg-cyan-100 border-cyan-300 text-cyan-800 dark:bg-cyan-900/30 dark:border-cyan-700 dark:text-cyan-300",
      "bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300",
      "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-300",
    ]

    // Use a hash function to get a consistent index
    const hash = unitCode.split("").reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)

    return colors[Math.abs(hash) % colors.length]
  }

  return (
    <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
      <CardHeader className="pb-3 bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
        <CardTitle className="text-lg text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
          Timetable Planner
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 dark:bg-gray-900 transition-colors duration-300">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "search" | "selected")}>
          <TabsList className="grid grid-cols-2 w-full bg-gray-100 dark:bg-gray-800">
            <TabsTrigger
              value="search"
              className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-md transition-all duration-200"
            >
              Search
            </TabsTrigger>
            <TabsTrigger
              value="selected"
              className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-md transition-all duration-200"
            >
              Selected
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="p-4 pt-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unitCode" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                  Unit Code
                </Label>
                <Input
                  id="unitCode"
                  placeholder="e.g. CAB202"
                  value={unitCode}
                  onChange={(e) => {
                    setUnitCode(e.target.value)
                    if (validationError) validateUnitCode(e.target.value)
                  }}
                  required
                  disabled={isLoading}
                  className="focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                />
                {validationError && <p className="text-red-500 text-xs mt-1">{validationError}</p>}
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
              <Button
                type="submit"
                className="w-full bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                disabled={isLoading || searchCount >= DAILY_RATE_LIMIT}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Search Unit
                  </>
                )}
              </Button>
            </form>

            {error && <p className="text-red-500 text-sm mt-4">{error}</p>}

            {/* Previously searched units */}
            {searchedUnits.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-[#003A6E] dark:text-blue-300 mb-2 transition-colors duration-300">
                  Recent Searches
                </h3>
                <div className="flex flex-wrap gap-2">
                  {searchedUnits.map((unit) => (
                    <Badge
                      key={`${unit.unitCode}-${unit.teachingPeriodId}`}
                      variant="outline"
                      className="cursor-pointer hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/20 transition-all duration-200"
                      onClick={() => loadSearchedUnit(unit.unitCode, unit.teachingPeriodId)}
                    >
                      {unit.unitCode}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="mt-4 animate-in fade-in-50 duration-300">
                <h3 className="font-medium mb-2 text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                  {searchResults[0].unitCode} {unitName && <span className="font-normal">- {unitName}</span>}
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-1 transition-colors duration-300">
                    {getTeachingPeriodWithCampus(teachingPeriodId)}
                  </div>
                </h3>

                <Accordion type="multiple" className="w-full">
                  {Object.entries(groupedSearchResults).map(([activityType, classes]) => {
                    const classTitle = classes[0].classTitle || classes[0].activityType
                    const fullActivityType = formatActivityType(activityType)
                    const isExpanded = (expandedActivities[unitCode] || []).includes(activityType)

                    return (
                      <AccordionItem
                        key={`${unitCode}-${activityType}`}
                        value={`${unitCode}-${activityType}`}
                        className="border-b-0 last:border-0 data-[state=open]:bg-[#003A6E]/5 dark:data-[state=open]:bg-blue-900/10 rounded-lg mb-1 transition-colors duration-200"
                        onMouseEnter={() => onActivityTypeHover(activityType, unitCode)}
                        onMouseLeave={() => onActivityTypeHover(null, null)}
                      >
                        <AccordionTrigger
                          className="px-2 py-2 hover:no-underline hover:bg-[#003A6E]/5 dark:hover:bg-blue-900/20 rounded-lg transition-colors duration-200"
                          onClick={() => toggleActivity(unitCode, activityType)}
                        >
                          <div className="flex items-center text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                            <span>{fullActivityType}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {classes.length}
                            </Badge>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="pt-0 pb-1">
                          <div className="space-y-1">
                            {classes.map((classEntry, idx) => {
                              const isSelected = isClassSelected(classEntry)
                              const unitColor = getUnitColor(classEntry.unitCode || "")
                              const uniqueKey = generateUniqueClassId(classEntry) + `-${idx}`

                              return (
                                <div
                                  key={uniqueKey}
                                  className={`p-2 rounded-md text-sm cursor-pointer transition-all duration-200
                                    ${
                                      isSelected
                                        ? `${unitColor} border shadow-sm`
                                        : "hover:bg-[#003A6E]/5 border border-transparent dark:hover:bg-blue-900/20"
                                    }`}
                                  onMouseEnter={() => onClassHover(classEntry)}
                                  onMouseLeave={() => onClassHover(null)}
                                  onClick={() => onClassToggle(classEntry)}
                                >
                                  <div className="flex justify-between">
                                    <div className="font-medium">{classEntry.dayFormatted}</div>
                                    <div className="whitespace-nowrap">
                                      {classEntry.startTime} - {classEntry.endTime}
                                    </div>
                                  </div>
                                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 transition-colors duration-300">
                                    <div>{classEntry.location}</div>
                                  </div>
                                  {isSelected && (
                                    <div className="mt-1 flex items-center text-xs text-green-700 dark:text-green-400 transition-colors duration-300">
                                      <Check className="h-3 w-3 mr-1" />
                                      Selected
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              </div>
            )}
          </TabsContent>

          <TabsContent value="selected" className="p-4 pt-2">
            {selectedClasses.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-4 transition-colors duration-300">
                <p>No classes selected yet</p>
                <p className="text-sm mt-1">Search for units and select classes to build your timetable</p>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in-50 duration-300">
                {Object.entries(selectedByUnit).map(([unitCode, classes]) => {
                  const unitColor = getUnitColor(unitCode)

                  return (
                    <div
                      key={unitCode}
                      className="border rounded-lg overflow-hidden border-[#003A6E]/20 dark:border-blue-900/30 shadow-sm hover:shadow transition-all duration-200"
                    >
                      <div className={`${unitColor} px-3 py-2 font-medium`}>{unitCode}</div>
                      <div className="p-2 space-y-2 dark:bg-gray-800 transition-colors duration-300">
                        {classes.map((cls) => {
                          const fullActivityType = formatActivityType(cls.activityType)

                          return (
                            <div
                              key={cls.id}
                              className="p-2 bg-gray-50 rounded-md text-sm cursor-pointer hover:bg-[#003A6E]/5 dark:bg-gray-700 dark:hover:bg-blue-900/20 transition-colors duration-200"
                              onClick={() => onClassToggle(cls)}
                            >
                              <div className="font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                                {fullActivityType}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap transition-colors duration-300">
                                {cls.dayFormatted} {cls.startTime} - {cls.endTime}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 transition-colors duration-300">
                                {cls.location}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

