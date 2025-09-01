import { type NextRequest, NextResponse } from "next/server"
import * as cheerio from "cheerio"
import { formatDayName, formatLocation, formatTeachingStaff } from "@/lib/format-utils"
import type { TimetableEntry } from "@/lib/types"
import { getTimetableFromCache, storeTimetableInCache } from "@/lib/kv-cache"
import { shouldUseNewAPI } from "@/lib/teaching-periods"

// Rate limiting constants
const DAILY_RATE_LIMIT = 15

// Interface for the new QUT API response
interface QUTActivity {
  subject_code: string
  activity_group_code: string
  activity_code: string
  campus: string
  day_of_week: string
  start_time: string
  location: string
  staff: string
  duration: string
  selectable: string
  availability: number
  week_pattern: string
  description: string
  zone: string
  department: string
  semester: string
  semester_description: string
  activity_type: string
  start_date: string
  color: string
  cluster: string
  activitiesDays: string[]
}

interface QUTSubject {
  subject_code: string
  callista_code: string
  description: string
  manager: string
  email_address: string
  faculty: string
  semester: string
  campus: string
  show_on_timetable: number
  activity_count: number
  activities: Record<string, QUTActivity>
  children: any[]
}

interface QUTResponse {
  [key: string]: QUTSubject
}

// Helper function to get day order for sorting
function getDayOrder(dayName: string): number {
  const dayOrder: Record<string, number> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  }
  return dayOrder[dayName] || 8
}

// Helper function to get activity type priority
function getActivityTypePriority(activityType: string): number {
  const priorities: Record<string, number> = {
    Lecture: 1,
    Practical: 2,
    Tutorial: 3,
    Workshop: 4,
    Studio: 5,
    Seminar: 6,
    Virtual: 7,
  }
  return priorities[activityType] || 10
}

// Helper function to sort timetable entries
function sortTimetableEntries(entries: TimetableEntry[]): TimetableEntry[] {
  return entries.sort((a, b) => {
    // First, sort by activity type priority (Lectures first, then Practicals, etc.)
    const typePriorityA = getActivityTypePriority(a.activityType)
    const typePriorityB = getActivityTypePriority(b.activityType)

    if (typePriorityA !== typePriorityB) {
      return typePriorityA - typePriorityB
    }

    // Within the same activity type, sort by day (Monday to Friday first)
    const dayOrderA = getDayOrder(a.dayFormatted)
    const dayOrderB = getDayOrder(b.dayFormatted)

    if (dayOrderA !== dayOrderB) {
      return dayOrderA - dayOrderB
    }

    // If same day and activity type, sort by start time
    const timeA = convertTimeToMinutes(a.startTime)
    const timeB = convertTimeToMinutes(b.startTime)

    if (timeA !== timeB) {
      return timeA - timeB
    }

    // Finally, sort by class name for consistency
    return a.class.localeCompare(b.class)
  })
}

// Helper function to convert time string to minutes for sorting
function convertTimeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d+)(am|pm)/i)
  if (!match) return 0

  let hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const period = match[3].toLowerCase()

  if (period === "pm" && hours !== 12) {
    hours += 12
  } else if (period === "am" && hours === 12) {
    hours = 0
  }

  return hours * 60 + minutes
}

// Helper functions for new API
function convertDayName(day: string): string {
  const dayMap: Record<string, string> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday",
  }
  return dayMap[day] || day
}

function formatTime(time: string): string {
  if (time.includes(":") && !time.toLowerCase().includes("am") && !time.toLowerCase().includes("pm")) {
    const [hours, minutes] = time.split(":")
    const hour = Number.parseInt(hours, 10)
    const ampm = hour >= 12 ? "pm" : "am"
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour}:${minutes}${ampm}`
  }
  return time
}

function calculateEndTime(startTime: string, duration: string): string {
  const durationMinutes = Number.parseInt(duration, 10)
  const [hours, minutes] = startTime.split(":")
  const startMinutes = Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10)
  const endMinutes = startMinutes + durationMinutes
  const endHours = Math.floor(endMinutes / 60)
  const endMins = endMinutes % 60

  const endTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`
  return formatTime(endTime)
}

function formatLocationNew(location: string, campus: string): string {
  if (location === "-" || location === "VIRTUAL") {
    return campus === "ONL" ? "Online" : location === "VIRTUAL" ? "Virtual" : "TBA"
  }
  return location
}

function formatStaff(staff: string): string {
  if (staff === "-" || !staff) {
    return "TBA"
  }
  return staff
}

function formatActivityType(activityType: string): string {
  const typeMap: Record<string, string> = {
    STU: "Studio",
    TUT: "Tutorial",
    LEC: "Lecture",
    PRA: "Practical",
    WOR: "Workshop",
    SEM: "Seminar",
    VIRTUAL: "Virtual",
  }
  return typeMap[activityType] || activityType
}

function generateWeeksInfo(activitiesDays: string[]): string {
  if (!activitiesDays || activitiesDays.length === 0) {
    return "All weeks"
  }

  const weekCount = activitiesDays.length
  if (weekCount >= 12) {
    return "All weeks"
  } else {
    return `${weekCount} weeks`
  }
}

// Function to fetch using the new QUT API
async function fetchFromNewAPI(unitCode: string, remainingRequests: number) {
  try {
    const formData = new URLSearchParams()
    formData.append("search-term", unitCode.toUpperCase())
    formData.append("semester", "ALL")
    formData.append("campus", "ALL")
    formData.append("faculty", "ALL")
    formData.append("type", "ALL")
    formData.append("days", "1")
    formData.append("days", "2")
    formData.append("days", "3")
    formData.append("days", "4")
    formData.append("days", "5")
    formData.append("days", "6")
    formData.append("days", "0")
    formData.append("start-time", "00:00")
    formData.append("end-time", "23:00")

    const response = await fetch("https://mytimetable.qut.edu.au/aplus/rest/timetable/subjects", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      body: formData.toString(),
    })

    console.log(
      `%c📡 NEW QUT API: Fetching ${unitCode} from new QUT API`,
      "background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
    )

    if (!response.ok) {
      return {
        error: true,
        message: `Unable to fetch timetable data. Please try again later.`,
        remainingRequests,
      }
    }

    const qutData: QUTResponse = await response.json()

    if (!qutData || Object.keys(qutData).length === 0) {
      return {
        error: true,
        message: `No timetable found for unit code "${unitCode}" in the specified teaching period`,
        remainingRequests,
      }
    }

    const timetableEntries: TimetableEntry[] = []

    Object.values(qutData).forEach((subject: QUTSubject) => {
      const unitName = subject.description

      Object.values(subject.activities).forEach((activity: QUTActivity) => {
        const startTime = formatTime(activity.start_time)
        const endTime = calculateEndTime(activity.start_time, activity.duration)
        const dayFormatted = convertDayName(activity.day_of_week)
        const location = formatLocationNew(activity.location, activity.campus)
        const teachingStaff = formatStaff(activity.staff)
        const activityType = formatActivityType(activity.activity_type)
        const weeksInfo = generateWeeksInfo(activity.activitiesDays)

        const classInfo = `${activity.activity_group_code}${activity.activity_code} - ${weeksInfo}${activity.description !== "-" ? ` - ${activity.description}` : ""}`

        let locationBuilding = ""
        let locationRoom = ""
        if (location !== "Online" && location !== "Virtual" && location !== "TBA" && location.includes("-")) {
          const parts = location.split("-")
          if (parts.length >= 2) {
            locationBuilding = parts.slice(0, -1).join("-")
            locationRoom = parts[parts.length - 1]
          }
        }

        timetableEntries.push({
          class: classInfo,
          activityType: activityType,
          classTitle: activityType,
          dayFormatted: dayFormatted,
          day: dayFormatted,
          startTime: startTime,
          endTime: endTime,
          location: location,
          locationBuilding: locationBuilding,
          locationRoom: locationRoom,
          teachingStaff: teachingStaff,
          unitCode: subject.callista_code,
          unitName: unitName,
          teachingPeriodId: "621052", // Default to Semester 2 2025 (All Campuses) for new API
        })
      })
    })

    // Sort the entries before returning
    const sortedEntries = sortTimetableEntries(timetableEntries)

    return {
      error: false,
      data: sortedEntries,
      cached: false,
      source: "qut_api_new",
      remainingRequests,
    }
  } catch (error) {
    console.error("Error in fetchFromNewAPI:", error)
    return {
      error: true,
      message: `Unable to fetch timetable data. Please try again later.`,
      remainingRequests,
    }
  }
}

// Function to fetch using the old QUT API (HTML scraping)
async function fetchFromOldAPI(unitCode: string, teachingPeriodId: string, remainingRequests: number) {
  try {
    const apiUrl =
      process.env.NEXT_PUBLIC_QUT_VIRTUAL_API_URL ||
      "https://qutvirtual3.qut.edu.au/qvpublic/ttab_unit_search_p.process_search"
    const url = new URL(apiUrl)

    url.searchParams.append("p_unit_cd", unitCode)
    url.searchParams.append("p_unit_cd_param", unitCode)
    url.searchParams.append("p_time_period_id", teachingPeriodId)
    url.searchParams.append("p_arg_names", "Class timetable search")
    url.searchParams.append("p_arg_values", "/ttab_unit_search_p.process_teach_period_search?")

    const response = await fetch(url.toString())

    console.log(
      `%c📡 OLD QUT API: Fetching ${unitCode} from legacy QUT API`,
      "background: #9c27b0; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
    )

    if (!response.ok) {
      return {
        error: true,
        message: `Unable to fetch timetable data. Please try again later.`,
        remainingRequests,
      }
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    if (html.includes("No matching records found")) {
      return {
        error: true,
        message: `No timetable found for unit code "${unitCode}" in the specified teaching period`,
        remainingRequests,
      }
    }

    const timetableEntries: TimetableEntry[] = []

    let unitName = ""
    const h2Elements = $("h2")
    h2Elements.each((index, element) => {
      const text = $(element).text().trim()
      if (text.includes(unitCode)) {
        const match = text.match(new RegExp(`${unitCode}\\s+(.+)`))
        if (match && match[1]) {
          unitName = match[1].trim()
        }
      }
    })

    const table = $("table.qv_table")

    if (table.length === 0) {
      return {
        error: true,
        message: `Sorry, we couldn't find that unit 😢. Please check the unit code and try again.`,
        remainingRequests,
      }
    }

    table.find("tr").each((index, row) => {
      if (index === 0) return

      const columns = $(row).find("td")

      if (columns.length >= 6) {
        const classInfo = $(columns[0]).text().trim()
        const activityType = $(columns[1]).text().trim()
        const day = $(columns[2]).text().trim()
        const timeRange = $(columns[3]).text().trim()

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
        const [startTime, endTime] = parseTimeRange(timeRange)
        const dayFormatted = formatDayName(day)

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
          day,
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

    // Sort the entries before returning
    const sortedEntries = sortTimetableEntries(timetableEntries)

    return {
      error: false,
      data: sortedEntries,
      cached: false,
      source: "qut_api_legacy",
      remainingRequests,
    }
  } catch (error) {
    console.error("Error in fetchFromOldAPI:", error)
    return {
      error: true,
      message: `Unable to fetch timetable data. Please try again later.`,
      remainingRequests,
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { unitCode, teachingPeriodId } = body

    if (!unitCode || !teachingPeriodId) {
      return NextResponse.json(
        { error: true, message: "Unit code and teaching period ID are required" },
        { status: 400 },
      )
    }

    const remainingRequests = Number.parseInt(req.headers.get("X-RateLimit-Remaining") || "15", 10)

    // Check server-side cache first
    try {
      const cachedData = await getTimetableFromCache(unitCode, teachingPeriodId)
      if (cachedData) {
        const formattedData = Array.isArray(cachedData) ? cachedData : []
        // Sort cached data as well
        const sortedCachedData = sortTimetableEntries(formattedData)

        return NextResponse.json({
          error: false,
          data: sortedCachedData,
          cached: true,
          source: "redis_cache",
          remainingRequests,
        })
      }
    } catch (cacheError) {
      console.error("Cache error:", cacheError)
      // Continue without cache if it fails
    }

    // Determine which API to use based on teaching period
    let result
    if (shouldUseNewAPI(teachingPeriodId)) {
      result = await fetchFromNewAPI(unitCode, remainingRequests)
    } else {
      result = await fetchFromOldAPI(unitCode, teachingPeriodId, remainingRequests)
    }

    // Store successful results in cache (already sorted)
    if (!result.error) {
      try {
        await storeTimetableInCache(unitCode, teachingPeriodId, result.data)
      } catch (cacheError) {
        console.error("Cache storage error:", cacheError)
        // Continue even if cache storage fails
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error fetching timetable data:", error)
    return NextResponse.json(
      { error: true, message: "Unable to fetch timetable data. Please try again later." },
      { status: 500 },
    )
  }
}

// Helper functions for old API
function parseTimeRange(timeRange: string): [string, string] {
  const parts = timeRange.split("-").map((part) => part.trim())

  if (parts.length === 2) {
    return [parts[0], parts[1]]
  }

  return [timeRange, timeRange]
}

function parseLocation(location: string): { building: string; room: string } {
  return { building: location, room: "" }
}
