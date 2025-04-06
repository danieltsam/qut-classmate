"use server"

import type { TimetableEntry } from "./types"
import * as cheerio from "cheerio"
import { formatDayName, formatLocation, formatTeachingStaff } from "./format-utils"

export async function fetchTimetableData(unitCode: string, teachingPeriodId: string): Promise<TimetableEntry[]> {
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

  try {
    // Fetch the HTML content
    const response = await fetch(url.toString())

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()

    // Parse the HTML using cheerio
    const $ = cheerio.load(html)

    // Check if the unit code is valid
    if (html.includes("No matching records found")) {
      throw new Error(`No timetable found for unit code "${unitCode}" in the specified teaching period`)
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
      throw new Error("Sorry, we couldn't find that unit. 😢")
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

    return timetableEntries
  } catch (error) {
    console.error("Error fetching timetable data:", error)
    throw error
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

