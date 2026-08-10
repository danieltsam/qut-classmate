"use client"

import type React from "react"
import { useState } from "react"
import { TimetableResults } from "./timetable-results"
import { Loader2, Search, Info } from "lucide-react"
import { teachingPeriods } from "@/lib/teaching-periods"
import { useToast } from "@/components/ui/use-toast"
import { checkCache, safelyStoreInCache } from "@/lib/storage-utils"
import type { TimetableEntry } from "@/lib/types"
import { useRateLimit } from "@/context/RateLimitContext"
import { UnitCodeAutocomplete } from "./unit-code-autocomplete"

export function UnitSearch() {
  const { toast } = useToast()
  const [unitCode, setUnitCode] = useState("")
  const [teachingPeriodId, setTeachingPeriodId] = useState("4381474") // Default to Semester 2 2026
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
    if (!code.trim()) {
      setValidationError("Please enter a unit code")
      return false
    }

    const unitCodePattern = /^[A-Za-z]{3}[0-9]{3}$/
    if (!unitCodePattern.test(code.trim())) {
      setValidationError("Must be 3 letters & 3 digits (e.g. CAB202)")
      return false
    }

    setValidationError(null)
    return true
  }

  const checkThrottling = (): boolean => {
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

    if (!validateUnitCode(unitCode)) {
      return
    }

    if (isRateLimited) {
      toast({
        title: "Rate Limit Exceeded",
        description: "You have used your 15 searches for today. Please try again tomorrow.",
        variant: "destructive",
        duration: 6000,
      })
      return
    }

    if (!checkThrottling()) {
      return
    }

    const formattedUnitCode = unitCode.trim().toUpperCase()

    // Check cache first
    const cachedData = checkCache(formattedUnitCode, teachingPeriodId.trim())
    if (cachedData) {
      setTimetableData(cachedData)
      if (cachedData.length > 0 && cachedData[0].unitName) {
        setUnitName(cachedData[0].unitName)
      } else {
        setUnitName("")
      }
      return
    }

    setIsPendingRequest(true)
    setLastRequestTime(Date.now())
    setIsLoading(true)
    setError(null)

    try {
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
        setError(result.message)
        if (result.rateLimitExceeded || response.status === 429) {
          toast({
            title: "Rate Limit Exceeded",
            description: result.message || "You have used your 15 searches for today. Please try again tomorrow.",
            variant: "destructive",
            duration: 6000,
          })
        }
      } else {
        setTimetableData(result.data)

        // Cache the response data
        const cacheData = {
          data: result.data,
          timestamp: Date.now(),
        }
        safelyStoreInCache(`timetable-${formattedUnitCode}-${teachingPeriodId.trim()}`, cacheData)

        if (result.data.length > 0 && result.data[0].unitName) {
          setUnitName(result.data[0].unitName)
        } else {
          setUnitName("")
        }

        if (result.remainingRequests <= 3) {
          toast({
            title: "Search Limit Warning",
            description: `You have only ${result.remainingRequests} searches remaining today.`,
            duration: 15000,
          })
        }
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again later.")
      console.error("Unexpected error:", err)
    } finally {
      setIsLoading(false)
      setIsPendingRequest(false)
      await checkRateLimit()
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-grow items-start font-sans">
      
      {/* Left Column: Explorer Filter Sidebar */}
      <div className="lg:col-span-1 flex flex-col h-fit bg-[#ece9d8] border border-[#d8d2bd]">
        <div className="bg-[#0053e2] text-white px-2 py-1 flex items-center justify-between text-xs font-bold">
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-white" /> Search Panel
          </span>
        </div>
        <div className="p-4 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="unitCode" className="text-xs font-bold text-zinc-700 block">
                Unit Code:
              </label>
              <UnitCodeAutocomplete
                value={unitCode}
                onChange={(value) => {
                  setUnitCode(value)
                  if (validationError) validateUnitCode(value)
                }}
                disabled={isLoading || isPendingRequest}
                placeholder="e.g. CAB202"
              />
              {validationError && <p className="text-red-600 text-[10px] font-semibold mt-0.5">{validationError}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="teachingPeriod" className="text-xs font-bold text-zinc-700 block">
                Teaching Period:
              </label>
              <select
                id="teachingPeriod"
                value={teachingPeriodId}
                onChange={(e) => setTeachingPeriodId(e.target.value)}
                disabled={isLoading || isPendingRequest}
                className="w-full text-xs"
              >
                {teachingPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name} {period.campus ? `@ ${period.campus}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5"
              disabled={isLoading || isRateLimited || isPendingRequest}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  <span>Get Schedule</span>
                </>
              )}
            </button>
          </form>
          
          <div className="text-[10px] text-zinc-500 bg-[#ffffe1] border border-[#e5c365] p-2 space-y-1">
            <div className="flex items-start gap-1">
              <Info className="w-3.5 h-3.5 text-[#e5c365] shrink-0 mt-0.5" />
              <span>Remaining searches: <strong>{remainingRequests} / 15</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Search Results */}
      <div className="lg:col-span-3 flex flex-col bg-white border border-[#d8d2bd]">
        <div className="bg-[#0053e2] text-white px-2 py-1 flex items-center justify-between text-xs font-bold">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-white" /> Class Times Listing {unitName ? `— ${unitName}` : ""}
          </span>
        </div>
        
        <div className="p-4 flex-grow overflow-auto min-h-[400px] bg-white">
          {error && (
            <div className="bg-[#ffffe1] border border-red-400 p-3 text-xs text-red-700 mb-4 font-sans">
              <strong>Error:</strong> {error}
            </div>
          )}

          {timetableData.length > 0 ? (
            <div className="space-y-4">
              <TimetableResults
                entries={timetableData}
                unitName={unitName || undefined}
              />
            </div>
          ) : (
            <div className="text-center py-20 text-zinc-400 space-y-3 font-sans">
              <Search className="w-10 h-10 mx-auto text-zinc-300" />
              <p className="text-xs font-bold text-zinc-500">NO UNIT LOADED</p>
              <p className="text-[10px] text-zinc-400 max-w-xs mx-auto">
                Search for any active QUT unit code in the finder panel to fetch and load its schedule.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
