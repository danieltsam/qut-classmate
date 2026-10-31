import * as cheerio from "cheerio"
import fs from "node:fs"
import path from "node:path"
import { formatDayName } from "@/lib/format-utils"
import type { TimetableEntry } from "@/lib/types"
import {
  noClassesScheduledMessage,
  unitNoLongerOfferedMessage,
  unitNotFoundMessage,
  unitNotOfferedInPeriodMessage,
} from "@/lib/messages"
import { findReplacements, lookupUnit, type KnownUnitsIndex, type PrereqIndex } from "@/lib/unit-lookup"
import { getAllDiscoveredPeriods } from "@/lib/teaching-periods"
import {
  buildUnitSearchUrl,
  fetchVirtual4SearchPage,
  QUT_VIRTUAL4_BASE,
  QUT_VIRTUAL4_BROWSER_HEADERS,
} from "@/lib/qutvirtual4-session"

const KNOWN_UNITS_FILE = path.join(process.cwd(), "data", "known-units.json")
const UNIT_PREREQS_FILE = path.join(process.cwd(), "data", "unit-prereqs.json")

/**
 * Both files are read lazily and cached for the life of the process: they are
 * only needed on the error path, where a code QUT returned no classes for has
 * to be classified honestly. Cached values are null when the file is missing or
 * unreadable, and the caller then behaves as if we know nothing, which is true.
 */
let knownUnitsCache: KnownUnitsIndex | null | undefined
let prereqCache: PrereqIndex | null | undefined

function loadKnownUnits(): KnownUnitsIndex | null {
  if (knownUnitsCache === undefined) {
    try {
      knownUnitsCache = JSON.parse(fs.readFileSync(KNOWN_UNITS_FILE, "utf8")) as KnownUnitsIndex
    } catch (error) {
      console.error("Could not read known-units.json:", error)
      knownUnitsCache = null
    }
  }
  return knownUnitsCache
}

function loadPrereqIndex(): PrereqIndex | null {
  if (prereqCache === undefined) {
    try {
      prereqCache = JSON.parse(fs.readFileSync(UNIT_PREREQS_FILE, "utf8")) as PrereqIndex
    } catch (error) {
      console.error("Could not read unit-prereqs.json:", error)
      prereqCache = null
    }
  }
  return prereqCache
}


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
  /** Period ID -> getUnitClasses versionNumber, for this exact unit code only. */
  versionByPeriod: Map<string, string>
  /** Period ID -> "Semester 1, 2027", scraped from the page's exam timetable links. */
  periodNames: Map<string, string>
  /** True when the page presents this unit as a search result, even with no classes. */
  unitListed: boolean
}

/** "SEM-1/2027/U" -> "Semester 1, 2027". Returns null for period codes we cannot name. */
function formatPeriodLabel(code: string): string | null {
  const match = code.match(/^SEM-(\d+)\/(\d{4})/i)
  return match ? `Semester ${match[1]}, ${match[2]}` : null
}

function parseUnitSearchPage(
  html: string,
  unitCode: string,
): Pick<UnitSearchSession, "versionByPeriod" | "periodNames" | "unitListed"> {
  const upperUnitCode = unitCode.toUpperCase()
  const versionByPeriod = new Map<string, string>()

  // Only links tagged with this unit code count. CAB202's page carries a class
  // link for EGH449 and nothing else, which is exactly how a retired unit looks.
  const classUrlPattern = new RegExp(
    `_SolrQuest_WAR_solrquest_timePeriodId=(\\d+)[^"'\\s]*_SolrQuest_WAR_solrquest_unitCode=${upperUnitCode}[^"'\\s]*_SolrQuest_WAR_solrquest_versionNumber=(\\d+)`,
    "g",
  )

  for (const match of html.matchAll(classUrlPattern)) {
    versionByPeriod.set(match[1], match[2])
  }

  // Each period the unit runs in has an exam timetable link carrying the human
  // period code, so we can name the semesters a unit is offered in.
  const periodNames = new Map<string, string>()
  const periodCodePattern =
    /p_time_period_id&(?:amp;)?p_arg_values=(\d+)&(?:amp;)?p_arg_names=p_teaching_period&(?:amp;)?p_arg_values=([A-Za-z0-9/_-]+)/g

  for (const match of html.matchAll(periodCodePattern)) {
    const label = formatPeriodLabel(match[2])
    if (label) periodNames.set(match[1], label)
  }

  // A retired unit still appears in the search box and in the query echo, so
  // look specifically for a result link or class table tagged with this code.
  const resultLinkPattern = new RegExp(
    `/web/qut/unit\\?[^"'\\s]*unitCode=${upperUnitCode}(?:[&"'\\s]|$)`,
    "i",
  )
  const classTablePattern = new RegExp(`data="${upperUnitCode}\\|`, "i")
  const unitListed = resultLinkPattern.test(html) || classTablePattern.test(html)

  return {
    versionByPeriod,
    periodNames,
    unitListed,
  }
}

/**
 * The semester labels for every period this unit is actually offered in, in the
 * order the page lists them. Anything we cannot name from the page falls back to
 * the discovered teaching period names, and unnamed periods are dropped rather
 * than leaking a numeric ID into copy a student reads.
 */
function collectOfferedPeriodNames(session: UnitSearchSession): string[] {
  const discovered = new Map(getAllDiscoveredPeriods().map((period) => [period.id, period.name]))
  const labels: string[] = []

  for (const periodId of session.versionByPeriod.keys()) {
    const label = session.periodNames.get(periodId) ?? discovered.get(periodId)
    if (label && !labels.includes(label)) labels.push(label)
  }

  return labels
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

/**
 * The sentence for a code QUT's search page has no classes for.
 *
 * Two different situations were being flattened into one: a unit we know about
 * but QUT no longer runs, and a code we have never seen at all. The first can be
 * said plainly and comes with suggestions pulled from the prereq index. The
 * second cannot, because QUT cannot tell a retired code from a typo either.
 *
 * Exported so the wording can be tested without going upstream.
 */
export function describeUnlistedUnit(
  unitCode: string,
  knownUnits: KnownUnitsIndex | null = loadKnownUnits(),
  prereqs: PrereqIndex | null = loadPrereqIndex(),
): string {
  const upperUnitCode = unitCode.toUpperCase()

  if (lookupUnit(upperUnitCode, knownUnits).kind === "unknown") {
    return unitNotFoundMessage(upperUnitCode)
  }

  return unitNoLongerOfferedMessage(
    upperUnitCode,
    findReplacements(upperUnitCode, knownUnits, prereqs),
  )
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

    if (session.versionByPeriod.size === 0) {
      // No class link for this unit code anywhere on the page. If QUT still
      // presents it as a result then it exists and simply has nothing scheduled.
      // Otherwise we can only say what our own data supports: a code we have
      // seen before is retired, a code we have never seen is just unrecognised.
      // QUT answers both cases with the same "Page not found" page.
      return {
        error: true,
        message: session.unitListed
          ? noClassesScheduledMessage(upperUnitCode)
          : describeUnlistedUnit(upperUnitCode),
      }
    }

    const versionNumber = session.versionByPeriod.get(teachingPeriodId)

    if (!versionNumber) {
      return {
        error: true,
        message: unitNotOfferedInPeriodMessage(upperUnitCode, collectOfferedPeriodNames(session)),
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
        message: noClassesScheduledMessage(upperUnitCode),
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
