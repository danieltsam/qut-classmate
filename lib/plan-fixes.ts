/**
 * "Where could this unit go so the problem goes away?"
 *
 * The course planner's problem strip reports two kinds of trouble it can also
 * resolve: a unit sitting before a unit it needs, and a unit parked in a semester
 * QUT does not teach it in. This module turns either into exactly one plan move.
 *
 * Kept out of the component and free of side effects for three reasons: the choice
 * of target semester is the part worth testing without a browser, a wrong move is
 * expensive to the student, and the same functions are cheap to call on every
 * render as long as nothing is written.
 *
 * Rules both finders follow:
 *
 * 1. One move, or nothing. The returned plan is the plan you passed in with that
 *    one unit in a different semester. No unit is dropped, added or reordered.
 *    The unit is appended to the end of its new semester, so the order of every
 *    other unit is untouched.
 * 2. A proposed move is checked before it is offered. The unit's prerequisites are
 *    re-evaluated at the destination, and a move that would leave the same problem
 *    in place is thrown away rather than shown as a button that does nothing.
 * 3. If no move is guaranteed, return null. The caller then shows the problem with
 *    no fix, which is honest; a dead button is not.
 */

import {
  buildEquivalentsMap,
  evaluatePrerequisites,
  type CompletedUnit,
  type EquivalentsMap,
  type PlanIssueKind,
  type PrereqIndex,
  type PrereqStatus,
} from "./prerequisites"
import { checkAvailability } from "./unit-availability"

/* ------------------------------------------------------------------ *
 * Input shapes
 * ------------------------------------------------------------------ */

/**
 * The parts of a plan this module needs. The planner's own `PlanSemester` carries
 * notes, sections and titles as well; both move helpers are generic over the
 * semester type so those survive the move.
 */
export interface FixSemester {
  id: string
  name: string
  units: Array<{ uid: string; code: string }>
}

/** One entry of `data/unit-prereqs.json`, narrowed to what a fix reads. */
export interface FixIndexEntry {
  prerequisites?: string | null
  equivalents?: string | null
  offerings?: string[] | null
}

/** Either the whole `data/unit-prereqs.json` document or a bare code -> entry map. */
export type FixIndex =
  | Record<string, FixIndexEntry | undefined>
  | { units: Record<string, FixIndexEntry | undefined> }

export interface FixOptions {
  /** Needed for "Ncp of COURSECODE" rules, same as `planIssues`. */
  courseCode?: string
}

/** What a fix would do, in both display and application terms. */
export interface PlanMove {
  unitUid: string
  unitCode: string
  fromSemesterId: string
  fromSemesterName: string
  toSemesterId: string
  toSemesterName: string
}

export interface PrerequisiteFixRequest {
  unitUid: string
  unitCode: string
  /** `planIssues`' own verdict: only a named missing unit can be fixed by moving. */
  kind: PlanIssueKind
  missingUnits: string[]
}

export interface AvailabilityFixRequest {
  unitUid: string
  unitCode: string
}

/* ------------------------------------------------------------------ *
 * Index helpers
 * ------------------------------------------------------------------ */

function normaliseCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : ""
}

function resolveIndex(index: FixIndex | null | undefined): Record<string, FixIndexEntry | undefined> {
  if (!index) return {}
  const wrapped = index as { units?: Record<string, FixIndexEntry | undefined> }
  if (wrapped.units && typeof wrapped.units === "object") return wrapped.units
  return index as Record<string, FixIndexEntry | undefined>
}

function entryFor(index: FixIndex | null | undefined, code: string): FixIndexEntry | undefined {
  const key = normaliseCode(code)
  if (!key) return undefined
  return resolveIndex(index)[key]
}

/**
 * QUT's equivalent-unit map, built once per index document.
 *
 * The whole index is 1,300+ units and the planner recomputes problems on every
 * drag-over, so rebuilding the map for each candidate semester would show up as
 * lag on the board. Keying on the document object is safe because the planner
 * holds one fetched document for the session: a new document is a new object and
 * therefore a fresh map.
 */
const equivalentsCache = new WeakMap<object, EquivalentsMap>()

function equivalentsFor(index: FixIndex | null | undefined): EquivalentsMap {
  if (!index || typeof index !== "object") return {}
  const cached = equivalentsCache.get(index)
  if (cached) return cached
  const built = buildEquivalentsMap(index as PrereqIndex)
  equivalentsCache.set(index, built)
  return built
}

/**
 * The unit plus every code QUT says is interchangeable with it, both directions.
 * A prerequisite satisfied by a swapped code has to count when we look for "is
 * that unit already somewhere in the plan".
 */
function withEquivalents(codes: string[], equivalents: EquivalentsMap): Set<string> {
  const out = new Set<string>()
  for (const code of codes) {
    const key = normaliseCode(code)
    if (!key) continue
    out.add(key)
    for (const other of equivalents[key] ?? []) out.add(normaliseCode(other))
  }
  // The map only declares one direction; honour the other one too.
  for (const key of Object.keys(equivalents)) {
    const list = equivalents[key].map(normaliseCode)
    if (list.some((other) => out.has(other))) out.add(normaliseCode(key))
  }
  out.delete("")
  return out
}

/* ------------------------------------------------------------------ *
 * Plan helpers
 * ------------------------------------------------------------------ */

interface LocatedUnit<T extends FixSemester> {
  unit: T["units"][number]
  semesterIndex: number
  semester: T
}

function locateUnit<T extends FixSemester>(plan: T[], unitUid: string): LocatedUnit<T> | null {
  if (!Array.isArray(plan) || typeof unitUid !== "string" || !unitUid) return null
  for (let semesterIndex = 0; semesterIndex < plan.length; semesterIndex += 1) {
    const semester = plan[semesterIndex]
    const unit = semester.units.find((candidate) => candidate.uid === unitUid)
    if (unit) return { unit, semesterIndex, semester }
  }
  return null
}

/** Everything in the semesters strictly before `semesterIndex`. */
function completedBefore<T extends FixSemester>(plan: T[], semesterIndex: number): CompletedUnit[] {
  const completed: CompletedUnit[] = []
  for (let index = 0; index < semesterIndex && index < plan.length; index += 1) {
    for (const unit of plan[index].units) {
      completed.push({ code: unit.code })
    }
  }
  return completed
}

/**
 * Does `unitUid`'s prerequisite hold where the plan now puts it?
 *
 * Same semantics as `planIssues`: only strictly earlier semesters count as
 * completed. Returning the raw status (rather than a boolean) keeps "we could not
 * read QUT's wording" separate from "this fails", because an unknown is not
 * evidence that a move works.
 */
function statusAt<T extends FixSemester>(
  plan: T[],
  unitUid: string,
  index: FixIndex | null | undefined,
  equivalents: EquivalentsMap,
  courseCode: string | undefined,
): PrereqStatus {
  const located = locateUnit(plan, unitUid)
  if (!located) return "unknown"

  try {
    return evaluatePrerequisites({
      prerequisites: entryFor(index, located.unit.code)?.prerequisites,
      completedUnits: completedBefore(plan, located.semesterIndex),
      courseCode,
      equivalents,
    }).status
  } catch {
    return "unknown"
  }
}

/**
 * The plan with one unit in a different semester. Always a new array when the move
 * is real, and the caller's plan is never touched.
 */
export function applyPlanMove<T extends FixSemester>(plan: T[], move: PlanMove): T[] {
  if (!Array.isArray(plan) || !move) return plan
  const source = plan.find((semester) => semester.id === move.fromSemesterId)
  const target = plan.find((semester) => semester.id === move.toSemesterId)
  if (!source || !target || source.id === target.id) return plan

  const unit = source.units.find((candidate) => candidate.uid === move.unitUid)
  if (!unit) return plan

  return plan.map((semester) => {
    if (semester.id === source.id) {
      return { ...semester, units: semester.units.filter((candidate) => candidate.uid !== move.unitUid) } as T
    }
    if (semester.id === target.id) {
      // Appended, not spliced: every other unit keeps its position.
      return { ...semester, units: [...semester.units, unit] } as T
    }
    return semester
  })
}

function sameMove(move: PlanMove): PlanMove {
  return {
    unitUid: move.unitUid,
    unitCode: move.unitCode,
    fromSemesterId: move.fromSemesterId,
    fromSemesterName: move.fromSemesterName,
    toSemesterId: move.toSemesterId,
    toSemesterName: move.toSemesterName,
  }
}

/* ------------------------------------------------------------------ *
 * Fix 1: a unit taken before the unit it needs
 * ------------------------------------------------------------------ */

/**
 * The semester a misordered unit should move to: one after the latest of its
 * prerequisite alternatives that is already in the plan.
 *
 * Returns null when there is nothing to move past (the required unit is not in the
 * plan at all, so no semester satisfies it), when the unit already sits after every
 * alternative (then the failure is a credit-point rule and moving changes nothing),
 * when there is no later semester to move into, or when the move does not actually
 * clear the problem.
 *
 * The unit is moved to exactly one semester past the latest alternative, not as far
 * as possible: that is the earliest semester that satisfies the rule, so the plan
 * changes as little as it has to.
 *
 * Nothing here checks whether the destination teaches the unit; if that introduces
 * an availability problem it appears in the strip as its own fixable row.
 */
export function findPrerequisiteMove<T extends FixSemester>(
  plan: T[],
  request: PrerequisiteFixRequest,
  index: FixIndex | null | undefined,
  options: FixOptions = {},
): PlanMove | null {
  if (!Array.isArray(plan) || !request) return null
  // A co-requisite wants the same semester, and a credit-point rule names no unit
  // that could be moved in front of anything.
  if (request.kind !== "prerequisite") return null

  const located = locateUnit(plan, request.unitUid)
  if (!located) return null

  const equivalents = equivalentsFor(index)
  const wanted = withEquivalents(request.missingUnits ?? [], equivalents)
  if (wanted.size === 0) return null

  // The latest semester holding an alternative the student already has elsewhere.
  let latestIndex = -1
  plan.forEach((semester, semesterIndex) => {
    for (const unit of semester.units) {
      if (unit.uid === located.unit.uid) continue
      if (!wanted.has(normaliseCode(unit.code))) continue
      if (semesterIndex > latestIndex) latestIndex = semesterIndex
    }
  })

  // Absent from the plan: there is nothing to move the unit after.
  if (latestIndex < 0) return null
  // Already after every alternative, so ordering is not what is failing.
  if (latestIndex < located.semesterIndex) return null

  const targetIndex = latestIndex + 1
  // No semester that late, and we do not invent columns to make a button work.
  if (targetIndex >= plan.length) return null

  const target = plan[targetIndex]
  const move = sameMove({
    unitUid: located.unit.uid,
    unitCode: normaliseCode(located.unit.code),
    fromSemesterId: located.semester.id,
    fromSemesterName: located.semester.name,
    toSemesterId: target.id,
    toSemesterName: target.name,
  })

  const moved = applyPlanMove(plan, move)
  if (statusAt(moved, located.unit.uid, index, equivalents, options.courseCode) !== "met") return null

  return move
}

/* ------------------------------------------------------------------ *
 * Fix 2: a unit in a semester QUT does not teach it in
 * ------------------------------------------------------------------ */

/**
 * The semester a misplaced unit should move to: the nearest one forward that it is
 * actually offered in, else the nearest one back.
 *
 * Forward first because moving a unit later delays graduation only for the units
 * behind it, while moving it earlier can push it in front of things it needs.
 *
 * A candidate that would break the unit's own prerequisites is skipped and the next
 * one tried, so a fix never trades one problem for another. When no candidate
 * passes, there is no fix: the empty-handed answer, not a broken move.
 *
 * This is what makes repeated fixing terminate. Every availability move lands on a
 * semester the unit is offered in *and* where its prerequisites already hold, so the
 * same unit cannot be picked up by either finder at that position again. Prerequisite
 * moves are strictly forward, so they cannot undo it either.
 */
export function findAvailabilityMove<T extends FixSemester>(
  plan: T[],
  request: AvailabilityFixRequest,
  index: FixIndex | null | undefined,
  options: FixOptions = {},
): PlanMove | null {
  if (!Array.isArray(plan) || !request) return null

  const located = locateUnit(plan, request.unitUid)
  if (!located) return null

  const code = normaliseCode(request.unitCode) || normaliseCode(located.unit.code)
  if (!code) return null

  // Only when the unit really is in a semester it is not taught in.
  if (checkAvailability(code, located.semester.name, index).status !== "unavailable") return null

  const equivalents = equivalentsFor(index)

  // Nearest forward, then nearest back.
  const candidates: number[] = []
  for (let i = located.semesterIndex + 1; i < plan.length; i += 1) candidates.push(i)
  for (let i = located.semesterIndex - 1; i >= 0; i -= 1) candidates.push(i)

  for (const targetIndex of candidates) {
    const target = plan[targetIndex]
    if (checkAvailability(code, target.name, index).status !== "ok") continue

    const move = sameMove({
      unitUid: located.unit.uid,
      unitCode: code,
      fromSemesterId: located.semester.id,
      fromSemesterName: located.semester.name,
      toSemesterId: target.id,
      toSemesterName: target.name,
    })

    const moved = applyPlanMove(plan, move)
    if (statusAt(moved, located.unit.uid, index, equivalents, options.courseCode) !== "met") continue
    return move
  }

  return null
}

/* ------------------------------------------------------------------ *
 * Copy
 * ------------------------------------------------------------------ */

/**
 * What the strip says after a fix lands, e.g.
 * "Moved CAB330 to Year 2, Semester 2."
 *
 * Short past tense, the unit code, the semester name QUT uses. No jargon and no
 * em-dash, same as everything else the student reads.
 */
export function describeMove(move: PlanMove): string {
  const code = normaliseCode(move?.unitCode) || "unit"
  const where = typeof move?.toSemesterName === "string" && move.toSemesterName.trim() ? move.toSemesterName.trim() : "the next semester"
  return `Moved ${code} to ${where}.`
}
