/**
 * "Does this unit actually run in the semester the plan puts it in?"
 *
 * The study plan is year-agnostic: a column is labelled "Year 2, Semester 1" and
 * QUT publishes the unit's offerings per calendar year ("Semester 2, 2026 -
 * Gardens Point (Internal)"). So the comparison is on the semester number only:
 * a unit that only ever runs in Semester 2 is wrong in a Semester 1 column, no
 * matter which year the student is in.
 *
 * Same rule as lib/prerequisites.ts: silence beats a wrong accusation. Anything
 * we cannot pin down - a column name we cannot read, a unit missing from the
 * index, a unit with no Semester offering at all - comes back as "unknown" and
 * the caller is expected to say nothing.
 *
 * Dependency-free so it can be imported by a server route or a client component.
 */

export type AvailabilityStatus = "ok" | "unavailable" | "unknown"

export interface AvailabilityResult {
  status: AvailabilityStatus
  /** Distinct semester numbers the unit is offered in, ascending. Never invented. */
  offeredIn: number[]
}

export interface AvailabilityEntry {
  offerings?: string[] | null
}

/**
 * Either a bare code -> entry map or the whole `unit-prereqs.json` document,
 * matching the shapes `lib/prerequisites.ts` accepts.
 */
export type AvailabilityIndex =
  | Record<string, AvailabilityEntry | undefined>
  | { units?: Record<string, AvailabilityEntry | undefined> }

// "Year 1, Semester 2" / "Semester 1 (February) entry" / "Year 3, Semester 1".
const SEMESTER_IN_NAME = /semester\s+([12])\b/i

// An intake marker in the column name. A July intake's "Semester 1" is the
// calendar's Semester 2 (its study year starts in July), so the number in the
// name stops meaning the calendar semester the unit is published under.
const INTAKE_MARKER = /\((?:july|february|january|november|december|summer)[^)]*\)/i

// "February and July entry" and friends: a section heading, not a column.
const SECTION_HEADING = /entry\s*$/i

/**
 * The semester number a plan column refers to, or null when the name cannot be
 * trusted to mean a calendar semester.
 *
 * "Year 2, Semester 1 (July)" returns null on purpose: in the July intake that
 * column holds units published as Semester 2, so treating it as Semester 1 would
 * flag half of QUT's own plan. Heading names ("Semester 1 (February) entry") do
 * name their semester explicitly, so those still parse.
 */
export function semesterNumberFromName(name: string): 1 | 2 | null {
  if (typeof name !== "string") return null
  const text = name.trim()
  if (!text) return null

  const match = SEMESTER_IN_NAME.exec(text)
  if (!match) return null

  if (INTAKE_MARKER.test(text) && !SECTION_HEADING.test(text)) return null

  return match[1] === "1" ? 1 : 2
}

// The teaching period is the part before the first comma and before the campus:
// "Semester 2, 2026 - Gardens Point (Internal)" -> "Semester 2".
const OFFERING_SEMESTER = /^semester\s+([12])\b/i

/**
 * Semester numbers an entry is offered in. Intensives ("Semester 2 - 6 Week D")
 * still belong to their semester; anything else ("Summer", "College 1",
 * "Flexible Period - 05A") has no semester number and is left out, which is what
 * makes a Summer-only unit "unknown" rather than "unavailable".
 */
function offeringSemesters(offerings: unknown): number[] {
  if (!Array.isArray(offerings)) return []
  const found = new Set<number>()
  for (const raw of offerings) {
    if (typeof raw !== "string") continue
    const period = raw.split(",")[0]
    const match = OFFERING_SEMESTER.exec(period.trim())
    if (match) found.add(match[1] === "1" ? 1 : 2)
  }
  return [...found].sort((a, b) => a - b)
}

function resolveIndex(index: AvailabilityIndex | null | undefined): Record<string, AvailabilityEntry | undefined> {
  if (!index) return {}
  const wrapped = index as { units?: Record<string, AvailabilityEntry | undefined> }
  if (wrapped.units && typeof wrapped.units === "object") return wrapped.units
  return index as Record<string, AvailabilityEntry | undefined>
}

/**
 * Is `unitCode` taught in the semester named by `semesterName`?
 *
 * Never throws. `offeredIn` is returned even when the status is "unknown" so a
 * caller can still describe what it did find.
 */
export function checkAvailability(
  unitCode: string,
  semesterName: string,
  index: AvailabilityIndex | null | undefined,
): AvailabilityResult {
  try {
    const target = semesterNumberFromName(semesterName)
    const code = typeof unitCode === "string" ? unitCode.trim().toUpperCase() : ""

    const table = resolveIndex(index)
    const entry = code ? table[code] : undefined
    const offeredIn = entry ? offeringSemesters(entry.offerings) : []

    // No column semester, no entry, or nothing we can map to a semester: stay quiet.
    if (target === null || offeredIn.length === 0) {
      return { status: "unknown", offeredIn }
    }

    return {
      status: offeredIn.indexOf(target) === -1 ? "unavailable" : "ok",
      offeredIn,
    }
  } catch {
    return { status: "unknown", offeredIn: [] }
  }
}

/** "Semester 2 only" / "Semester 1 and Semester 2", for a one-line reason. */
export function describeOfferings(offeredIn: number[]): string {
  const semesters = (offeredIn || []).filter((value) => value === 1 || value === 2)
  if (semesters.length === 0) return "no semester offering on record"
  if (semesters.length === 1) return `Semester ${semesters[0]} only`
  return `Semester ${semesters.join(" and ")} only`
}
