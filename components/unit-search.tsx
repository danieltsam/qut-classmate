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
import { Loader2, Search, AlertCircle, Info } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teachingPeriods } from "@/lib/teaching-periods"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useRouter } from "next/navigation"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { safelyStoreInCache, checkCache } from "@/lib/storage-utils"

// Constants for request throttling (client-side)
const REQUEST_INTERVAL = 2000 // 2 seconds

export function UnitSearch() {
  const { toast } = useToast()
  const router = useRouter()
  const [unitCode, setUnitCode] = useState("")
  const [unitName, setUnitName] = useState("")
  const [teachingPeriodId, setTeachingPeriodId] = useState("621050") // Default to Semester 1 2025
  const [timetableData, setTimetableData] = useState<TimetableEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toastShown, setToastShown] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [lastRequestTime, setLastRequestTime] = useState(0)
  const [remainingRequests, setRemainingRequests] = useState<number | null>(null)
  const [isFormVisible, setIsFormVisible] = useState(false)

  // Load cached data from localStorage on component mount
  useEffect(() => {
    const cachedData = localStorage.getItem(`timetable-${unitCode}-${teachingPeriodId}`)
    if (cachedData) {
      try {
        const parsedData = JSON.parse(cachedData)
        // Only use cached data if it's less than 96 hours old
        const cacheTime = parsedData.timestamp || 0
        const now = Date.now()
        const cacheAge = now - cacheTime
        const cacheDurationMs = 96 * 60 * 60 * 1000 // 96 hours (4 days)

        if (cacheAge < cacheDurationMs) {
          console.log(`🔄 Loading ${unitCode} from localStorage cache`)
          setTimetableData(parsedData.data)
          if (parsedData.data.length > 0 && parsedData.data[0].unitName) {
            setUnitName(parsedData.data[0].unitName)
          }
        }
      } catch (error) {
        console.error("Error parsing cached timetable data:", error)
      }
    }
  }, [unitCode, teachingPeriodId])

  // Remove the toast that appears when component mounts
  useEffect(() => {
    // Animate form in after a small delay
    const timer = setTimeout(() => {
      setIsFormVisible(true)
    }, 200)

    return () => clearTimeout(timer)
  }, [])

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

  // Check client-side throttling
  const checkThrottling = (): boolean => {
    // Check request interval (client-side throttling)
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

  // Replace the handleSubmit function with this updated version
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate unit code
    if (!validateUnitCode(unitCode)) {
      return
    }

    // Check client-side throttling
    if (!checkThrottling()) {
      return
    }

    const formattedUnitCode = unitCode.trim().toUpperCase()
    const formattedTeachingPeriodId = teachingPeriodId.trim()

    setIsLoading(true)
    setError(null)

    // Check cache first
    const cachedData = checkCache(formattedUnitCode, formattedTeachingPeriodId)
    if (cachedData) {
      setTimetableData(cachedData)

      // Extract unit name from the first entry if available
      if (cachedData.length > 0 && cachedData[0].unitName) {
        setUnitName(cachedData[0].unitName)
      } else {
        setUnitName("")
      }

      setIsLoading(false)
      return
    }

    // If no cache or cache is expired, fetch from server
    setLastRequestTime(Date.now())

    try {
      const response = await fetchTimetableData(formattedUnitCode, formattedTeachingPeriodId)

      // Update remaining requests if available
      if ("remainingRequests" in response) {
        setRemainingRequests(response.remainingRequests)
      }

      if (response.error) {
        setError(response.message)

        // Show rate limit toast if applicable
        if (response.rateLimitExceeded) {
          toast({
            title: "Rate Limit Exceeded",
            description: response.message,
            variant: "destructive",
            duration: 6000,
          })
        }
      } else {
        console.log(`📡 Fetched ${formattedUnitCode} from server`)

        // Cache the response data in localStorage
        const cacheData = {
          data: response.data,
          timestamp: Date.now(),
        }
        const cacheKey = `timetable-${formattedUnitCode}-${formattedTeachingPeriodId}`
        safelyStoreInCache(cacheKey, cacheData)
        console.log(`💾 Saved ${formattedUnitCode} to cache with key: ${cacheKey}`)

        setTimetableData(response.data)

        // Extract unit name from the first entry if available
        if (response.data.length > 0 && response.data[0].unitName) {
          setUnitName(response.data[0].unitName)
        } else {
          setUnitName("")
        }

        // Show remaining requests toast when getting low
        if (response.remainingRequests <= 3) {
          toast({
            title: "Search Limit Warning",
            description: `You have only ${response.remainingRequests} searches remaining today.`,
            duration: 5000,
          })
        }
      }
    } catch (err) {
      // Handle any unexpected errors
      setError("An unexpected error occurred. Please try again later.")
      console.error("Unexpected error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewInTimetableMaker = (entry: TimetableEntry) => {
    // Store the entry in localStorage to pass it to the timetable maker
    localStorage.setItem("viewInTimetableMaker", JSON.stringify(entry))

    // Switch to timetable maker tab
    router.push("/?tab=timetable")

    toast({
      title: "Class Added",
      description: `${entry.unitCode} ${entry.classTitle || entry.activityType} has been added to your timetable.`,
      duration: 3000,
      className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
    })
  }

  return (
    <div className="space-y-6">
      <Card
        className={`border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-500 ${isFormVisible ? "opacity-100 transform-none" : "opacity-0 translate-y-4"}`}
      >
        <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
          <CardTitle className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
            Search for a Unit
          </CardTitle>
          <CardDescription className="dark:text-gray-400 transition-colors duration-300">
            Need to check when your classes actually are? Or maybe you're like me and just want to show up to practicals
            when you happen to be on campus?
            <br />
            <br />
            Quickly find class times, locations, and staff for any QUT unit. Simply enter the unit code, teaching
            period, and location.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 dark:bg-gray-900 transition-colors duration-300">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="unitCode"
                    className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
                  >
                    Unit Code
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-gray-500">
                        <Info className="h-4 w-4" />
                        <span className="sr-only">Unit code format</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <p>Enter a unit code in the format: 3 letters followed by 3 digits (e.g., CAB202)</p>
                    </PopoverContent>
                  </Popover>
                </div>
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
                  Teaching Period & Campus
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
              className="w-full bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg animate-pulse-once"
              disabled={isLoading || remainingRequests === 0}
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
            {remainingRequests !== null && (
              <div className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                {30 - remainingRequests}/20 searches used today
              </div>
            )}
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

      {!isLoading && timetableData.length > 0 && (
        <TimetableResults
          entries={timetableData}
          unitName={unitName}
          onViewInTimetableMaker={handleViewInTimetableMaker}
        />
      )}
    </div>
  )
}

