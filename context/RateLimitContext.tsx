"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface RateLimitContextType {
  remainingRequests: number
  setRemainingRequests: (count: number) => void
  isRateLimited: boolean
  setIsRateLimited: (limited: boolean) => void
  isPendingRequest: boolean
  setIsPendingRequest: (pending: boolean) => void
  checkRateLimit: () => Promise<void>
}

const RateLimitContext = createContext<RateLimitContextType | undefined>(undefined)

export function useRateLimit() {
  const context = useContext(RateLimitContext)
  if (context === undefined) {
    throw new Error("useRateLimit must be used within a RateLimitProvider")
  }
  return context
}

interface RateLimitProviderProps {
  children: ReactNode
}

export function RateLimitProvider({ children }: RateLimitProviderProps) {
  const [remainingRequests, setRemainingRequests] = useState(15)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [isPendingRequest, setIsPendingRequest] = useState(false)

  const checkRateLimit = async () => {
    try {
      const response = await fetch("/api/check-rate-limit")
      if (response.ok) {
        const data = await response.json()
        setRemainingRequests(data.remaining)
        setIsRateLimited(data.remaining <= 0)
      }
    } catch (error) {
      console.error("Failed to check rate limit:", error)
      // Don't update state on error to avoid breaking the UI
    }
  }

  // Check rate limit on mount
  useEffect(() => {
    checkRateLimit()
  }, [])

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("rateLimitData")
      if (stored) {
        const data = JSON.parse(stored)
        if (data.remainingRequests !== undefined) {
          setRemainingRequests(data.remainingRequests)
        }
        if (data.isRateLimited !== undefined) {
          setIsRateLimited(data.isRateLimited)
        }
      }
    } catch (error) {
      console.error("Failed to load rate limit data from localStorage:", error)
    }
  }, [])

  // Save to localStorage when state changes
  useEffect(() => {
    try {
      localStorage.setItem(
        "rateLimitData",
        JSON.stringify({
          remainingRequests,
          isRateLimited,
        }),
      )
    } catch (error) {
      console.error("Failed to save rate limit data to localStorage:", error)
    }
  }, [remainingRequests, isRateLimited])

  const value: RateLimitContextType = {
    remainingRequests,
    setRemainingRequests,
    isRateLimited,
    setIsRateLimited,
    isPendingRequest,
    setIsPendingRequest,
    checkRateLimit,
  }

  return <RateLimitContext.Provider value={value}>{children}</RateLimitContext.Provider>
}
