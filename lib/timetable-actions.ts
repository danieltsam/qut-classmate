"use server"

import type { TimetableEntry } from "./types"
import * as cheerio from "cheerio"
import { formatDayName, formatLocation, formatTeachingStaff } from "./format-utils"
import { headers, cookies } from "next/headers"
import crypto from "crypto"

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
const DAILY_RATE_LIMIT = 15
const REQUEST_INTERVAL = 2000 // 2 seconds in milliseconds

// Generate a fingerprint from request headers
function generateFingerprint(): string {
  const headersList = headers()

  // Collect various headers to create a more unique fingerprint
  const userAgent = headersList.get("user-agent") || ""
  const acceptLanguage = headersList.get("accept-language") || ""
  const acceptEncoding = headersList.get("accept-encoding") || ""
  const connection = headersList.get("connection") || ""
  const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown"

  // Create a hash of these values
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${ip}-${userAgent}-${acceptLanguage}-${acceptEncoding}-${connection}`)
    .digest("hex")

  return fingerprint
}

// Check rate limit using cookies and fingerprinting
function checkRateLimit(): { allowed: boolean; remainingRequests: number } {
  const cookieStore = cookies()
  const today = new Date().toDateString()

  // Get or create a session token
  let sessionToken = cookieStore.get("timetable-session")?.value

  if (!sessionToken) {
    // Generate a new session token
    sessionToken = crypto.randomUUID()

    // Set the session token cookie (httpOnly and secure)
    cookieStore.set("timetable-session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 86400 * 30, // 30 days
      path: "/",
    })
  }

  // Generate a fingerprint
  const fingerprint = generateFingerprint()

  // Get the rate limit cookie
  const rateLimitCookie = cookieStore.get("timetable-rate-limit")

  if (!rateLimitCookie?.value) {
    // No rate limit cookie, set a new one
    cookieStore.set(
      "timetable-rate-limit",
      JSON.stringify({
        count: 1, // Start with 1 since we're about to make a request
        resetDate: today,
        fingerprint,
        sessionToken,
      }),
      {
        maxAge: 86400, // 1 day
        path: "/",
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    )

    return { allowed: true, remainingRequests: DAILY_RATE_LIMIT - 1 }
  }

  try {
    const data = JSON.parse(rateLimitCookie.value)

    // Reset if it's a new day
    if (data.resetDate !== today) {
      cookieStore.set(
        "timetable-rate-limit",
        JSON.stringify({
          count: 1, // Start with 1
          resetDate: today,
          fingerprint,
          sessionToken,
        }),
        {
          maxAge: 86400, // 1 day
          path: "/",
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
        },
      )

      return { allowed: true, remainingRequests: DAILY_RATE_LIMIT - 1 }
    }

    // Check if we've reached the limit
    if (data.count >= DAILY_RATE_LIMIT) {
      return { allowed: false, remainingRequests: 0 }
    }

    // Increment the count
    const newCount = data.count + 1

    // Update the cookie
    cookieStore.set(
      "timetable-rate-limit",
      JSON.stringify({
        count: newCount,
        resetDate: today,
        fingerprint,
        sessionToken,
      }),
      {
        maxAge: 86400, // 1 day
        path: "/",
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    )

    return { allowed: true, remainingRequests: DAILY_RATE_LIMIT - newCount }
  } catch (error) {
    console.error("Error parsing rate limit cookie:", error)

    // Set a new rate limit cookie
    cookieStore.set(
      "timetable-rate-limit",
      JSON.stringify({
        count: 1,
        resetDate: today,
        fingerprint,
        sessionToken,
      }),
      {
        maxAge: 86400, // 1 day
        path: "/",
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    )

    return { allowed: true, remainingRequests: DAILY_RATE_LIMIT - 1 }
  }
}

// Update the fetchTimetableData function to use our improved rate limiting
export async function fetchTimetableData(unitCode: string, teachingPeriodId: string): Promise<TimetableResponse> {
  try {
    // Check rate limit
    const { allowed, remainingRequests } = checkRateLimit()

    // If not allowed, return immediately
    if (!allowed) {
      return {
        error: true,
        message: `Rate limit exceeded. You have used your ${DAILY_RATE_LIMIT} searches for today. Please try again tomorrow.`,
        rateLimitExceeded: true,
        remainingRequests: 0,
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

