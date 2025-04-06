"use server"

import type { TimetableEntry } from "./types"
import * as cheerio from "cheerio"
import { formatDayName, formatLocation, formatTeachingStaff } from "./format-utils"
import { headers } from "next/headers"

// Define error response type
type ErrorResponse = {
  error: true
  message: string
  rateLimitExceeded?: boolean
  remainingRequests?: number
}

// Define success response type
type SuccessResponse = {
  error: false
  data: TimetableEntry[]
  remainingRequests: number
}

// Combined response type
export type TimetableResponse = ErrorResponse | SuccessResponse

// Rate limiting constants
const DAILY_RATE_LIMIT = 20
const REQUEST_INTERVAL = 2000 // 2 seconds in milliseconds

// In-memory cache for rate limiting
// In a production environment, this should be replaced with Redis or a database
// This will reset when the server restarts
type RateLimitEntry = {
  count: number
  lastRequest: number
  resetDate: string
}

const rateLimitCache = new Map<string, RateLimitEntry>()

// Helper function to get client IP
function getClientIP(): string {
  const headersList = headers()

  // Try to get IP from various headers
  const forwardedFor = headersList.get("x-forwarded-for")
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(",")[0].trim()
  }

  const realIP = headersList.get("x-real-ip")
  if (realIP) {
    return realIP
  }

  // Fallback to a unique identifier if we can't get the IP
  // This is not ideal but better than nothing
  const userAgent = headersList.get("user-agent") || "unknown"
  return `unknown-${userAgent.substring(0, 20)}`
}

// Check rate limit for the given IP
function checkRateLimit(ip: string): { allowed: boolean; remainingRequests: number } {
  const today = new Date().toDateString()
  const now = Date.now()

  // Get or create rate limit entry for this IP
  let entry = rateLimitCache.get(ip)

  if (!entry || entry.resetDate !== today) {
    // New day, reset counter
    entry = { count: 0, lastRequest: 0, resetDate: today }
    rateLimitCache.set(ip, entry)
  }

  // Check if we're within the rate limit
  if (entry.count >= DAILY_RATE_LIMIT) {
    return { allowed: false, remainingRequests: 0 }
  }

  // Check if we're respecting the request interval
  if (now - entry.lastRequest < REQUEST_INTERVAL) {
    return { allowed: false, remainingRequests: DAILY_RATE_LIMIT - entry.count }
  }

  // Update the entry
  entry.count += 1
  entry.lastRequest = now
  rateLimitCache.set(ip, entry)

  return { allowed: true, remainingRequests: DAILY_RATE_LIMIT - entry.count }
}

export async function fetchTimetableData(unitCode: string, teachingPeriodId: string): Promise<TimetableResponse> {
  try {
    // Get client IP and check rate limit
    const clientIP = getClientIP()
    const { allowed, remainingRequests } = checkRateLimit(clientIP)

    if (!allowed) {
      return {
        error: true,
        message: `Rate limit exceeded. Please try again later.`,
        rateLimitExceeded: true,
        remainingRequests,
      }
    }

    // Continue with the API request
    const apiUrl =
      process.env.NEXT_PUBLIC_QUT_VIRTUAL_API_URL ||
      "https://qutvirtual3.qut.edu.au/qvpublic/ttab_unit_search_p.process_search"
    const url = new URL(apiUrl)

    // Add query parameters
    url.searchParams.append("p_unit_cd", unitCode)
    url.searchParams.append("p_unit_cd_param", unitCode)
    url.searchParams.append("p_time_period_id", teachingPeriodId)
    url.searchParams.append("p_arg_names", "Class timetable search")
    url.searchParams.append("p_arg_values", "/ttab_unit_search_p.process_teach_period_search?")

    // Fetch the HTML content
    const response = await fetch(url.toString())

    if (!response.ok) {
      return {
        error: true,
        message: `Unable to fetch timetable data. Please try again later.`,
        remainingRequests,
      }
    }

    const html = await response.text()

    // Parse the HTML using cheerio
    const $ = cheerio.load(html)

    // Check if the unit code is valid
    if (html.includes("No matching records found")) {
      return {
        error: true,
        message: `No timetable found for unit code "${unitCode}" in the specified teaching period`,
        remainingRequests,
      }
    }

    const timetableEntries: TimetableEntry[] = []

    // Extract unit name from the h2 element if available
    let unitName = ""
    const h2Elements = $("h2")
    h2Elements.each((index, element) => {
      const text = $(element).text().trim()
      if (text.includes(unitCode)) {
        // Extract the unit name (everything after the unit code)
        const match = text.match(new RegExp(`${unitCode}\\s+(.+)`))
        if (match && match[1]) {
          unitName = match[1].trim()
        }
      }
    })

    // Find the timetable table
    const table = $("table.qv_table")

    if (table.length === 0) {
      return {
        error: true,
        message: `Sorry, we couldn't find that unit 😢. Please check the unit code and try again.`,
        remainingRequests,
      }
    }

    // Extract data from each row
    table.find("tr").each((index, row) => {
      // Skip the header row
      if (index === 0) return

      const columns = $(row).find("td")

      if (columns.length >= 6) {
        const classInfo = $(columns[0]).text().trim()
        const activityType = $(columns[1]).text().trim()
        const day = $(columns[2]).text().trim()
        const timeRange = $(columns[3]).text().trim()

        // Extract location properly from the abbr tag
        const locationElement = $(columns[4])
        const locationAbbr = locationElement.find("abbr")
        let location = ""
        let locationBuilding = ""
        let locationRoom = ""

        if (locationAbbr.length > 0) {
          locationBuilding = locationAbbr.attr("title") || ""
          locationRoom = locationAbbr.text().trim()
          location = formatLocation(locationRoom, locationBuilding)
        } else {
          location = locationElement.text().trim()
          const parsed = parseLocation(location)
          locationBuilding = parsed.building
          locationRoom = parsed.room
        }

        const teachingStaff = formatTeachingStaff($(columns[5]).text().trim())

        // Parse time range into start and end times
        const [startTime, endTime] = parseTimeRange(timeRange)

        // Format the day name
        const dayFormatted = formatDayName(day)

        // Get the class title from the second h2 element (if available)
        let classTitle = activityType
        const rowH2Elements = $(row).find("h2")
        if (rowH2Elements.length > 1) {
          classTitle = $(rowH2Elements[1]).text().trim()
        }

        timetableEntries.push({
          class: classInfo,
          activityType,
          classTitle,
          dayFormatted,
          day, // Keep for backward compatibility
          startTime,
          endTime,
          location,
          locationBuilding,
          locationRoom,
          teachingStaff,
          unitCode,
          unitName,
          teachingPeriodId,
        })
      }
    })

    if (timetableEntries.length === 0) {
      return {
        error: true,
        message: `No classes found for unit code "${unitCode}" in the specified teaching period`,
        remainingRequests,
      }
    }

    return {
      error: false,
      data: timetableEntries,
      remainingRequests,
    }
  } catch (error) {
    // Handle different types of errors
    console.error("Error fetching timetable data:", error)
    return {
      error: true,
      message: "Unable to fetch timetable data. Please try again later.",
    }
  }
}

// Helper function to parse time range (e.g., "10:00am - 12:00pm")
function parseTimeRange(timeRange: string): [string, string] {
  const parts = timeRange.split("-").map((part) => part.trim())

  if (parts.length === 2) {
    return [parts[0], parts[1]]
  }

  return [timeRange, timeRange] // Return the original if parsing fails
}

function parseLocation(location: string): { building: string; room: string } {
  // This is a placeholder implementation.  A real implementation would
  // need to parse the location string and extract the building and room.
  // Example location strings: "GP-Z9-432", "B Block, Level 4"
  return { building: location, room: "" }
}

