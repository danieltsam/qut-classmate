import { type NextRequest, NextResponse } from "next/server"
import * as cheerio from "cheerio"
import { formatDayName, formatLocation, formatTeachingStaff } from "@/lib/format-utils"
import type { TimetableEntry } from "@/lib/types"
import { getTimetableFromCache, storeTimetableInCache } from "@/lib/redis-cache"

// Rate limiting constants
const DAILY_RATE_LIMIT = 15

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json()
    const { unitCode, teachingPeriodId } = body

    if (!unitCode || !teachingPeriodId) {
      return NextResponse.json(
        { error: true, message: "Unit code and teaching period ID are required" },
        { status: 400 },
      )
    }

    // Get rate limit info from headers (set by middleware)
    // The middleware has already handled incrementing the counter
    const remainingRequests = Number.parseInt(req.headers.get("X-RateLimit-Remaining") || "0", 10)

    // Check server-side cache first
    const cachedData = await getTimetableFromCache(unitCode, teachingPeriodId)
    if (cachedData) {
      return NextResponse.json({
        error: false,
        data: cachedData,
        cached: true,
        source: "redis_cache",
        remainingRequests,
      })
    }

    // Continue with the API request if not in cache
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

    console.log(
      `%c📡 QUT API FETCH: Fetching ${unitCode} directly from QUT API`,
      "background: #9c27b0; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
    )

    if (!response.ok) {
      return NextResponse.json(
        {
          error: true,
          message: `Unable to fetch timetable data. Please try again later.`,
          remainingRequests,
        },
        { status: response.status },
      )
    }

    const html = await response.text()

    // Parse the HTML using cheerio
    const $ = cheerio.load(html)

    // Check if the unit code is valid
    if (html.includes("No matching records found")) {
      return NextResponse.json(
        {
          error: true,
          message: `No timetable found for unit code "${unitCode}" in the specified teaching period`,
          remainingRequests,
        },
        { status: 404 },
      )
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
      return NextResponse.json(
        {
          error: true,
          message: `Sorry, we couldn't find that unit 😢. Please check the unit code and try again.`,
          remainingRequests,
        },
        { status: 404 },
      )
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
      return NextResponse.json(
        {
          error: true,
          message: `No classes found for unit code "${unitCode}" in the specified teaching period`,
          remainingRequests,
        },
        { status: 404 },
      )
    }

    // Store in server-side cache
    await storeTimetableInCache(unitCode, teachingPeriodId, timetableEntries)

    return NextResponse.json({
      error: false,
      data: timetableEntries,
      cached: false,
      source: "qut_api",
      remainingRequests,
    })
  } catch (error) {
    console.error("Error fetching timetable data:", error)
    return NextResponse.json(
      { error: true, message: "Unable to fetch timetable data. Please try again later." },
      { status: 500 },
    )
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
  // This is a placeholder implementation.
  return { building: location, room: "" }
}
