"use client"

import type React from "react"

import { useState } from "react"
import { TimetableResults } from "./timetable-results"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Search, AlertCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teachingPeriods } from "@/lib/teaching-periods"
import { useToast } from "@/components/ui/use-toast"
import { checkCache, safelyStoreInCache } from "@/lib/storage-utils"
import type { TimetableEntry } from "@/lib/types"
import { useRateLimit } from "@/context/RateLimitContext"
import { UnitCodeAutocomplete } from "./unit-code-autocomplete"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function UnitSearch() {
  const { toast } = useToast()
  const router = useRouter()
  const [unitCode, setUnitCode] = useState("")
  const [teachingPeriodId, setTeachingPeriodId] = useState("621052") // Default to Semester 2 2025
  const [timetableData, setTimetableData] = useState<TimetableEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [lastRequestTime, setLastRequestTime] = useState(0)
  const [unitName, setUnitName] = useState<string | null>(null)

  // Use the shared rate limit context
  const { remainingRequests, isRateLimited, checkRateLimit, isPendingRequest, setIsPendingRequest } = useRateLimit()

  // Constants for client-side throttling
  const REQUEST_INTERVAL = 2000 // 2 seconds in milliseconds

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate unit code
    if (!validateUnitCode(unitCode)) {
      return
    }

    // Strict enforcement - completely prevent searches when limit is reached
    if (isRateLimited) {
      toast({
        title: "Rate Limit Exceeded",
        description: "You have used your 15 searches for today. Please try again tomorrow.",
        variant: "destructive",
        duration: 6000,
      })
      return
    }

    // Check client-side throttling
    if (!checkThrottling()) {
      return
    }

    const formattedUnitCode = unitCode.trim().toUpperCase()

    // Check cache first
    const cachedData = checkCache(formattedUnitCode, teachingPeriodId.trim())
    if (cachedData) {
      setTimetableData(cachedData)

      // Extract unit name from the first entry if available
      if (cachedData.length > 0 && cachedData[0].unitName) {
        setUnitName(cachedData[0].unitName)
      } else {
        setUnitName("")
      }

      return
    }

    // Set pending state to prevent multiple requests
    setIsPendingRequest(true)
    setLastRequestTime(Date.now())
    setIsLoading(true)
    setError(null)

    try {
      // Use the API endpoint
      const response = await fetch("/api/timetable/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          unitCode: formattedUnitCode,
          teachingPeriodId: teachingPeriodId.trim(),
        }),
      })

      const result = await response.json()

      if (result.error) {
        // Format the error message to be more user-friendly
        if (result.message.includes("No timetable found")) {
          setError(`Sorry, we couldn't find that unit 😢. This unit may not be offered in the selected semester.`)
        } else {
          setError(result.message)
        }

        // Show rate limit toast if applicable
        if (result.rateLimitExceeded || response.status === 429) {
          toast({
            title: "Rate Limit Exceeded",
            description: result.message || "You have used your 15 searches for today. Please try again tomorrow.",
            variant: "destructive",
            duration: 6000,
          })
        }
      } else {
        console.log(`📡 Fetched ${formattedUnitCode} from server`)
        setTimetableData(result.data)

        // Cache the response data in localStorage
        const cacheData = {
          data: result.data,
          timestamp: Date.now(),
        }
        safelyStoreInCache(`timetable-${formattedUnitCode}-${teachingPeriodId.trim()}`, cacheData)

        // Extract unit name from the first entry if available
        if (result.data.length > 0 && result.data[0].unitName) {
          setUnitName(result.data[0].unitName)
        } else {
          setUnitName("")
        }

        // Show remaining requests toast when getting low
        if (result.remainingRequests <= 3) {
          toast({
            title: "Search Limit Warning",
            description: `You have only ${result.remainingRequests} searches remaining today.`,
            duration: 15000,
          })
        }
      }
    } catch (err) {
      // Handle any unexpected errors
      setError("An unexpected error occurred. Please try again later.")
      console.error("Unexpected error:", err)
    } finally {
      setIsLoading(false)
      setIsPendingRequest(false)

      // Refresh the rate limit state after the request is complete
      await checkRateLimit()
    }
  }

  // Handle view reviews
  const handleViewReviews = (unitCode: string) => {
    // Navigate to the reviews tab with the unit code as a parameter
    router.push(`/?tab=reviews&unitCode=${unitCode}${unitName ? `&unitName=${encodeURIComponent(unitName)}` : ""}`)

    // Show a toast notification
    toast({
      title: "Viewing Reviews",
      description: `Showing reviews for ${unitCode}${unitName ? ` - ${unitName}` : ""}.`,
      duration: 3000,
      className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
    })
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300">
        <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
          <CardTitle className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
            Search Unit Schedule
          </CardTitle>
          <CardDescription className="dark:text-gray-400 transition-colors duration-300">
            Enter a QUT unit code and teaching period to view the class schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 dark:bg-gray-900 transition-colors duration-300">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unitCode" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                  Unit Code
                </Label>
                <UnitCodeAutocomplete
                  value={unitCode}
                  onChange={(value) => {
                    setUnitCode(value)
                    if (validationError) validateUnitCode(value)
                  }}
                  disabled={isLoading || isPendingRequest}
                  placeholder="e.g. CAB202"
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
                <Select
                  value={teachingPeriodId}
                  onValueChange={setTeachingPeriodId}
                  disabled={isLoading || isPendingRequest}
                >
                  <SelectTrigger
                    id="teachingPeriod"
                    className="focus:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                  >
                    <SelectValue placeholder="Select a teaching period">
                      {teachingPeriods.find((p) => p.id === teachingPeriodId)?.name}
                      {teachingPeriods.find((p) => p.id === teachingPeriodId)?.campus
                        ? ` @ ${teachingPeriods.find((p) => p.id === teachingPeriodId)?.campus}`
                        : ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 rounded-lg max-w-[350px] w-[var(--radix-select-trigger-width)]">
                    {teachingPeriods.map((period) => (
                      <SelectItem
                        key={period.id}
                        value={period.id}
                        className="focus:bg-[#003A6E]/10 dark:focus:bg-blue-900/30 transition-colors duration-200 whitespace-normal"
                      >
                        <div className="flex flex-col">
                          <span>
                            {period.name} {period.campus ? `@ ${period.campus}` : ""}
                          </span>
                          {period.dateRange && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">{period.dateRange}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              className={`w-full ${
                isRateLimited || isPendingRequest
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700"
              } rounded-lg transition-all duration-300 shadow-md hover:shadow-lg`}
              disabled={isLoading || isRateLimited || isPendingRequest}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Get Unit Schedule
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

      {timetableData.length > 0 && (
        <TimetableResults
          entries={timetableData}
          unitName={unitName || undefined}
          onViewReviews={() => handleViewReviews(timetableData[0].unitCode || "")}
        />
      )}
    </div>
  )
}
