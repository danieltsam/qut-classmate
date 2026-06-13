import * as cheerio from "cheerio"
import { formatDayName } from "@/lib/format-utils"
import type { TimetableEntry } from "@/lib/types"
import {
  buildUnitSearchUrl,
  fetchVirtual4SearchPage,
  QUT_VIRTUAL4_BASE,
  QUT_VIRTUAL4_BROWSER_HEADERS,
} from "@/lib/qutvirtual4-session"

const UNIT_CLASSES_PATH =
  "/web/qut/search?p_p_id=SolrQuest_WAR_solrquest&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getUnitClasses&p_p_cacheability=cacheLevelPage"

const API_HEADERS = {
  ...QUT_VIRTUAL4_BROWSER_HEADERS,
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
} as const

interface QutVirtual4Class {
  ACTIVITY_GROUP_CD: string
  DESCRIPTION: string
  CLASS_START_DAY: string
  CLASS_TIME_DISPLAY: string
  CLASS_NO: string
  STAFF: string
  LOCATION: string
}

interface QutVirtual4Response {
  data?: QutVirtual4Class[]
  errorMessage?: string
}

interface UnitSearchSession {
  csrfToken: string
  cookieHeader: string
  versionByPeriod: Map<string, string>
  unitNotFound: boolean
  availablePeriodIds: string[]
}

function parseUnitSearchPage(html: string, unitCode: string): Pick<UnitSearchSession, "versionByPeriod" | "unitNotFound" | "availablePeriodIds"> {
  const upperUnitCode = unitCode.toUpperCase()
  const versionByPeriod = new Map<string, string>()

  const classUrlPattern = new RegExp(
    `_SolrQuest_WAR_solrquest_timePeriodId=(\\d+)[^"'\\s]*_SolrQuest_WAR_solrquest_unitCode=${upperUnitCode}[^"'\\s]*_SolrQuest_WAR_solrquest_versionNumber=(\\d+)`,
    "g",
  )

  for (const match of html.matchAll(classUrlPattern)) {
    versionByPeriod.set(match[1], match[2])
  }

  const availablePeriodIds = [...versionByPeriod.keys()]
  const unitNotFound = availablePeriodIds.length === 0 && /No results/i.test(html)

  return {
    versionByPeriod,
    unitNotFound,
    availablePeriodIds,
  }
}

function stripHtml(html: string): string {
  if (!html || !html.includes("<")) {
    return html.trim()
  }
  return cheerio.load(html).text().replace(/\s+/g, " ").trim()
}

function parseActivityType(activityGroupCode: string): string {
  const prefix = activityGroupCode.replace(/\d+$/, "")
  const typeMap: Record<string, string> = {
    LEC: "Lecture",
    TUT: "Tutorial",
    PRA: "Practical",
    PRC: "Practical",
    WOR: "Workshop",
    STU: "Studio",
    SEM: "Seminar",
    LAB: "Laboratory",
  }
  return typeMap[prefix] || prefix
}

function parseTimeRange(display: string): [string, string] {
  const parts = display.split("-").map((part) => part.trim())
  if (parts.length !== 2) {
    return [display, display]
  }
  return [parts[0].toLowerCase().replace(/\s/g, ""), parts[1].toLowerCase().replace(/\s/g, "")]
}

function parseWeeksInfo(description: string): string {
  const match = description.match(/\((Week[^)]+)\)/i)
  return match?.[1] ?? "All weeks"
}

function parseLocation(rawLocation: string): {
  location: string
  locationBuilding: string
  locationRoom: string
} {
  const location = stripHtml(rawLocation)

  if (!location || location === "-") {
    return { location: "TBA", locationBuilding: "", locationRoom: "" }
  }

  if (location.toLowerCase() === "online") {
    return { location: "Online", locationBuilding: "", locationRoom: "" }
  }

  const parts = location.trim().split(/\s+/)
  if (parts.length >= 2) {
    return {
      location,
      locationBuilding: parts[0],
      locationRoom: parts.slice(1).join(" "),
    }
  }

  return { location, locationBuilding: location, locationRoom: "" }
}

function transformClass(
  item: QutVirtual4Class,
  unitCode: string,
  teachingPeriodId: string,
): TimetableEntry {
  const activityType = parseActivityType(item.ACTIVITY_GROUP_CD)
  const weeksInfo = parseWeeksInfo(item.DESCRIPTION)
  const [startTime, endTime] = parseTimeRange(item.CLASS_TIME_DISPLAY)
  const dayFormatted = formatDayName(item.CLASS_START_DAY)
  const { location, locationBuilding, locationRoom } = parseLocation(item.LOCATION)
  const teachingStaff = stripHtml(item.STAFF) || "TBA"
  const classInfo = `${item.ACTIVITY_GROUP_CD}${item.CLASS_NO} - ${weeksInfo}${item.DESCRIPTION.includes("Online Mode") ? " - Online" : item.DESCRIPTION.includes("Internal Mode") ? " - Internal" : ""}`

  return {
    class: classInfo,
    activityType,
    classTitle: activityType,
    dayFormatted,
    day: dayFormatted,
    startTime,
    endTime,
    location,
    locationBuilding,
    locationRoom,
    teachingStaff,
    unitCode: unitCode.toUpperCase(),
    teachingPeriodId,
  }
}

async function bootstrapUnitSearchSession(unitCode: string): Promise<UnitSearchSession> {
  const searchPageUrl = buildUnitSearchUrl({
    query: unitCode.toUpperCase(),
    showOldUnits: false,
  })

  const { html, csrfToken, cookieHeader } = await fetchVirtual4SearchPage(searchPageUrl)
  const metadata = parseUnitSearchPage(html, unitCode)

  return {
    csrfToken,
    cookieHeader,
    ...metadata,
  }
}

export async function fetchUnitClassesFromVirtual4(
  unitCode: string,
  teachingPeriodId: string,
): Promise<{ error: boolean; message?: string; data?: TimetableEntry[]; source?: string }> {
  try {
    const session = await bootstrapUnitSearchSession(unitCode)
    const upperUnitCode = unitCode.toUpperCase()
    const searchPageUrl = buildUnitSearchUrl({
      query: upperUnitCode,
      showOldUnits: false,
    })

    if (session.unitNotFound) {
      return {
        error: true,
        message: `Unit code "${upperUnitCode}" was not found. It may have been discontinued or renamed — double-check the code on QUT Virtual.`,
      }
    }

    const versionNumber = session.versionByPeriod.get(teachingPeriodId)

    if (!versionNumber) {
      return {
        error: true,
        message: `No timetable found for unit code "${upperUnitCode}" in the selected teaching period. Try a different semester.`,
      }
    }

    const url = new URL(`${QUT_VIRTUAL4_BASE}${UNIT_CLASSES_PATH}`)
    url.searchParams.set("_SolrQuest_WAR_solrquest_timePeriodId", teachingPeriodId)
    url.searchParams.set("_SolrQuest_WAR_solrquest_unitCode", upperUnitCode)
    url.searchParams.set("_SolrQuest_WAR_solrquest_versionNumber", versionNumber)

    const response = await fetch(url.toString(), {
      headers: {
        ...API_HEADERS,
        Cookie: session.cookieHeader,
        Referer: searchPageUrl,
        "X-CSRF-Token": session.csrfToken,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return {
        error: true,
        message: "Unable to fetch timetable data from QUT Virtual. Please try again later.",
      }
    }

    const payload = (await response.json()) as QutVirtual4Response

    if (payload.errorMessage) {
      return {
        error: true,
        message: payload.errorMessage,
      }
    }

    const classes = payload.data ?? []

    if (classes.length === 0) {
      return {
        error: true,
        message: `No classes are scheduled for "${upperUnitCode}" in the selected teaching period.`,
      }
    }

    return {
      error: false,
      data: classes.map((item) => transformClass(item, unitCode, teachingPeriodId)),
      source: "qut_virtual4",
    }
  } catch (error) {
    console.error("Error fetching from QUT Virtual 4:", error)
    return {
      error: true,
      message: "Unable to fetch timetable data. Please try again later.",
    }
  }
}
