"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"

interface RateLimitContextType {
  remainingRequests: number | null
  setRemainingRequests: (value: number | null) => void
  isRateLimited: boolean
  decrementCounter: () => void
  checkRateLimit: () => Promise<void>
}

const RateLimitContext = createContext<RateLimitContextType>({
  remainingRequests: null,
  setRemainingRequests: () => {},
  isRateLimited: false,
  decrementCounter: () => {},
  checkRateLimit: async () => {},
})

export const useRateLimit = () => useContext(RateLimitContext)

export function RateLimitProvider({ children }: { children: React.ReactNode }) {
  const [remainingRequests, setRemainingRequests] = useState<number | null>(null)
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

  // Function to decrement the counter (used before making a request)
  const decrementCounter = () => {
    setRemainingRequests((prev) => {
      if (prev === null) return 15 - 1 // Default to 15 if not set
      return Math.max(0, prev - 1)
    })

    // Also update localStorage
    const newValue = remainingRequests === null ? 14 : Math.max(0, remainingRequests - 1)
    localStorage.setItem("rate-limit-remaining", String(newValue))
    localStorage.setItem("rate-limit-timestamp", String(Date.now()))
  }

  return (
    <RateLimitContext.Provider
      value={{
        remainingRequests,
        setRemainingRequests,
        isRateLimited,
        decrementCounter,
        checkRateLimit,
      }}
    >
      {children}
    </RateLimitContext.Provider>
  )
}
