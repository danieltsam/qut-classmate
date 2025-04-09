"use client"

import type React from "react"
import { createContext, useState, useEffect, useContext } from "react"

interface RateLimitContextType {
  remainingRequests: number | null
  setRemainingRequests: (value: number | null) => void
  isRateLimited: boolean
  checkRateLimit: () => Promise<void>
  isPendingRequest: boolean
  setIsPendingRequest: (value: boolean) => void
}

// Create the context with default values
export const RateLimitContext = createContext<RateLimitContextType>({
  remainingRequests: null,
  setRemainingRequests: () => {},
  isRateLimited: false,
  checkRateLimit: async () => {},
  isPendingRequest: false,
  setIsPendingRequest: () => {},
})

// Custom hook to use the context
export const useRateLimit = () => useContext(RateLimitContext)

// Provider component
export function RateLimitProvider({ children }: { children: React.ReactNode }) {
  const [remainingRequests, setRemainingRequests] = useState<number | null>(null)
  const [isPendingRequest, setIsPendingRequest] = useState(false)
  const isRateLimited = remainingRequests !== null && remainingRequests <= 0

  // Check rate limit on initial load
  useEffect(() => {
    checkRateLimit()

    // Also set up an interval to periodically check the rate limit
    const interval = setInterval(checkRateLimit, 60000) // Check every minute
    return () => clearInterval(interval)
  }, [])

  // Function to check rate limit from server
  const checkRateLimit = async () => {
    try {
      const response = await fetch("/api/check-rate-limit", {
        method: "GET",
        // Add cache busting to prevent caching
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      })
      const data = await response.json()

      if (data && typeof data.remainingRequests === "number") {
        setRemainingRequests(data.remainingRequests)

        // Store in localStorage as a backup
        localStorage.setItem("rate-limit-remaining", String(data.remainingRequests))
        localStorage.setItem("rate-limit-timestamp", String(Date.now()))
      }
    } catch (error) {
      console.error("Error checking rate limit:", error)

      // Try to fall back to localStorage if available
      const storedRemaining = localStorage.getItem("rate-limit-remaining")
      const storedTimestamp = localStorage.getItem("rate-limit-timestamp")

      if (storedRemaining && storedTimestamp) {
        // Only use stored value if it's from today
        const timestamp = Number.parseInt(storedTimestamp, 10)
        const now = Date.now()
        const isToday = new Date(timestamp).toDateString() === new Date(now).toDateString()

        if (isToday) {
          setRemainingRequests(Number.parseInt(storedRemaining, 10))
        }
      }
    }
  }

  return (
    <RateLimitContext.Provider
      value={{
        remainingRequests,
        setRemainingRequests,
        isRateLimited,
        checkRateLimit,
        isPendingRequest,
        setIsPendingRequest,
      }}
    >
      {children}
    </RateLimitContext.Provider>
  )
}
