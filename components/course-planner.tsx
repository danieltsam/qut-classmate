"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  CalendarX,
  Check,
  ChevronDown,
  ExternalLink,
  GripVertical,
  Info,
  Layers3,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { SectionNote } from "@/components/section-note"
import { planIssues, type PlanIssue, type PlanIssueKind } from "@/lib/prerequisites"
import { checkAvailability, describeOfferings, semesterNumberFromName } from "@/lib/unit-availability"
import {
  applyPlanMove,
  describeMove,
  findAvailabilityMove,
  findPrerequisiteMove,
  type PlanMove,
} from "@/lib/plan-fixes"

/** QUT treats 48 credit points (4 × 12 CP units) as a full-time semester. */
const FULL_TIME_CP = 48
const STORAGE_PREFIX = "qut-classmate:course-planner"
const STAR_STORAGE_KEY = `${STORAGE_PREFIX}:stars`

// ── Load target ──────────────────────────────────────────────────────────────
//
// 48 CP is what QUT calls full-time, but it is not what every student plans.
// Someone working two days a week wants a lighter semester, someone catching up
// wants a heavier one, and a degree can be spread out deliberately. So the
// yardstick is a setting now: one default for the plan, plus optional per-semester
// overrides. It only changes what the numbers are measured against — it never
// stops a unit from being moved.

const DEFAULT_LOAD_TARGET = FULL_TIME_CP
const LOAD_TARGET_STORAGE_KEY = `${STORAGE_PREFIX}:load-target`
const LOAD_OVERRIDES_STORAGE_KEY = `${STORAGE_PREFIX}:load-overrides`
const TUNE_STORAGE_KEY = `${STORAGE_PREFIX}:tune`

/** Choices offered for the plan-wide default. */
const LOAD_TARGET_PRESETS: Array<{ value: number; label: string }> = [
  { value: 48, label: "Full-time (48 CP)" },
  { value: 36, label: "Three-quarter (36 CP)" },
  { value: 24, label: "Part-time (24 CP)" },
  // Taking more than full-time is a real choice, not an error: six 12 CP units in
  // one semester is 72 CP, and plenty of students do it to finish sooner.
  { value: 60, label: "Five units (60 CP)" },
  { value: 72, label: "Six units (72 CP)" },
]

/** Choices offered on a single semester column, on top of "follow the plan". */
const SEMESTER_TARGET_CHOICES = [72, 60, 48, 36, 24, 12]

/** A plausible credit-point target, or null if the stored value is junk. */
function normaliseLoadTarget(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 240) return null
  return Math.round(numeric)
}

function readLoadTarget(): number {
  try {
    const raw = window.localStorage.getItem(LOAD_TARGET_STORAGE_KEY)
    if (!raw) return DEFAULT_LOAD_TARGET
    return normaliseLoadTarget(JSON.parse(raw)) ?? DEFAULT_LOAD_TARGET
  } catch {
    return DEFAULT_LOAD_TARGET
  }
}

function readLoadOverrides(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(LOAD_OVERRIDES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const overrides: Record<string, number> = {}
    for (const [semesterId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const target = normaliseLoadTarget(value)
      if (target !== null) overrides[semesterId] = target
    }
    return overrides
  } catch {
    return {}
  }
}

/**
 * The plan default applies to every semester that has no override, including
 * semesters added by QUT after the override was stored.
 */
function resolveLoadTarget(override: number | null | undefined, planTarget: number): number {
  return typeof override === "number" && Number.isFinite(override) && override > 0 ? override : planTarget
}

/**
 * Whether the tuning controls were left open. Collapsed is the default: a
 * student who has just enrolled should see their plan, not the knobs. Anything
 * other than a stored "true" reads as closed, so a corrupt value cannot expand
 * the planner.
 */
function readTune(): boolean {
  try {
    return window.localStorage.getItem(TUNE_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

function writeTune(open: boolean) {
  try {
    window.localStorage.setItem(TUNE_STORAGE_KEY, open ? "true" : "false")
  } catch {
    // Storage full or blocked: the disclosure still opens for this session.
  }
}

function readStarredCodes(): string[] {
  try {
    const raw = window.localStorage.getItem(STAR_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
  } catch {
    return []
  }
}

function writeStarredCodes(codes: string[]) {
  try {
    window.localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify(codes))
  } catch {
    // Storage full or blocked — starring is a nice-to-have, not a blocker.
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CourseSummary {
  code: string
  title: string
  creditPoints: number | null
  aqfLevel: string | null
  pathways: number
  plans: number
  hasStructure: boolean
}

interface StructureUnit {
  code: string
  title: string
  creditPoints: number
  campus: string
}

interface StructureSemester {
  name: string
  notes: string[]
  units: StructureUnit[]
}

interface Structure {
  id: string
  title: string
  /** "progression" = a real study plan; "options" = a pool of option units. */
  kind?: "progression" | "options"
  unitCount: number | null
  creditPoints: number | null
  semesters: StructureSemester[]
}

interface Specialization {
  name: string
  structures: Structure[]
}

interface CourseDetail {
  courseCode: string
  courseTitle: string
  creditPoints: number | null
  aqfLevel: string | null
  approvedMajors: string[]
  specializations: Specialization[]
}

interface PlanUnit {
  uid: string
  code: string
  title: string
  creditPoints: number
  /** Set when this unit was chosen to fill one of the plan's option slots. */
  slotId?: string
}

interface PlanSemester {
  id: string
  name: string
  section: string
  notes: string[]
  units: PlanUnit[]
}

/**
 * A note that asks the student to pick something ("Select one QUT You unit"),
 * resolved against the course's option pools. Slots are derived from the plan's
 * notes on every render rather than stored, so an old saved plan picks them up
 * without a migration; only the chosen unit is persisted, via `PlanUnit.slotId`.
 */
interface CandidateGroup {
  name: string
  notes: string[]
  units: StructureUnit[]
  /** True when the group heading says it is no longer available to new students. */
  legacy: boolean
  /** True when the group is a header-only divider with no units. */
  headerOnly: boolean
}

interface PlanSlot {
  id: string
  semesterId: string
  /** Position of the note in the semester's notes array; stable across reloads. */
  noteIndex: number
  /** The original QUT note this slot stands in for. */
  note: string
  label: string
  creditPoints: number
  /** Flat candidate list, kept for counts and backwards compatibility. */
  candidates: StructureUnit[]
  /** Candidates grouped by the option pool's semester headings (majors, minors, etc). */
  groups: CandidateGroup[]
  sourceTitles: string[]
}

type LoadState = "idle" | "loading" | "ready" | "error"

// ── Study-plan checks ────────────────────────────────────────────────────────
//
// One entry of data/unit-prereqs.json. Only `prerequisites` and `equivalents`
// feed lib/prerequisites.ts; `offerings` feeds lib/unit-availability.ts.

interface PrereqEntry {
  title?: string | null
  prerequisites?: string | null
  antiRequisites?: string | null
  coRequisites?: string | null
  equivalents?: string | null
  assumedKnowledge?: string | null
  offerings?: string[] | null
}

interface PrereqDocument {
  units: Record<string, PrereqEntry | undefined>
}

/** Why a card is dotted. The colour comes from `kind`; the words live in the strip. */
type ProblemKind = "prereq" | "availability"

interface PlanProblem {
  kind: ProblemKind
  /** One action the student can take, e.g. "Take AYB150 before AYB202". */
  sentence: string
  /** The full alternative list, for the card/strip tooltip only. */
  detail?: string
  /** Present only when lib/plan-fixes.ts could guarantee a move that clears it. */
  fix?: PlanProblemFix
}

/**
 * A one-tap repair. `move` is a complete plan update worked out ahead of time, so
 * clicking the button does exactly one thing to the plan and nothing is recomputed
 * on the click.
 */
interface PlanProblemFix {
  label: string
  kind: ProblemKind
  move: PlanMove
}

interface PlanProblems {
  prereq: PlanProblem[]
  availability: PlanProblem[]
  /** Keyed by PlanUnit.uid — a dot belongs to one card, not to a unit code. */
  byUid: Map<string, PlanProblem[]>
}

/**
 * One sentence per problem, naming a single thing to do.
 *
 * The strip is read by students, not by the prerequisite evaluator, so the extra
 * alternatives move into `detail` (a tooltip) instead of trailing "or ..." onto
 * every line. The words "prerequisite" and "co-requisite" stay out of the
 * visible copy for the same reason: "take X first" is the instruction.
 */
function describeIssue(
  kind: PlanIssueKind,
  unitCode: string,
  missingUnits: string[],
  presentInPlan: Set<string>,
): { sentence: string; detail?: string } {
  const codes = missingUnits.filter((code) => typeof code === "string" && code.length > 0)

  // A credit-point rule ("120cp of IFB% units") names no unit at all, so there
  // is nothing to "take" and the sentence says what is actually missing.
  if (codes.length === 0) {
    return { sentence: `${unitCode} needs more credit points from earlier semesters` }
  }

  // The first alternative is the default, but an alternative the student already
  // has somewhere in the plan is a better instruction: that unit is a drag, not an
  // extra unit to add.
  const named = codes.find((code) => presentInPlan.has(code)) ?? codes[0]
  const listed = codes.length > 1 ? `Any of these works: ${codes.join(", ")}` : undefined

  if (kind === "coRequisite") {
    return { sentence: `Take ${named} in the same semester as ${unitCode}`, detail: listed }
  }

  return { sentence: `Take ${named} before ${unitCode}`, detail: listed }
}

// ── Normalisation ────────────────────────────────────────────────────────────

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** The scraper emits lowercase pathway names and a `#requirements` suffix. */
function prettyName(raw: string): string {
  if (!raw) return ""
  const [base, ...rest] = raw.split("#")
  const suffix = rest.length ? " (requirements)" : ""
  const smallWords = new Set(["and", "or", "of", "the", "for", "to", "in", "on", "a"])
  const words = base
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (lower === "it") return "IT"
      if (lower === "ai") return "AI"
      if (index > 0 && smallWords.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
  return words.join(" ") + suffix
}

function normaliseCourse(raw: any): CourseDetail | null {
  if (!raw || typeof raw !== "object") return null
  const code = asString(raw.courseCode).toUpperCase()
  if (!code) return null

  const specializations: Specialization[] = asArray(raw.specializations).map((spec: any, si) => ({
    name: asString(spec?.name, `Pathway ${si + 1}`),
    structures: asArray(spec?.structures).map((structure: any, ti) => ({
      id: asString(structure?.id, `st${si}-${ti}`),
      title: asString(structure?.title, `Study plan ${ti + 1}`),
      // Whitelisted field: without this the plan picker cannot tell a real
      // progression from an option pool and offers both.
      kind: structure?.kind === "options" ? "options" : "progression",
      unitCount: asNumber(structure?.unitCount),
      creditPoints: asNumber(structure?.creditPoints),
      semesters: asArray(structure?.semesters).map((semester: any, mi) => ({
        name: asString(semester?.name, `Semester ${mi + 1}`),
        notes: asArray(semester?.notes).filter((note): note is string => typeof note === "string" && note.trim().length > 0),
        units: asArray(semester?.units)
          .map((unit: any) => ({
            code: asString(unit?.code).toUpperCase(),
            title: asString(unit?.title),
            creditPoints: asNumber(unit?.creditPoints) ?? 0,
            campus: asString(unit?.campus),
          }))
          .filter((unit) => unit.code.length > 0),
      })),
    })),
  }))

  return {
    courseCode: code,
    courseTitle: asString(raw.courseTitle, code),
    creditPoints: asNumber(raw.creditPoints),
    aqfLevel: asString(raw.aqfLevel) || null,
    approvedMajors: asArray(raw.approvedMajors).filter((major): major is string => typeof major === "string"),
    specializations: specializations.filter((spec) => spec.structures.length > 0),
  }
}

// ── Plan state ───────────────────────────────────────────────────────────────

/**
 * "Semester 1 (February) entry" is a section heading in QUT's structure, not a
 * semester you can put units in. Track it as a section label instead.
 */
function sectionLabel(name: string): string {
  const match = name.match(/\(([^)]+)\)/)
  return match ? `${match[1]} entry` : name
}

function isSectionHeading(semester: StructureSemester): boolean {
  return semester.units.length === 0 && semester.notes.length === 0 && /entry\s*$/i.test(semester.name)
}

function buildQutPlan(structure: Structure): PlanSemester[] {
  const plan: PlanSemester[] = []
  let section = ""

  structure.semesters.forEach((semester, si) => {
    if (isSectionHeading(semester)) {
      section = sectionLabel(semester.name)
      return
    }
    plan.push({
      id: `s${si}`,
      name: semester.name,
      section,
      notes: semester.notes,
      units: semester.units.map((unit, ui) => ({
        uid: `s${si}u${ui}`,
        code: unit.code,
        title: unit.title || unit.code,
        creditPoints: unit.creditPoints,
      })),
    })
  })

  return plan
}

function isValidPlan(value: unknown): value is PlanSemester[] {
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every((semester: any) => {
    if (!semester || typeof semester !== "object") return false
    if (typeof semester.id !== "string" || typeof semester.name !== "string") return false
    if (!Array.isArray(semester.units)) return false
    return semester.units.every(
      (unit: any) => unit && typeof unit.uid === "string" && typeof unit.code === "string",
    )
  })
}

/**
 * What the plan looks like for equality checks: the units per column, the notes
 * (where an open option slot lives) and the column names. Leaving notes out would
 * make a reflow that moved only its slots look like a no-op; leaving names out
 * would drop a rename that comes with a reflow.
 */
function planSignature(plan: PlanSemester[]): string {
  return plan
    .map(
      (semester) =>
        `${semester.id}:${semester.name}:${semester.units.map((unit) => unit.code).join(",")}#${JSON.stringify(semester.notes)}`,
    )
    .join("|")
}

function planStorageKey(courseCode: string, specIndex: number, structureId: string): string {
  return `${STORAGE_PREFIX}:plan:${courseCode}:${specIndex}:${structureId}`
}

function readStoredPlan(key: string): PlanSemester[] | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const plan = isValidPlan(parsed) ? parsed : null
    if (!plan) return null
    return plan.map((semester) => ({
      id: semester.id,
      name: semester.name,
      section: typeof semester.section === "string" ? semester.section : "",
      notes: Array.isArray(semester.notes) ? semester.notes.filter((n): n is string => typeof n === "string") : [],
      units: semester.units.map((unit) => ({
        uid: unit.uid,
        code: unit.code,
        title: typeof unit.title === "string" && unit.title ? unit.title : unit.code,
        creditPoints: typeof unit.creditPoints === "number" ? unit.creditPoints : 0,
        slotId: typeof (unit as any).slotId === "string" && (unit as any).slotId ? ((unit as any).slotId as string) : undefined,
      })),
    }))
  } catch {
    return null
  }
}

function moveUnit(
  plan: PlanSemester[],
  fromId: string,
  toId: string,
  unitUid: string,
  overUid: string,
): PlanSemester[] {
  if (fromId === toId) return plan
  const from = plan.find((semester) => semester.id === fromId)
  const to = plan.find((semester) => semester.id === toId)
  if (!from || !to) return plan

  const unit = from.units.find((candidate) => candidate.uid === unitUid)
  if (!unit) return plan

  const overIndex = to.units.findIndex((candidate) => candidate.uid === overUid)
  const insertAt = overIndex >= 0 ? overIndex : to.units.length

  return plan.map((semester) => {
    if (semester.id === fromId) {
      return { ...semester, units: semester.units.filter((candidate) => candidate.uid !== unitUid) }
    }
    if (semester.id === toId) {
      const units = [...semester.units]
      units.splice(insertAt, 0, unit)
      return { ...semester, units }
    }
    return semester
  })
}

function creditPointsOf(semester: PlanSemester): number {
  return semester.units.reduce((total, unit) => total + (unit.creditPoints || 0), 0)
}

/** Slot ids already satisfied by a unit sitting in this semester. */
function filledSlotIds(semester: PlanSemester): Set<string> {
  return new Set(
    semester.units.map((unit) => unit.slotId).filter((id): id is string => typeof id === "string" && id.length > 0),
  )
}

// ── Option slots ─────────────────────────────────────────────────────────────
//
// QUT writes the parts of a plan you choose yourself as notes under the semester
// ("Select one QUT You unit (6 credit points)") instead of listing a unit. That
// is why the plan used to read as plain text you could not act on. Each note
// that names a choice becomes an empty slot, backed by the matching
// `kind: "options"` pool from the same course.

interface SlotRule {
  /** Tested against the note text. */
  match: RegExp
  label: string
  /** Structure-title patterns, tried in order — the first one that hits wins. */
  sources: RegExp[]
}

const SLOT_RULES: SlotRule[] = [
  { match: /qut you/i, label: "QUT You unit", sources: [/qut you/i] },
  {
    match: /complementary/i,
    label: "Complementary studies unit",
    // Complementary study is meant to be from outside the faculty, so a
    // university-wide elective list is a better pool than a major's own options.
    sources: [/complementary/i, /university wide/i, /second major options|minor options/i],
  },
  { match: /second major/i, label: "Second major unit", sources: [/second major/i] },
  { match: /minor/i, label: "Minor unit", sources: [/minor/i] },
  {
    match: /business core unit option|business option unit|undergraduate business option/i,
    label: "Business option unit",
    sources: [/business core|business option/i],
  },
  {
    match: /specialisation|specialization/i,
    label: "Specialisation unit",
    sources: [/specialisation|specialization/i],
  },
]

/** A double degree's "other half" is not in this course's pools. */
const OTHER_DEGREE_NOTE = /other degree/i

function isOtherDegreeNote(note: string): boolean {
  return OTHER_DEGREE_NOTE.test(note)
}

/** "(6 credit points)" → 6. QUT omits the weight on some notes; those default to 12. */
function noteCreditPoints(note: string): number {
  const match = note.match(/(\d+)\s*credit points?/i)
  return match ? Number(match[1]) : 12
}

function pickPools(pool: Structure[], patterns: RegExp[]): Structure[] {
  for (const pattern of patterns) {
    const hits = pool.filter((structure) => pattern.test(structure.title))
    if (hits.length > 0) return hits
  }
  return []
}

interface SlotSpec {
  label: string
  creditPoints: number
  candidates: StructureUnit[]
  groups: CandidateGroup[]
  sourceTitles: string[]
}

const LEGACY_GROUP_NAME = /for information only|not available for new intake/i

/**
 * Build grouped candidate lists from the matched option pools, preserving the
 * source order of groups and the units inside each group. The flat list is kept
 * for counts and for any callers that expect a simple array.
 */
function buildCandidateGroups(pools: Structure[]): CandidateGroup[] {
  const seenCodes = new Set<string>()
  const groups: CandidateGroup[] = []

  for (const pool of pools) {
    for (const semester of pool.semesters) {
      const units: StructureUnit[] = []
      for (const unit of semester.units) {
        if (seenCodes.has(unit.code)) continue
        seenCodes.add(unit.code)
        units.push(unit)
      }
      groups.push({
        name: semester.name,
        notes: semester.notes,
        units,
        legacy: LEGACY_GROUP_NAME.test(semester.name),
        headerOnly: units.length === 0,
      })
    }
  }

  const live = groups.filter((group) => !group.legacy)
  const legacy = groups.filter((group) => group.legacy)
  return [...live, ...legacy]
}

/** Flat candidate list in source order, deduplicated across all groups. */
function slotCandidates(pools: Structure[]): StructureUnit[] {
  return buildCandidateGroups(pools).flatMap((group) => group.units)
}

/**
 * Returns null for anything that is not a fillable choice — including notes
 * whose keyword matches no option pool, which then stay plain text rather than
 * rendering a "Choose unit" button with nothing behind it.
 */
function classifyNote(note: string, pool: Structure[]): SlotSpec | null {
  if (isOtherDegreeNote(note)) return null
  for (const rule of SLOT_RULES) {
    if (!rule.match.test(note)) continue
    const pools = pickPools(pool, rule.sources)
    if (pools.length === 0) return null
    const groups = buildCandidateGroups(pools)
    const candidates = groups.flatMap((group) => group.units)
    if (candidates.length === 0) return null
    return {
      label: rule.label,
      creditPoints: noteCreditPoints(note),
      candidates,
      groups,
      sourceTitles: pools.map((structure) => structure.title),
    }
  }
  return null
}

function deriveSlots(plan: PlanSemester[], pool: Structure[]): Map<string, PlanSlot[]> {
  const map = new Map<string, PlanSlot[]>()
  if (pool.length === 0) return map
  for (const semester of plan) {
    const slots: PlanSlot[] = []
    semester.notes.forEach((note, index) => {
      const hit = classifyNote(note, pool)
      if (!hit) return
      slots.push({
        ...hit,
        note,
        // Stable across reloads: the note's index in QUT's own notes array.
        id: `${semester.id}~note${index}`,
        semesterId: semester.id,
        noteIndex: index,
      })
    })
    if (slots.length > 0) map.set(semester.id, slots)
  }
  return map
}

// ── Load reflow ──────────────────────────────────────────────────────────────
//
// The load target used to be a yardstick: it coloured the "36 / 48 CP" numbers and
// never touched the layout. Changing it now moves units instead, but only the ones
// that no longer fit: a semester keeps its own units in their own order, and
// whatever is over its target spills into the front of the next semester. Columns
// are appended when the tail overflows. Nothing is dropped, so "Reset to QUT plan"
// is still the undo.
//
// Reflow only ever pushes units *forward*. It deliberately does not pull a unit
// out of a later semester to top up an under-filled one, and that is what makes a
// target change reversible: QUT's own plans are frequently under 48 CP per
// semester (BS05 Accounting runs 36 CP of units plus 12 CP of pending QUT You
// slots), so a greedy "fill every semester to the target" packer would drag
// units into earlier semesters and 48 → 36 → 48 would come back somewhere else.
// Pushing only what overflows keeps the 48 layout identical to QUT's.
//
// Two decisions worth knowing:
//
// 1. An open option slot is load. "Select one QUT You unit (6 credit points)"
//    is 6 CP the semester still has to find room for, so an unfilled slot is
//    packed alongside the units instead of staying pinned where its note
//    started: at 24 CP a column that sheds its units would otherwise keep every
//    dashed card and go on reading as a full one. Plain notes carry no credit
//    weight and stay put. Units and slots are packed *together*, each column
//    giving the units a share of its room that matches how much of the plan is
//    still units and handing the rest to the choices: appending every choice
//    after every unit produced eight full unit columns and one pile of dashed
//    cards at 24 CP, which is both the wrong length and far too dense. A slot
//    that is already filled is not extra load (its unit is), and its note follows
//    that unit. Notes keep their position within a column unless they move, which
//    is what keeps a slot id stable across a reflow that does not move it.
//
// 1b. A column with nothing but unfilled slots is folded into a neighbour that
//    has units when it fits, and a path keeps at most one trailing choices
//    column. Columns are then renamed to their position in the path (Year 1
//    Semester 1, Semester 2, Year 2 Semester 1…), because a folded plan with
//    holes in QUT's numbering reads as lost data.
//
// 2. A plan can hold two entry paths ("February entry", "July entry") in one
//    array, both starting at "Year 1, Semester 1". Reflow runs per contiguous
//    section, otherwise one intake's units would pour into the other's columns.

const YEAR_SEMESTER_NAME = /^(.*?\bYear\s+)(\d+)(\D*?Semester\s+)(\d+)(.*)$/i
const MONTH_SEMESTER_NAME = /^(.*?\bYear\s+)(\d+)(\D*?)(February|July)(\s+Semester\b.*)$/i
const PLAIN_SEMESTER_NAME = /^(\s*Semester\s+)(\d+)(.*)$/i

/** One step forward in QUT's own naming: "Year 3, Semester 2" → "Year 4, Semester 1". */
function advanceSemesterName(name: string): string | null {
  const yearSemester = YEAR_SEMESTER_NAME.exec(name)
  if (yearSemester) {
    const [, lead, yearText, joiner, semesterText, tail] = yearSemester
    const year = Number(yearText)
    const semester = Number(semesterText)
    // QUT plans only ever publish semesters 1 and 2, so 2 rolls into the next year.
    const rollsOver = semester >= 2
    return `${lead}${rollsOver ? year + 1 : year}${joiner}${rollsOver ? 1 : semester + 1}${tail}`
  }

  const monthSemester = MONTH_SEMESTER_NAME.exec(name)
  if (monthSemester) {
    const [, lead, yearText, joiner, month, tail] = monthSemester
    // A July intake runs July, then February of the next calendar year.
    const isJuly = /july/i.test(month)
    return `${lead}${isJuly ? Number(yearText) + 1 : Number(yearText)}${joiner}${isJuly ? "February" : "July"}${tail}`
  }

  const plain = PLAIN_SEMESTER_NAME.exec(name)
  if (plain) {
    const [, lead, numberText, tail] = plain
    return `${lead}${Number(numberText) + 1}${tail}`
  }

  return null
}

/**
 * The next unused name after `lastName`, stepping forward until it does not
 * collide with a column already in this section. Unparseable names fall back to a
 * numbered copy rather than repeating an existing name.
 */
function nextSemesterName(lastName: string, taken: Set<string>): string {
  let candidate = lastName
  for (let step = 0; step < 40; step += 1) {
    const advanced = advanceSemesterName(candidate)
    if (!advanced) break
    candidate = advanced
    if (!taken.has(candidate)) return candidate
  }
  const base = lastName || "Semester"
  let suffix = 2
  while (taken.has(`${base} (${suffix})`)) suffix += 1
  return `${base} (${suffix})`
}

// ── Column names ─────────────────────────────────────────────────────────────

/** The "(July)" style marker a column name carries, if any. */
const NAME_MARKER = /\s*\(([^)]*)\)\s*$/

function nameMarker(name: string): string | null {
  const match = NAME_MARKER.exec(name)
  return match ? `(${match[1]})` : null
}

function nameWithoutMarker(name: string): string {
  return name.replace(NAME_MARKER, "").trim()
}

/**
 * One semester forward, alternating 1 then 2 the way QUT's plans do, instead of
 * counting up. `advanceSemesterName` deliberately counts up for the "next unused
 * name" case; a renumbered column has to alternate or a four-column path would
 * read "Semester 1, 2, 3, 4".
 */
function stepSemesterName(name: string): string | null {
  const yearSemester = YEAR_SEMESTER_NAME.exec(name)
  if (yearSemester) {
    const [, lead, yearText, joiner, semesterText, tail] = yearSemester
    const year = Number(yearText)
    const semester = Number(semesterText)
    const rollsOver = semester >= 2
    return `${lead}${rollsOver ? year + 1 : year}${joiner}${rollsOver ? 1 : semester + 1}${tail}`
  }

  const plain = PLAIN_SEMESTER_NAME.exec(name)
  if (plain) {
    const [, lead, numberText, tail] = plain
    return `${lead}${Number(numberText) >= 2 ? 1 : 2}${tail}`
  }

  return null
}

/**
 * Name a reflowed entry path by its own order: 1st column, 2nd column, 3rd.
 *
 * Folding columns away leaves holes in QUT's numbering — Year 2, Semester 2 just
 * gone from a part-time plan — and a nine-column plan that still ends at "Year 6"
 * reads as a six-year degree. After a reflow the column genuinely *is* the Nth
 * semester of that path, so it is named that way, and `semesterNumberFromName`
 * then measures availability against the right semester too. Each column keeps
 * its own (February)/(July) marker so two entry paths stay distinguishable.
 *
 * Only reflowed plans go through this: a plan that fits as it is never reaches
 * the pack, so QUT's own names survive untouched.
 */
function renumberRun(run: PlanSemester[]): PlanSemester[] {
  if (run.length === 0) return run
  const template = run[0].name
  if (!stepSemesterName(template)) return run

  const names: string[] = []
  let stepped = template
  for (let index = 0; index < run.length; index += 1) {
    if (index > 0) {
      const next = stepSemesterName(stepped)
      // Unparseable part-way through: leave the whole path's names alone rather
      // than half-rename it into duplicates.
      if (!next) return run
      stepped = next
    }
    const marker = nameMarker(run[index].name)
    names.push(marker ? `${nameWithoutMarker(stepped)} ${marker}` : nameWithoutMarker(stepped))
  }

  return run.map((column, index) => (column.name === names[index] ? column : { ...column, name: names[index] }))
}

interface ReflowResult {
  plan: PlanSemester[]
  /** Units that ended up in a different semester than they started in. */
  moved: number
  /** Open option slots carried into a different semester. */
  notesMoved: number
}

interface ReflowOptions {
  /** Target for semesters without an override, and for any column appended. */
  planTarget: number
  /** A semester's own override, or null when it follows the plan target. */
  overrideFor: (semesterId: string) => number | null
  /**
   * Credit points an unfilled slot costs, or null when the note is plain text
   * with nothing to choose. Only notes QUT leaves open are load.
   */
  slotCreditsFor?: (note: string) => number | null
}

/** One thing competing for room in a column: a unit, or a slot nobody filled yet. */
type LoadItem =
  | { kind: "unit"; sourceId: string; creditPoints: number; unit: PlanUnit }
  | { kind: "slot"; sourceId: string; creditPoints: number; noteIndex: number; slotId: string; note: string }

/** A note on its way into a column, with the slot id it had before it moved. */
interface NoteEntry {
  note: string
  /** Set for a slot, so the unit pointing at it can be rewritten to the new id. */
  oldSlotId?: string
  /** Notes that stay in their own semester keep their index; arrivals sort after. */
  sortKey: number
  /** Credit points this note still owes the column. 0 for plain text. */
  creditPoints?: number
}

/**
 * Move each section's units and open option slots forward until every semester
 * fits its own cap.
 *
 * Semesters are reused in place so their ids, names and notes survive; only their
 * unit and note lists are rebuilt. Overflow is inserted at the *front* of the next
 * column, so the flattened order never changes: an item that was behind another
 * stays behind it, wherever the two end up.
 */
function reflowRun(
  run: PlanSemester[],
  capFor: (semesterId: string, appended: boolean) => number,
  takeId: () => string,
  takenNames: Set<string>,
  slotCreditsFor?: (note: string) => number | null,
): ReflowResult {
  /** Units already answering a slot: that slot is filled, so it is not load. */
  const unitBySlotId = new Map<string, PlanUnit>()
  for (const source of run) {
    for (const unit of source.units) {
      if (unit.slotId) unitBySlotId.set(unit.slotId, unit)
    }
  }

  /**
   * Two queues, not one: every semester's units in order, and every semester's
   * open slots in order. They are packed together, weighting each column's room
   * between them. Appending the slots after the units is what turned a part-time
   * plan into eight full unit columns plus one pile of choices.
   */
  const unitQueue: LoadItem[] = []
  const slotQueue: LoadItem[] = []
  /** Notes with no choice behind them. No credit weight, so they stay put. */
  const plainNotes = new Map<string, Array<{ note: string; noteIndex: number }>>()
  /** What each semester costs on its own, for the "nothing has to move" test. */
  const ownLoad = new Map<string, number>()

  for (const source of run) {
    let load = 0
    for (const unit of source.units) {
      const credits = unit.creditPoints || 0
      load += credits
      unitQueue.push({ kind: "unit", sourceId: source.id, creditPoints: credits, unit })
    }
    const plain: Array<{ note: string; noteIndex: number }> = []
    source.notes.forEach((note, noteIndex) => {
      const slotId = `${source.id}~note${noteIndex}`
      // A filled slot is already counted by the unit answering it, and that unit
      // carries the note along with it below.
      if (unitBySlotId.has(slotId)) return
      const credits = slotCreditsFor ? slotCreditsFor(note) : null
      if (credits === null || credits <= 0) {
        plain.push({ note, noteIndex })
        return
      }
      load += credits
      slotQueue.push({ kind: "slot", sourceId: source.id, creditPoints: credits, noteIndex, slotId, note })
    })
    plainNotes.set(source.id, plain)
    ownLoad.set(source.id, load)
  }

  if (unitQueue.length + slotQueue.length === 0) return { plan: run, moved: 0, notesMoved: 0 }

  // Nothing has to move: every semester already fits its own cap. Returning the
  // run untouched is what keeps QUT's own layout, and its own names, exactly as
  // published for a plan nobody reflowed. Mixing would shuffle a plan that
  // already fits, which is why it only runs once something overflows.
  //
  // The exception is an overload target. QUT sizes a full-time semester at 48 CP,
  // so a cap above that is the student asking to fit more into each semester. The
  // pack is then allowed to fill every column to its cap, which is the only way
  // "six units a semester" actually shortens the plan.
  const everythingFits = run.every((source) => (ownLoad.get(source.id) ?? 0) <= capFor(source.id, false))
  const overloadTarget = run.some((source) => capFor(source.id, false) > FULL_TIME_CP)
  if (everythingFits && !overloadTarget) return { plan: run, moved: 0, notesMoved: 0 }

  const columns: PlanSemester[] = []
  /** Unit uid → id of the column it landed in. */
  const destinationOf = new Map<string, string>()
  /** Source semester id per unit, for the "did this move?" count. */
  const sourceOf = new Map<string, string>()
  for (const source of run) {
    for (const unit of source.units) sourceOf.set(unit.uid, source.id)
  }

  /** Destination column id → the notes that landed there. */
  const notesFor = new Map<string, NoteEntry[]>()
  /** Notes that never left their own semester keep their index; arrivals go after. */
  let arrival = 0

  const addNote = (columnId: string, entry: NoteEntry) => {
    const bucket = notesFor.get(columnId)
    if (bucket) bucket.push(entry)
    else notesFor.set(columnId, [entry])
  }

  /** The next column: an unused one at the end of the run, or a new semester. */
  const appendColumn = (): PlanSemester => {
    const reuse = run[columns.length]
    const column: PlanSemester = reuse
      ? { ...reuse, units: [], notes: [] }
      : {
          id: takeId(),
          name: nextSemesterName(columns[columns.length - 1]?.name ?? "", takenNames),
          section: run[run.length - 1]?.section ?? "",
          notes: [],
          units: [],
        }
    if (!reuse) takenNames.add(column.name)
    columns.push(column)
    return column
  }

  const takeUnit = (column: PlanSemester, item: Extract<LoadItem, { kind: "unit" }>) => {
    column.units.push(item.unit)
    destinationOf.set(item.unit.uid, column.id)
  }

  const takeSlot = (column: PlanSemester, item: Extract<LoadItem, { kind: "slot" }>) => {
    addNote(column.id, {
      note: item.note,
      oldSlotId: item.slotId,
      sortKey: item.sourceId === column.id ? item.noteIndex : 1000 + arrival++,
      creditPoints: item.creditPoints,
    })
  }

  let unitIndex = 0
  let unitLeft = unitQueue.reduce((total, item) => total + item.creditPoints, 0)
  let slotLeft = slotQueue.reduce((total, item) => total + item.creditPoints, 0)

  /**
   * Fill one column: give the units the share of the room that matches what is
   * left of them, then hand the rest to the open slots, then back to the units
   * once no choices are left. One unit plus one 12 CP choice makes a 24 CP
   * column; two units plus choices make a 48 CP one. That share is why a
   * part-time plan comes out mixed instead of units in one column and its
   * choices in the next.
   *
   * Units are only ever taken from the front, so a unit never overtakes another
   * and the flattened unit order is the order they started in. Choices may skip
   * one that does not fit and take a smaller one behind it — they are
   * interchangeable, and leaving a 6 CP gap in every column is what pushed a
   * twelve-semester plan to thirteen. Every column places at least one item, so
   * the loop always finishes.
   */
  let built = 0
  while ((unitIndex < unitQueue.length || slotQueue.length > 0) && built < 400) {
    built += 1
    const column = appendColumn()
    const cap = capFor(column.id, built - 1 >= run.length)
    let remaining = cap
    let placedThisColumn = 0

    const totalLeft = unitLeft + slotLeft
    const unitShare = totalLeft > 0 ? Math.floor((cap * unitLeft) / totalLeft) : 0

    // Units up to their share of this column. The first unit always goes in, so a
    // column never ends up holding only choices while units are still waiting.
    let unitTaken = 0
    while (unitIndex < unitQueue.length) {
      const item = unitQueue[unitIndex] as Extract<LoadItem, { kind: "unit" }>
      // A unit heavier than the whole cap gets a column of its own, alone.
      if (item.creditPoints > cap) {
        if (unitTaken > 0) break
        takeUnit(column, item)
        unitIndex += 1
        unitLeft -= item.creditPoints
        remaining -= item.creditPoints
        unitTaken += item.creditPoints
        placedThisColumn += 1
        break
      }
      if (item.creditPoints > remaining) break
      if (unitTaken > 0 && unitTaken + item.creditPoints > unitShare) break
      takeUnit(column, item)
      unitIndex += 1
      unitLeft -= item.creditPoints
      remaining -= item.creditPoints
      unitTaken += item.creditPoints
      placedThisColumn += 1
    }

    // The choices take whatever the units left behind. Largest that still fits
    // wins, so a 12 CP choice is not passed over for a 6 CP one and every column
    // ends up as close to its cap as the weights allow.
    for (;;) {
      let best = -1
      for (let index = 0; index < slotQueue.length; index += 1) {
        const credits = slotQueue[index].creditPoints
        if (credits > remaining) continue
        if (best < 0 || credits > slotQueue[best].creditPoints) best = index
      }
      if (best < 0) break
      const [item] = slotQueue.splice(best, 1) as Array<Extract<LoadItem, { kind: "slot" }>>
      takeSlot(column, item)
      slotLeft -= item.creditPoints
      remaining -= item.creditPoints
      placedThisColumn += 1
    }

    // Room left and no choices left to spend it on: the units get it back.
    while (slotQueue.length === 0 && unitIndex < unitQueue.length) {
      const item = unitQueue[unitIndex] as Extract<LoadItem, { kind: "unit" }>
      if (item.creditPoints > remaining) break
      takeUnit(column, item)
      unitIndex += 1
      unitLeft -= item.creditPoints
      remaining -= item.creditPoints
      placedThisColumn += 1
    }

    // Nothing fitted at all: place the head of whichever queue has something,
    // alone and clearly over, rather than spinning on it.
    if (placedThisColumn === 0) {
      if (unitIndex < unitQueue.length) {
        const item = unitQueue[unitIndex] as Extract<LoadItem, { kind: "unit" }>
        takeUnit(column, item)
        unitIndex += 1
        unitLeft -= item.creditPoints
      } else {
        const [item] = slotQueue.splice(0, 1) as Array<Extract<LoadItem, { kind: "slot" }>>
        takeSlot(column, item)
        slotLeft -= item.creditPoints
      }
      placedThisColumn += 1
    }
  }

  const columnById = new Map(columns.map((column) => [column.id, column]))

  // Plain notes stay in the column that holds their own semester, at their own
  // index, so nothing that did not move gets renumbered.
  for (const source of run) {
    const own = columnById.get(source.id)
    if (!own) continue
    for (const entry of plainNotes.get(source.id) ?? []) {
      addNote(own.id, { note: entry.note, sortKey: entry.noteIndex })
    }
  }

  // A filled slot's note follows the unit answering it, so the chosen unit and
  // the note it stands for never end up in different columns.
  for (const source of run) {
    source.notes.forEach((note, noteIndex) => {
      const slotId = `${source.id}~note${noteIndex}`
      const filler = unitBySlotId.get(slotId)
      if (!filler) return
      const landedIn = destinationOf.get(filler.uid) ?? source.id
      if (!columnById.has(landedIn)) return
      addNote(landedIn, {
        note,
        oldSlotId: slotId,
        sortKey: landedIn === source.id ? noteIndex : 1000 + arrival++,
      })
    })
  }

  // ── Consolidation ────────────────────────────────────────────────────────
  // Packing is first-in-first-out, so a semester's open slots can land in a
  // column of their own: BS05 at 24 CP came out as twelve columns that
  // alternated units and dashed cards, and `0 units · 0 / 24 CP + 24 to choose`
  // is not something to hand a student. A column whose only contents are
  // unfilled slots is therefore folded into a neighbour that has units, if the
  // combined load fits that neighbour's cap. Backwards first, because the slots
  // belong to the semester they came from. Whatever fits nowhere is gathered
  // into one trailing choices column per entry path rather than one column per
  // spill. The last column of an entry path may be all choices: that is where
  // the leftovers live.
  const creditsOfUnits = (column: PlanSemester) =>
    column.units.reduce((total, unit) => total + (unit.creditPoints || 0), 0)
  const creditsOfNotes = (columnId: string) =>
    (notesFor.get(columnId) ?? []).reduce((total, entry) => total + (entry.creditPoints ?? 0), 0)
  const loadOf = (column: PlanSemester) => creditsOfUnits(column) + creditsOfNotes(column.id)
  const hasChoices = (columnId: string) =>
    (notesFor.get(columnId) ?? []).some((entry) => (entry.creditPoints ?? 0) > 0)

  const handOver = (from: PlanSemester, to: PlanSemester, entries: NoteEntry[]) => {
    for (const entry of entries) addNote(to.id, { ...entry, sortKey: 1000 + arrival++ })
    notesFor.delete(from.id)
  }

  const leftovers: NoteEntry[] = []
  columns.forEach((column, index) => {
    if (column.units.length > 0) return
    if (!hasChoices(column.id)) return
    // The trailing choices column of this entry path is allowed to be choices only.
    if (index === columns.length - 1) return

    const entries = [...(notesFor.get(column.id) ?? [])]
    const credits = creditsOfNotes(column.id)
    for (let back = index - 1; back >= 0; back -= 1) {
      const target = columns[back]
      if (target.units.length === 0) continue
      if (loadOf(target) + credits <= capFor(target.id, back >= run.length)) {
        handOver(column, target, entries)
        return
      }
    }
    for (let forward = index + 1; forward < columns.length; forward += 1) {
      const target = columns[forward]
      if (target.units.length === 0) continue
      if (loadOf(target) + credits <= capFor(target.id, forward >= run.length)) {
        handOver(column, target, entries)
        return
      }
    }
    notesFor.delete(column.id)
    leftovers.push(...entries)
  })

  if (leftovers.length > 0) {
    const last = columns[columns.length - 1]
    // Reuse the trailing column when the pack already left one choices-only;
    // otherwise the pile gets a column of its own at the end of the path.
    const target = last.units.length === 0 ? last : appendColumn()
    for (const entry of leftovers) addNote(target.id, { ...entry, sortKey: 1000 + arrival++ })
  }

  // A column that handed everything over is a blank card: drop it. Anything with
  // units or notes left stays, so no note text is ever thrown away.
  const survivors = columns.filter(
    (column) => column.units.length > 0 || (notesFor.get(column.id) ?? []).length > 0,
  )

  // Ids are positions, so every slot that moved changes id. Rewriting the units
  // in the same pass is what keeps a chosen unit glued to its slot: a stale id
  // would look like an empty slot and the pending credit points would rebound.
  const remapSlotId = new Map<string, string>()
  for (const column of survivors) {
    const entries = (notesFor.get(column.id) ?? []).sort((a, b) => a.sortKey - b.sortKey)
    column.notes = entries.map((entry, index) => {
      if (entry.oldSlotId) remapSlotId.set(entry.oldSlotId, `${column.id}~note${index}`)
      return entry.note
    })
  }

  let moved = 0
  destinationOf.forEach((columnId, uid) => {
    if (sourceOf.get(uid) !== columnId) moved += 1
  })

  let notesMoved = 0
  for (const column of survivors) {
    for (const entry of notesFor.get(column.id) ?? []) {
      if (!entry.oldSlotId) continue
      if (entry.oldSlotId.split("~")[0] !== column.id) notesMoved += 1
    }
  }

  // The path is now the 1st, 2nd, 3rd semester of the plan, so name it that way.
  // Done after the notes are attached so the renamed copies carry them, and
  // before anything reads a name for availability.
  const named = renumberRun(survivors)

  const next = named.map((column) => ({
    ...column,
    units: column.units.map((unit) => {
      if (!unit.slotId) return unit
      const remapped = remapSlotId.get(unit.slotId)
      return remapped && remapped !== unit.slotId ? { ...unit, slotId: remapped } : unit
    }),
  }))

  return { plan: next, moved, notesMoved }
}

/** Allocates fresh semester ids ("s1", "s2", ...) above anything already in use. */
function createIdAllocator(plan: PlanSemester[]): () => string {
  let highest = 0
  for (const semester of plan) {
    const match = /^s(\d+)$/.exec(semester.id)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return () => `s${(highest += 1)}`
}

/** Splits a plan into its contiguous entry paths ("February entry", "July entry"). */
function sectionRuns(plan: PlanSemester[]): PlanSemester[][] {
  const runs: PlanSemester[][] = []
  for (const semester of plan) {
    const run = runs[runs.length - 1]
    if (run && run[0].section === semester.section) run.push(semester)
    else runs.push([semester])
  }
  return runs
}

/**
 * Reflow the whole plan to a new load target. Pure: returns a new plan (or the
 * same one when nothing moves) plus how many units changed semester.
 */
function reflowPlan(plan: PlanSemester[], options: ReflowOptions): ReflowResult {
  if (plan.length === 0) return { plan, moved: 0, notesMoved: 0 }

  const takeId = createIdAllocator(plan)

  const capFor = (semesterId: string, appended: boolean) => {
    if (appended) return options.planTarget
    const override = options.overrideFor(semesterId)
    return typeof override === "number" && Number.isFinite(override) && override > 0 ? override : options.planTarget
  }

  let moved = 0
  let notesMoved = 0
  const reflowed = sectionRuns(plan).map((run) => {
    const takenNames = new Set(run.map((semester) => semester.name))
    const result = reflowRun(run, capFor, takeId, takenNames, options.slotCreditsFor)
    moved += result.moved
    notesMoved += result.notesMoved
    return result.plan
  })

  return { plan: reflowed.flat(), moved, notesMoved }
}

/**
 * The plan a *plan-level* target change re-packs from: QUT's canonical layout,
 * not the arrangement currently on screen.
 *
 * This is the whole reason 48 → 36 → 48 comes back clean. Reflowing the current
 * plan chains one packing onto the previous one, so the second packing starts from
 * boundaries it did not choose and the original layout never comes back; units
 * drift into each other's semesters and a same-semester unit can never satisfy a
 * prerequisite, which is how AYB202 ended up permanently flagged next to AYB150.
 * Re-packing the canonical order instead is a pure function of (QUT's plan,
 * target), so the same target always produces the same layout.
 *
 * Chosen option units are carried over: they are answers to a QUT note rather
 * than hand-made drags, and silently deleting a student's elective because they
 * changed the load target would break "nothing is dropped".
 *
 * A pick is identified by the note it answers, and a note that has travelled to a
 * column QUT's plan does not have (a plan packed to 24 CP runs past Year 3) is not
 * findable by id any more. Notes only ever move, never change, so the note text is
 * what re-attaches it: the pick goes back against the canonical note with the same
 * text, and its `slotId` is rewritten to that note's position.
 */
function reflowBasePlan(canonical: PlanSemester[], current: PlanSemester[]): PlanSemester[] {
  const picks: PlanUnit[] = []
  for (const semester of current) {
    for (const unit of semester.units) {
      if (unit.slotId) picks.push(unit)
    }
  }
  if (picks.length === 0) return canonical

  const canonicalById = new Map(canonical.map((semester) => [semester.id, semester]))
  const currentById = new Map(current.map((semester) => [semester.id, semester]))
  /** Canonical slot ids already spoken for, so two picks cannot share one note. */
  const claimed = new Set<string>()
  const attached = new Map<string, PlanUnit[]>()

  const attach = (semesterId: string, pick: PlanUnit) => {
    const bucket = attached.get(semesterId)
    if (bucket) bucket.push(pick)
    else attached.set(semesterId, [pick])
  }

  const noteTextOf = (pick: PlanUnit) => {
    const [owner, notePart] = (pick.slotId as string).split("~")
    const noteIndex = Number((notePart ?? "").replace("note", ""))
    return { owner, noteIndex, text: currentById.get(owner)?.notes[noteIndex] }
  }

  const orphans: PlanUnit[] = []
  for (const pick of picks) {
    const { owner, noteIndex, text } = noteTextOf(pick)
    const target = canonicalById.get(owner)
    // The common case: the note is still where QUT put it, at the same index.
    if (target && text !== undefined && target.notes[noteIndex] === text && !claimed.has(`${owner}~note${noteIndex}`)) {
      claimed.add(`${owner}~note${noteIndex}`)
      attach(owner, pick)
      continue
    }
    orphans.push(pick)
  }

  for (const pick of orphans) {
    const { text } = noteTextOf(pick)
    let placed = false
    if (text !== undefined) {
      for (const semester of canonical) {
        const index = semester.notes.findIndex(
          (note, candidateIndex) => note === text && !claimed.has(`${semester.id}~note${candidateIndex}`),
        )
        if (index < 0) continue
        claimed.add(`${semester.id}~note${index}`)
        attach(semester.id, { ...pick, slotId: `${semester.id}~note${index}` })
        placed = true
        break
      }
    }
    if (placed) continue
    // Never hit by a plan built from QUT's own notes, but a pick is the student's
    // choice: keep it at the same position rather than dropping it.
    const position = Math.min(
      Math.max(current.findIndex((semester) => semester.id === noteTextOf(pick).owner), 0),
      Math.max(canonical.length - 1, 0),
    )
    const fallback = canonical[position]
    if (fallback) attach(fallback.id, pick)
  }

  return canonical.map((semester) => {
    const adds = attached.get(semester.id)
    return adds && adds.length > 0 ? { ...semester, units: [...semester.units, ...adds] } : semester
  })
}

// ── Unit card ────────────────────────────────────────────────────────────────

function UnitCardBody({ unit, dragging = false }: { unit: PlanUnit; dragging?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
          {unit.code}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 leading-snug line-clamp-2 transition-colors duration-300">
          {unit.title}
        </div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          {unit.creditPoints > 0 ? `${unit.creditPoints} CP` : "Credit points unknown"}
        </div>
      </div>
      <GripVertical
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 transition-colors duration-150",
          dragging ? "text-[#003A6E] dark:text-blue-300" : "text-gray-400 dark:text-gray-500 group-hover:text-[#003A6E] dark:group-hover:text-blue-300",
        )}
      />
    </div>
  )
}

/** Matches the PointerSensor activation distance below: past 6px it was a drag. */
const CLICK_SLOP = 6

function SortableUnitCard({
  unit,
  problems,
  onOpen,
  onChangeSlot,
  onClearSlot,
}: {
  unit: PlanUnit
  /** Empty or undefined for a unit nothing is wrong with. */
  problems?: PlanProblem[]
  onOpen: (unit: PlanUnit) => void
  /** Reopen the option picker for the slot this unit fills. */
  onChangeSlot: (unit: PlanUnit) => void
  onClearSlot: (unit: PlanUnit) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.uid })
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)

  // Capture the drag state so a pointerup that ends a drag cannot also open the panel.
  useEffect(() => {
    draggingRef.current = isDragging
  }, [isDragging])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      // dnd-kit owns onPointerDown through `listeners`. Run its handler too, so
      // the 6px drag activation still works exactly as before.
      onPointerDown={(event) => {
        pressStart.current = { x: event.clientX, y: event.clientY }
        listeners?.onPointerDown?.(event)
      }}
      onPointerUp={(event) => {
        const start = pressStart.current
        pressStart.current = null
        if (!start || event.button !== 0) return
        // A gesture that moved past the drag threshold — or actually started a
        // drag — is not a click, so it must not open the detail panel.
        if (draggingRef.current) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return
        onOpen(unit)
      }}
      onPointerCancel={() => {
        pressStart.current = null
      }}
      data-unit-uid={unit.uid}
      data-unit-code={unit.code}
      data-slot-id={unit.slotId ?? undefined}
      className={cn(
        "group relative select-none touch-none rounded-lg border border-[#003A6E]/15 dark:border-blue-900/40 bg-white dark:bg-gray-800 px-2.5 py-2 shadow-sm",
        "cursor-grab active:cursor-grabbing transition-all duration-150",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-[#003A6E]/40 dark:hover:border-blue-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:focus-visible:ring-blue-500",
        isDragging && "opacity-40",
      )}
    >
      {problems && problems.length > 0 && (
        // A dot on the card edge and nothing else: the strip above the board
        // carries the words, so the card keeps its shape and gains no text.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-[3px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-1"
        >
          {problems.map((problem) => (
            <span
              key={problem.kind}
              data-testid="unit-problem-dot"
              data-problem-kind={problem.kind}
              title={problem.sentence}
              className={cn(
                "block h-2 w-2 rounded-full",
                problem.kind === "prereq" ? "bg-amber-500 dark:bg-amber-400" : "bg-violet-500 dark:bg-violet-400",
              )}
            />
          ))}
        </span>
      )}
      <UnitCardBody unit={unit} />
      {unit.slotId && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="rounded-full bg-[#003A6E]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#003A6E] dark:bg-blue-500/20 dark:text-blue-200">
            Chosen option
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              data-testid="slot-change"
              aria-label={`Change the unit chosen for this option slot, currently ${unit.code}`}
              // A drag that starts on the button would move the unit instead.
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onChangeSlot(unit)
              }}
              className="rounded px-1 text-[10px] font-medium text-[#003A6E] transition-colors hover:bg-[#003A6E]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:text-blue-300 dark:hover:bg-blue-500/20"
            >
              Change
            </button>
            <button
              type="button"
              data-testid="slot-clear"
              aria-label={`Remove ${unit.code} and leave the option slot empty again`}
              // A drag that starts on the remove button would move the unit instead.
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onClearSlot(unit)
              }}
              className="rounded px-1 text-[10px] text-gray-400 transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:text-gray-500 dark:hover:text-red-400"
            >
              Remove
            </button>
          </span>
        </div>
      )}
    </div>
  )
}

/** An empty slot: looks like a card so it belongs in the column, but cannot be dragged. */
function OptionSlotCard({
  slot,
  onChoose,
}: {
  slot: PlanSlot
  onChoose: (slot: PlanSlot) => void
}) {
  return (
    <button
      type="button"
      data-testid="option-slot"
      data-slot-id={slot.id}
      data-slot-label={slot.label}
      onClick={() => onChoose(slot)}
      className={cn(
        "group/slot w-full rounded-lg border-2 border-dashed px-2.5 py-2 text-left transition-colors duration-150",
        "border-[#003A6E]/40 bg-[#003A6E]/[0.03] hover:border-[#003A6E]/70 hover:bg-[#003A6E]/[0.07]",
        "dark:border-blue-500/40 dark:bg-blue-500/[0.06] dark:hover:border-blue-400/70 dark:hover:bg-blue-500/[0.12]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:focus-visible:ring-blue-500",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs italic leading-snug text-[#003A6E]/75 dark:text-blue-300/80">
          {slot.label} ({slot.creditPoints} CP)
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#003A6E] dark:text-blue-300">
          <Plus className="h-3 w-3" />
          Choose unit
        </span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
        {slot.candidates.length} {slot.candidates.length === 1 ? "option" : "options"}
        {slot.sourceTitles[0] ? ` · ${slot.sourceTitles[0]}` : ""}
      </div>
    </button>
  )
}

// ── Semester column ──────────────────────────────────────────────────────────

/**
 * A native select dressed in the planner's own Card vocabulary. Native rather
 * than a popover so it stays one tap on a phone and needs no portal, which
 * matters for a control that lives inside a drag-and-drop droppable.
 */
function LoadTargetSelect({
  value,
  onChange,
  ariaLabel,
  testId,
  title,
  compact = false,
  children,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  testId?: string
  title?: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={ariaLabel}
        data-testid={testId}
        title={title}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "cursor-pointer appearance-none rounded-md border bg-white pl-2 pr-6 text-[#003A6E] shadow-sm",
          "border-[#003A6E]/25 hover:border-[#003A6E]/50",
          "dark:border-blue-900/60 dark:bg-gray-900 dark:text-blue-300 dark:hover:border-blue-700",
          "transition-colors duration-150 motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:focus-visible:ring-blue-500",
          // A fixed height in the compact form keeps a column header the same
          // height whether the select or its placeholder is showing.
          compact ? "h-6 py-0 text-[11px]" : "py-1 text-xs",
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className={cn("pointer-events-none absolute right-1.5 opacity-70", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
    </span>
  )
}

interface SemesterColumnProps {
  semester: PlanSemester
  slots: PlanSlot[]
  showSection: boolean
  isActiveColumn: boolean
  isAnyDrag: boolean
  /** Credit points this semester is measured against. */
  loadTarget: number
  /** The semester's own target, or null when it follows the plan default. */
  loadOverride: number | null
  onSetLoadOverride: (semesterId: string, target: number | null) => void
  /** True while the Tune disclosure is open: the override select lives in there. */
  showTune: boolean
  /** PlanUnit.uid -> reasons this card is dotted. */
  unitProblems: Map<string, PlanProblem[]>
  onOpenUnit: (unit: PlanUnit) => void
  onChooseSlot: (slot: PlanSlot) => void
  onChangeSlot: (unit: PlanUnit) => void
  onClearSlot: (unit: PlanUnit) => void
}

function SemesterColumn({
  semester,
  // Defensive: an undefined entry here used to throw "Cannot read properties of
  // undefined (reading 'filter')" and take the whole app to a white screen, since
  // there is no error boundary above the planner.
  slots = [],
  showSection,
  isActiveColumn,
  isAnyDrag,
  loadTarget,
  loadOverride,
  onSetLoadOverride,
  showTune,
  unitProblems,
  onOpenUnit,
  onChooseSlot,
  onChangeSlot,
  onClearSlot,
}: SemesterColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col~${semester.id}` })
  const credits = creditPointsOf(semester)
  const count = semester.units.length
  const overloaded = credits > loadTarget
  const highlighted = isAnyDrag && isActiveColumn

  // Only slots without a chosen unit are still waiting. Deriving this per
  // semester means a chosen unit dragged to another column leaves the original
  // slot empty again instead of looking filled from somewhere else.
  const filled = filledSlotIds(semester)
  const safeSlots = Array.isArray(slots) ? slots : []
  const openSlots = safeSlots.filter((slot) => !filled.has(slot.id))
  const pendingCredits = openSlots.reduce((total, slot) => total + slot.creditPoints, 0)
  const slotIndexes = new Set(safeSlots.map((slot) => slot.noteIndex))

  return (
    <div
      ref={setNodeRef}
      data-semester-id={semester.id}
      data-semester-name={semester.name}
      className={cn(
        "w-[248px] sm:w-[264px] shrink-0 snap-start flex flex-col rounded-xl border bg-white dark:bg-gray-900 shadow-sm transition-all duration-150",
        highlighted
          ? "border-[#003A6E] dark:border-blue-500 ring-2 ring-[#003A6E]/30 dark:ring-blue-500/30 shadow-md"
          : "border-[#003A6E]/20 dark:border-blue-900/30",
      )}
    >
      <div className="rounded-t-xl border-b border-[#003A6E]/15 dark:border-blue-900/30 bg-[#003A6E]/5 dark:bg-blue-900/20 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div
            className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
            title={semester.name}
          >
            {semester.name}
          </div>
          {showTune ? (
            <LoadTargetSelect
              compact
              testId={`semester-target-${semester.id}`}
              ariaLabel={`Credit point target for ${semester.name}`}
              title={`"Default" follows the plan target of ${loadTarget} CP. Picking a number re-packs the plan with this semester at that target, so drags made by hand are dropped.`}
              value={loadOverride === null ? "" : String(loadOverride)}
              onChange={(value) => onSetLoadOverride(semester.id, value === "" ? null : Number(value))}
            >
              <option value="">Default</option>
              {SEMESTER_TARGET_CHOICES.map((target) => (
                <option key={target} value={target}>
                  {target} CP
                </option>
              ))}
            </LoadTargetSelect>
          ) : (
            // Same footprint as the select, so opening Tune never shifts the
            // column header or the cards below it.
            <span aria-hidden="true" className="h-6 w-[78px] shrink-0" />
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {count === 0 && pendingCredits > 0 ? (
            // A column that is only choices is the trailing pile for its entry
            // path, not a semester with nothing in it. "0 units" would read as a
            // mistake, so lead with what the column is actually for.
            <span title="Nothing scheduled in this column yet. These are the choices QUT leaves open for the rest of this entry path.">
              Choices to make ·{" "}
              <span className="font-medium text-[#003A6E] dark:text-blue-300">{pendingCredits} CP</span>
            </span>
          ) : (
            <>
              {count} {count === 1 ? "unit" : "units"} ·{" "}
              <span
                className={cn(
                  "font-medium",
                  overloaded ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400",
                )}
                title={
                  overloaded
                    ? `${credits - loadTarget} CP more than this semester's ${loadTarget} CP target`
                    : `${loadTarget} CP target for this semester`
                }
              >
                {credits} / {loadTarget} CP
              </span>
              {pendingCredits > 0 && (
                <span
                  className="text-gray-400 dark:text-gray-500"
                  title="Credit points still to be chosen for the empty option slots below. Pending, not counted as load."
                >
                  {" "}
                  + {pendingCredits} to choose
                </span>
              )}
            </>
          )}
          {showSection && semester.section ? ` · ${semester.section}` : ""}
        </div>
      </div>

      <SortableContext items={semester.units.map((unit) => unit.uid)} strategy={verticalListSortingStrategy}>
        <div
          className={cn(
            "flex-1 space-y-2 p-2 transition-colors duration-150",
            isOver && isAnyDrag && "bg-[#003A6E]/5 dark:bg-blue-900/10",
          )}
        >
          {semester.units.map((unit) => (
            <SortableUnitCard
              key={unit.uid}
              unit={unit}
              problems={unitProblems.get(unit.uid)}
              onOpen={onOpenUnit}
              onChangeSlot={onChangeSlot}
              onClearSlot={onClearSlot}
            />
          ))}

          {openSlots.map((slot) => (
            <OptionSlotCard key={slot.id} slot={slot} onChoose={onChooseSlot} />
          ))}

          {count === 0 && openSlots.length === 0 && (
            <div
              className={cn(
                "flex h-[68px] items-center justify-center rounded-lg border border-dashed text-xs transition-colors duration-150",
                highlighted
                  ? "border-[#003A6E] dark:border-blue-500 text-[#003A6E] dark:text-blue-300 bg-white/60 dark:bg-gray-800/60"
                  : "border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500",
              )}
            >
              Drop a unit here
            </div>
          )}
        </div>
      </SortableContext>

      {(semester.notes.length > 0 || overloaded || openSlots.length > 0) && (
        <div className="space-y-1 border-t border-gray-100 dark:border-gray-800 px-3 py-2">
          <SemesterNotes semester={semester} slotIndexes={slotIndexes} />
          {openSlots.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {openSlots.length} {openSlots.length === 1 ? "option slot" : "option slots"} still empty
            </div>
          )}
          {overloaded && (
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400" data-testid="semester-over-target">
              {credits - loadTarget} CP over this semester&rsquo;s {loadTarget} CP target
            </div>
          )}
          {/* No "under target" note. QUT's own plans are frequently under 48 CP
              because option slots are notes rather than units, so flagging it on
              every column was alarm rather than information. Over-target still warns,
              measured against this semester's own target. */}
        </div>
      )}
    </div>
  )
}

/**
 * Notes that stayed text: either QUT wrote something a slot cannot stand in for
 * ("OR", "Complete either MZB104 or MZB105") or the keyword has no matching
 * option pool in this course. Notes already rendered as a slot card are skipped
 * so the same instruction does not appear twice.
 */
function SemesterNotes({ semester, slotIndexes }: { semester: PlanSemester; slotIndexes: Set<number> }) {
  const plain = semester.notes
    .map((note, index) => ({ note, index }))
    .filter((entry) => !slotIndexes.has(entry.index))

  if (plain.length === 0) return null

  return (
    <>
      {plain.map(({ note, index }) => {
        const otherDegree = isOtherDegreeNote(note)
        return (
          <div key={`${note}-${index}`} className="flex gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-600" />
            <span className="leading-snug">
              {note}
              {otherDegree && (
                <span className="mt-0.5 block text-[11px] text-gray-400 dark:text-gray-500">
                  From the other degree in this double degree. It cannot be filled from this course's
                  options.
                </span>
              )}
            </span>
          </div>
        )
      })}
    </>
  )
}

// ── Problem summary ──────────────────────────────────────────────────────────
//
// Two kinds of mistake, two colours, one strip above the board. The cards carry
// only a dot; the words live here, so a badly ordered plan never has to be read
// card by card. Capped so a long list cannot push the board off-screen.

const PROBLEM_ROW_CAP = 6

interface ProblemGroupProps {
  kind: ProblemKind
  heading: string
  problems: PlanProblem[]
  /** Rows this group may show, after the other group has taken its share. */
  budget: number
  onFix: (fix: PlanProblemFix) => void
}

const PROBLEM_TONE: Record<ProblemKind, { heading: string; row: string; more: string }> = {
  prereq: {
    heading: "text-amber-700 dark:text-amber-300",
    row: "text-amber-700 dark:text-amber-300",
    more: "text-amber-600/80 dark:text-amber-400/80",
  },
  availability: {
    heading: "text-violet-700 dark:text-violet-300",
    row: "text-violet-700 dark:text-violet-300",
    more: "text-violet-600/80 dark:text-violet-400/80",
  },
}

function ProblemGroup({ kind, heading, problems, budget, onFix }: ProblemGroupProps) {
  if (problems.length === 0) return null

  const tone = PROBLEM_TONE[kind]
  const visible = problems.slice(0, Math.max(1, budget))
  const hidden = problems.length - visible.length

  return (
    <section data-testid={`plan-problems-${kind}`} className="min-w-0 flex-1">
      <h3 className={cn("flex items-center gap-1.5 text-xs font-semibold", tone.heading)}>
        {kind === "prereq" ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <CalendarX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {heading}
      </h3>
      <ul className="mt-1 space-y-0.5">
        {visible.map((problem, index) => {
          const fix = problem.fix
          return (
            <li
              key={`${problem.kind}-${index}`}
              className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-snug", tone.row)}
            >
              {/* The line stays one action; every alternative QUT accepts is here. */}
              <span title={problem.detail}>{problem.sentence}</span>
              {fix && (
                // No fix is offered unless lib/plan-fixes.ts proved the move clears
                // this row, so the button never sits there doing nothing.
                <button
                  type="button"
                  onClick={() => onFix(fix)}
                  data-testid={`plan-fix-${fix.kind}`}
                  className="shrink-0 rounded border border-current px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors hover:bg-gray-900/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current dark:hover:bg-white/10"
                >
                  {fix.label}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {hidden > 0 && <p className={cn("mt-0.5 text-[11px]", tone.more)}>+{hidden} more</p>}
    </section>
  )
}

interface PlanProblemStripProps {
  problems: PlanProblems
  /** Set for the render straight after a fix. Cleared by the next plan change. */
  notice: string | null
  onFix: (fix: PlanProblemFix) => void
}

function PlanFixNotice({ text }: { text: string }) {
  return (
    <div
      data-testid="plan-fix-notice"
      aria-live="polite"
      className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 shadow-sm transition-colors duration-300 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
    >
      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

function PlanProblemStrip({ problems, notice, onFix }: PlanProblemStripProps) {
  const { prereq, availability } = problems
  const hasProblems = prereq.length > 0 || availability.length > 0

  // The confirmation takes the strip's place when the fix cleared the last row,
  // which is the moment the strip would otherwise vanish without a word. When
  // other problems remain they stay readable, with the confirmation above them.
  if (!hasProblems) return notice ? <PlanFixNotice text={notice} /> : null

  // Split the row budget so one crowded kind cannot hide the other entirely:
  // each group keeps at most three rows for the other one.
  const budgetFor = (own: number, other: number) => {
    if (own === 0) return 0
    if (other === 0) return PROBLEM_ROW_CAP
    return Math.max(1, Math.min(own, PROBLEM_ROW_CAP - Math.min(other, 3)))
  }

  return (
    <div
      data-testid="plan-problems"
      aria-live="polite"
      className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 shadow-sm transition-colors duration-300 dark:border-gray-800 dark:bg-gray-800/40"
    >
      {notice && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-8">
        <ProblemGroup
          kind="prereq"
          // Was "Prerequisite gaps". The heading sits in the same strip as the
          // sentences, and the whole point of the rewrite is that the strip uses no
          // vocabulary a first-year has to decode.
          heading="Take these first"
          problems={prereq}
          budget={budgetFor(prereq.length, availability.length)}
          onFix={onFix}
        />
        <ProblemGroup
          kind="availability"
          heading="Not offered then"
          problems={availability}
          budget={budgetFor(availability.length, prereq.length)}
          onFix={onFix}
        />
      </div>
    </div>
  )
}

// ── Course combobox ──────────────────────────────────────────────────────────
//
// A searchable replacement for the old "search input + Radix Select" pair. The
// trigger is the combobox: it opens a panel with a filter field and the same
// grouped list the Select used to show. Hand-rolled rather than cmdk/popover —
// this is the only combobox in the app and a dependency for one widget is not
// worth it.

interface CourseOptionGroups {
  withPlans: CourseSummary[]
  withoutPlans: CourseSummary[]
  total: number
}

interface CourseComboboxProps {
  id: string
  options: CourseOptionGroups
  value: string
  selected: CourseSummary | null
  query: string
  onQueryChange: (query: string) => void
  onSelect: (code: string) => void
  disabled: boolean
  loading: boolean
}

function CourseCombobox({
  id,
  options,
  value,
  selected,
  query,
  onQueryChange,
  onSelect,
  disabled,
  loading,
}: CourseComboboxProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Timestamp of the last close, so refocusing the trigger cannot instantly reopen it. */
  const closedAtRef = useRef(0)

  const rows = useMemo(
    () => [...options.withPlans, ...options.withoutPlans],
    [options],
  )

  const listboxId = `${id}-listbox`
  const optionId = (code: string) => `${id}-option-${code}`
  const activeOption = open ? rows[activeIndex] ?? null : null

  const close = (refocus: boolean) => {
    closedAtRef.current = Date.now()
    setOpen(false)
    onQueryChange("")
    setActiveIndex(0)
    if (refocus) triggerRef.current?.focus()
  }

  const choose = (entry: CourseSummary) => {
    onSelect(entry.code)
    close(true)
  }

  // Reset the highlight whenever the filter changes so Enter always picks the
  // first visible match rather than something scrolled out of view.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Focus the filter field as soon as the panel opens — that is the whole point
  // of the combobox: click the trigger, start typing.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open || !activeOption) return
    const node = document.getElementById(optionId(activeOption.code))
    node?.scrollIntoView({ block: "nearest" })
  }, [open, activeOption])

  // Outside click closes and clears the filter. Escape is handled on the input
  // and the panel so focus never has to leave the widget.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return
      close(false)
    }

    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        setActiveIndex((index) => (rows.length === 0 ? 0 : Math.min(index + 1, rows.length - 1)))
        break
      case "ArrowUp":
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case "Home":
        event.preventDefault()
        setActiveIndex(0)
        break
      case "End":
        event.preventDefault()
        setActiveIndex(Math.max(rows.length - 1, 0))
        break
      case "Enter": {
        event.preventDefault()
        const entry = rows[activeIndex] ?? rows[0]
        if (entry) choose(entry)
        break
      }
      case "Escape":
        event.preventDefault()
        event.stopPropagation()
        close(true)
        break
      case "Tab":
        // Let focus move on, but do not leave a stale panel behind.
        close(false)
        break
      default:
        break
    }
  }

  const placeholder = loading ? "Loading courses..." : "Search courses by code or name"

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? optionId(activeOption.code) : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onFocus={(event) => {
          // "Click or focus opens the list" — but only for keyboard focus, so
          // tabbing past the control does not fling a 300px panel open. The
          // panel autofocuses its filter field, so focus leaves the trigger and
          // this cannot then fight the click handler below.
          if (!event.currentTarget.matches(":focus-visible")) return
          // Escape refocuses the trigger; do not let that reopen the panel.
          if (Date.now() - closedAtRef.current < 250) return
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            setOpen(true)
          } else if (event.key === "Escape" && open) {
            event.preventDefault()
            close(true)
          }
        }}
        data-testid="course-combobox"
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm",
          "ring-offset-background focus:outline-none focus:ring-2 focus:ring-[#003A6E] focus:ring-offset-2 dark:bg-gray-800 dark:border-gray-700",
          "disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200",
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate text-left",
            selected ? "text-gray-900 dark:text-gray-100" : "text-muted-foreground dark:text-gray-400",
          )}
        >
          {selected ? `${selected.code} · ${selected.title}` : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 opacity-50 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-[#003A6E]/20 bg-white shadow-lg dark:border-blue-900/40 dark:bg-gray-800"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              close(true)
            }
          }}
        >
          <div className="border-b border-gray-100 p-2 dark:border-gray-700">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type to filter courses…"
                aria-label="Filter courses"
                aria-controls={listboxId}
                aria-activedescendant={activeOption ? optionId(activeOption.code) : undefined}
                aria-autocomplete="list"
                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#003A6E]/60 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-blue-500/60"
              />
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Courses"
            className="max-h-[300px] overflow-y-auto py-1"
          >
            {rows.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                No courses match “{query}”.
              </p>
            )}

            {options.withPlans.length > 0 && (
              <div role="group" aria-label="Courses with study plans">
                <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Courses with study plans
                </div>
                {options.withPlans.map((entry, index) => (
                  <CourseOption
                    key={entry.code}
                    id={optionId(entry.code)}
                    entry={entry}
                    index={index}
                    activeIndex={activeIndex}
                    selectedCode={value}
                    onHover={setActiveIndex}
                    onSelect={choose}
                  />
                ))}
              </div>
            )}

            {options.withoutPlans.length > 0 && (
              <div role="group" aria-label="Other QUT courses">
                <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Other QUT courses (no plan data yet)
                </div>
                {options.withoutPlans.map((entry, index) => (
                  <CourseOption
                    key={entry.code}
                    id={optionId(entry.code)}
                    entry={entry}
                    index={options.withPlans.length + index}
                    activeIndex={activeIndex}
                    selectedCode={value}
                    onHover={setActiveIndex}
                    onSelect={choose}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface CourseOptionProps {
  id: string
  entry: CourseSummary
  index: number
  activeIndex: number
  selectedCode: string
  onHover: (index: number) => void
  onSelect: (entry: CourseSummary) => void
}

function CourseOption({ id, entry, index, activeIndex, selectedCode, onHover, onSelect }: CourseOptionProps) {
  const active = index === activeIndex
  const selected = entry.code === selectedCode

  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      data-course-code={entry.code}
      // Keep focus in the filter field so typing continues to work after a click.
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => onHover(index)}
      onClick={() => onSelect(entry)}
      className={cn(
        "flex cursor-pointer items-start justify-between gap-2 px-3 py-1.5 text-sm",
        active ? "bg-[#003A6E]/10 dark:bg-blue-900/40" : "hover:bg-gray-50 dark:hover:bg-gray-700/40",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm text-gray-900 dark:text-gray-100">
          <span className="font-semibold">{entry.code}</span>
          <span className="text-gray-500 dark:text-gray-400"> · </span>
          {entry.title}
        </div>
        <div className="truncate text-xs text-gray-500 dark:text-gray-400">
          {entry.hasStructure
            ? `${entry.pathways} ${entry.pathways === 1 ? "pathway" : "pathways"} · ${entry.plans} ${
                entry.plans === 1 ? "plan" : "plans"
              }`
            : "No structure scraped"}
        </div>
      </div>
      {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#003A6E] dark:text-blue-300" />}
    </div>
  )
}

// ── Unit detail panel ────────────────────────────────────────────────────────

interface UnitMetaItem {
  name: string
  description: string | null
  weight: number | null
  individualGroup: string | null
  dueDate: string | null
}

interface UnitMeta {
  code: string
  title: string | null
  synopsis: string | null
  hasExam: boolean
  assessmentCount: number
  items: UnitMetaItem[]
}

type UnitMetaState =
  | { status: "loading" }
  | { status: "ready"; meta: UnitMeta }
  | { status: "missing" }
  | { status: "error"; message: string }

const NO_OUTLINE = "No outline available for this unit"

interface PlanUnitPanelProps {
  unit: PlanUnit
  campus: string | null
  onClose: () => void
}

function PlanUnitPanel({ unit, campus, onClose }: PlanUnitPanelProps) {
  const [state, setState] = useState<UnitMetaState>({ status: "loading" })
  const [entered, setEntered] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Fetch the outline on open. data/unit-meta.json is 1.3 MB and stays on the
  // server; a missing entry is an expected state, not an error.
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: "loading" })

    ;(async () => {
      try {
        const response = await fetch(`/api/units/${encodeURIComponent(unit.code)}`, {
          signal: controller.signal,
        })
        if (response.status === 404) {
          setState({ status: "missing" })
          return
        }
        const data = await response.json().catch(() => null)
        if (!response.ok || !data) {
          setState({ status: "error", message: `Could not load the outline for ${unit.code}.` })
          return
        }
        setState({
          status: "ready",
          meta: {
            code: typeof data.code === "string" ? data.code : unit.code,
            title: typeof data.title === "string" ? data.title : null,
            synopsis: typeof data.synopsis === "string" && data.synopsis.trim() ? data.synopsis : null,
            hasExam: data.hasExam === true,
            assessmentCount: typeof data.assessmentCount === "number" ? data.assessmentCount : 0,
            items: Array.isArray(data.items)
              ? data.items.map((item: any) => ({
                  name: asString(item?.name, "Assessment item"),
                  description: asString(item?.description) || null,
                  weight: asNumber(item?.weight),
                  individualGroup: asString(item?.individualGroup) || null,
                  dueDate: asString(item?.dueDate) || null,
                }))
              : [],
          },
        })
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return
        setState({ status: "error", message: `Could not reach the unit outline for ${unit.code}.` })
      }
    })()

    return () => controller.abort()
  }, [unit.code])

  // Paint the closed state once so the slide-in transition has something to run from.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setEntered(true)
      closeRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const meta = state.status === "ready" ? state.meta : null
  const synopsis = meta?.synopsis ?? null
  const title = unit.title || meta?.title || unit.code

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-unit-panel-title"
      onClick={onClose}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-gray-950/40 backdrop-blur-sm transition-opacity duration-300 ease-out dark:bg-slate-950/60",
          "motion-reduce:transition-none motion-reduce:opacity-100",
          entered ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        data-testid="unit-panel"
        className={cn(
          "relative flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900",
          "transition-transform transition-opacity duration-300 ease-out",
          "motion-reduce:transition-none motion-reduce:translate-x-0 motion-reduce:opacity-100",
          entered ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="min-w-0">
            <span className="text-xs font-medium text-[#003A6E] dark:text-blue-300">Unit overview</span>
            <h2
              id="plan-unit-panel-title"
              className="mt-0.5 text-xl font-bold text-gray-900 dark:text-gray-100"
            >
              {unit.code}
            </h2>
            <p className="mt-1 text-sm leading-snug text-gray-600 dark:text-gray-400">{title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{unit.creditPoints > 0 ? `${unit.creditPoints} credit points` : "Credit points unknown"}</span>
              {campus && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {campus}
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close unit details"
            data-testid="unit-panel-close"
            className="mt-0.5 shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-gray-200 p-5 dark:border-gray-800/60">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-[#003A6E] dark:text-blue-300" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Synopsis</span>
            </div>

            {state.status === "loading" ? (
              <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading the unit outline…
              </p>
            ) : synopsis ? (
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{synopsis}</p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-500">{NO_OUTLINE}</p>
            )}

            {state.status === "error" && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{state.message}</p>
            )}
          </section>

          {meta && (
            <section className="border-b border-gray-200 p-5 dark:border-gray-800/60">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award className="h-3.5 w-3.5 text-[#003A6E] dark:text-blue-300" />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Assessment</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {meta.assessmentCount} {meta.assessmentCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-semibold",
                    meta.hasExam
                      ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-700/40 dark:text-amber-400"
                      : "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-700/40 dark:text-emerald-400",
                  )}
                >
                  {meta.hasExam ? "Exam required" : "No final exam"}
                </span>
              </div>

              {meta.items.length > 0 ? (
                <div className="space-y-2">
                  {meta.items.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-200">{item.name}</span>
                        {item.weight != null && (
                          <span className="shrink-0 text-xs font-semibold text-[#003A6E] dark:text-blue-300">
                            {item.weight}%
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        {item.dueDate && <span>{item.dueDate}</span>}
                        {item.dueDate && item.individualGroup && <span>·</span>}
                        {item.individualGroup && <span>{item.individualGroup}</span>}
                      </div>
                      {item.description && (
                        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-500">Assessment details not specified.</p>
              )}
            </section>
          )}

          {state.status === "missing" && (
            <section className="p-5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {NO_OUTLINE}. Showing what the study plan already knows about {unit.code}.
              </p>
            </section>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <a
            href={`https://www.qut.edu.au/study/unit?unitCode=${unit.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#003A6E] transition-colors hover:text-[#003A6E]/80 dark:text-blue-300 dark:hover:text-blue-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Official QUT page
          </a>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <a
            href={`https://qutvirtual4.qut.edu.au/web/qut/search?profile=UNIT&params.query=${unit.code}&params.showOldUnits=false`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            QUT Virtual
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Option slot picker ───────────────────────────────────────────────────────

interface OptionSlotPickerProps {
  slot: PlanSlot
  semesterName: string
  usedCodes: Set<string>
  /**
   * The unit already filling this slot, when the picker was opened from Change.
   * It has to stay choosable and read as the current answer, not as "In plan".
   */
  selectedCode?: string | null
  /** True while the unit outline panel is layered on top — Escape belongs to it. */
  escapeDisabled: boolean
  /** The unit-prereqs catalogue, used to show semester availability. */
  prereqDoc: PrereqDocument | null
  onChoose: (unit: StructureUnit) => void
  onInspect: (unit: StructureUnit) => void
  onClose: () => void
}

/**
 * The candidates behind one slot. Same slide-in shape as the unit outline panel
 * so it reads as the same surface, with a filter because a complementary or
 * minor pool can be 180 units long.
 *
 * Candidates are grouped by the option pool's own headings (majors, minors,
 * etc.). A pinned "Starred" group appears when the student has starred any
 * matching unit. Each row shows semester availability and a text "View outline"
 * button, and the whole row body chooses the unit.
 */
function OptionSlotPicker({
  slot,
  semesterName,
  usedCodes,
  selectedCode = null,
  escapeDisabled,
  prereqDoc,
  onChoose,
  onInspect,
  onClose,
}: OptionSlotPickerProps) {
  const [entered, setEntered] = useState(false)
  const [query, setQuery] = useState("")
  const [onlyOffered, setOnlyOffered] = useState(false)
  const [starredCodes, setStarredCodes] = useState<string[]>(() => readStarredCodes())
  const closeRef = useRef<HTMLButtonElement>(null)
  const escapeRef = useRef(escapeDisabled)

  useEffect(() => {
    escapeRef.current = escapeDisabled
  }, [escapeDisabled])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setEntered(true)
      closeRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeRef.current) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const toggleStar = (code: string) => {
    setStarredCodes((current) => {
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
      writeStarredCodes(next)
      return next
    })
  }

  const q = query.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    return slot.groups
      .map((group) => ({
        ...group,
        units: group.units.filter((unit) => {
          const matchesQuery =
            !q || unit.code.toLowerCase().includes(q) || unit.title.toLowerCase().includes(q)
          if (!matchesQuery) return false
          if (!onlyOffered) return true
          const offered = checkAvailability(unit.code, semesterName, prereqDoc)
          return offered.status !== "unavailable"
        }),
      }))
      .filter((group) => {
        if (group.units.length > 0) return true
        // Keep header-only dividers visible only when no filter is active.
        return group.headerOnly && !q && !onlyOffered
      })
  }, [slot.groups, q, onlyOffered, semesterName, prereqDoc])

  const starredGroup = useMemo(() => {
    const units = slot.groups
      .flatMap((group) => group.units)
      .filter((unit, index, self) => self.findIndex((u) => u.code === unit.code) === index)
      .filter((unit) => {
        if (!starredCodes.includes(unit.code)) return false
        const matchesQuery =
          !q || unit.code.toLowerCase().includes(q) || unit.title.toLowerCase().includes(q)
        if (!matchesQuery) return false
        if (!onlyOffered) return true
        const offered = checkAvailability(unit.code, semesterName, prereqDoc)
        return offered.status !== "unavailable"
      })
    return units.length > 0
      ? {
          name: "Starred",
          notes: [] as string[],
          units,
          legacy: false,
          headerOnly: false,
        }
      : null
  }, [slot.groups, starredCodes, q, onlyOffered, semesterName, prereqDoc])

  const displayGroups = starredGroup ? [starredGroup, ...filteredGroups] : filteredGroups
  const anyRows = displayGroups.some((group) => group.units.length > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="option-slot-picker-title"
      onClick={onClose}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-gray-950/40 backdrop-blur-sm transition-opacity duration-300 ease-out dark:bg-slate-950/60",
          "motion-reduce:transition-none motion-reduce:opacity-100",
          entered ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        data-testid="slot-picker"
        className={cn(
          "relative flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900",
          "transition-transform transition-opacity duration-300 ease-out",
          "motion-reduce:transition-none motion-reduce:translate-x-0 motion-reduce:opacity-100",
          entered ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="min-w-0">
            <span className="text-xs font-medium text-[#003A6E] dark:text-blue-300">Choose a unit for {semesterName}</span>
            <h2
              id="option-slot-picker-title"
              className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100"
            >
              {slot.label}
            </h2>
            <p className="mt-1 text-xs italic leading-snug text-gray-500 dark:text-gray-400">{slot.note}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{slot.creditPoints} credit points</span>
              <span className="inline-flex items-center gap-1">
                <Layers3 className="h-3 w-3" />
                {slot.candidates.length} options
              </span>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the option list"
            data-testid="slot-picker-close"
            className="mt-0.5 shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-gray-100 p-3 dark:border-gray-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by code or title…"
              aria-label="Filter option units"
              data-testid="slot-picker-filter"
              className="h-9 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#003A6E]/60 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-blue-500/60"
            />
          </div>

          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={onlyOffered}
              onChange={(event) => setOnlyOffered(event.target.checked)}
              data-testid="slot-picker-only-offered"
              className="h-3.5 w-3.5 rounded border-gray-300 text-[#003A6E] focus:ring-[#003A6E] dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-blue-500"
            />
            Only units offered in this semester
          </label>

          {(() => {
            // Only name the source pool when it adds something the slot label
            // already says ("QUT You" under a "QUT You unit" slot does not).
            const normalise = (value: string) =>
              value
                .toLowerCase()
                .replace(/\b(unit|units|studies|option|options|list|unit options)\b/g, " ")
                .replace(/[^a-z0-9]+/g, " ")
                .trim()
            const label = normalise(slot.label)
            const informative = slot.sourceTitles.filter((title) => {
              const pool = normalise(title)
              return label.length > 0 && !pool.includes(label) && !label.includes(pool)
            })
            if (informative.length === 0) return null
            return (
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                From {informative.join(" · ")}
              </p>
            )
          })()}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {!anyRows ? (
            <p className="px-2 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No option matches “{query}”{onlyOffered ? " and the semester filter" : ""}. Clear the filter to see the
              full list.
            </p>
          ) : (
            displayGroups.map((group, groupIndex) => (
              // Two pools can share a semester heading ("QUT You" is published in
              // more than one pathway), so the name alone is not a unique key.
              <div key={`${group.name}-${groupIndex}`} data-testid="slot-candidate-group" data-group-name={group.name}>
                {group.headerOnly ? (
                  <div className="sticky top-0 z-20 border-b border-gray-100 bg-white px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                    {group.name}
                  </div>
                ) : (
                  <div
                    className={cn(
                      // Fully opaque: a translucent header lets the row above it
                      // show through as you scroll, which reads as a rendering bug.
                      "sticky top-0 z-20 border-b border-gray-100 px-2 py-2 dark:border-gray-800",
                      group.legacy
                        ? "bg-gray-50 dark:bg-gray-800"
                        : group.name === "Starred"
                          ? "bg-amber-50 dark:bg-amber-900/40"
                          : "bg-white dark:bg-gray-900",
                    )}
                  >
                    <div
                      className={cn(
                        "text-xs font-semibold",
                        group.legacy
                          ? "text-gray-500 dark:text-gray-400"
                          : group.name === "Starred"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-[#003A6E] dark:text-blue-300",
                      )}
                    >
                      {group.name}
                    </div>
                    {group.legacy && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-500">Not available for new intake</div>
                    )}
                    {group.notes.length > 0 && !group.legacy && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-500">{group.notes.join(" ")}</div>
                    )}
                  </div>
                )}

                {group.units.length > 0 && (
                  <div className="mt-1 space-y-2">
                    {group.units.map((unit) => {
                      // The unit already in this slot stays live: choosing it again
                      // is a no-op, and "In plan" would read as if it were elsewhere.
                      const isSelected = selectedCode === unit.code
                      const used = !isSelected && usedCodes.has(unit.code)
                      const starred = starredCodes.includes(unit.code)
                      const offered = checkAvailability(unit.code, semesterName, prereqDoc)
                      const unavailable = offered.status === "unavailable"
                      return (
                        <div
                          key={unit.code}
                          data-testid="slot-candidate"
                          data-unit-code={unit.code}
                          data-selected={isSelected ? "true" : undefined}
                          onClick={() => {
                            if (used) return
                            onChoose(unit)
                          }}
                          className={cn(
                            "group flex items-start justify-between gap-2 rounded-lg border p-2.5 transition-all duration-150 cursor-pointer",
                            "motion-reduce:transition-none",
                            used
                              ? "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40"
                              : isSelected
                                ? "border-[#003A6E] bg-[#003A6E]/5 ring-1 ring-[#003A6E]/30 dark:border-blue-500 dark:bg-blue-500/10 dark:ring-blue-500/30"
                                : "border-[#003A6E]/15 bg-white hover:border-[#003A6E]/40 hover:bg-[#003A6E]/[0.03] dark:border-blue-900/40 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-900/10",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-[#003A6E] dark:text-blue-300">
                              {unit.code}
                              {isSelected && (
                                <span
                                  data-testid="slot-candidate-selected"
                                  className="rounded-full bg-[#003A6E] px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-blue-500 dark:text-white"
                                >
                                  Selected
                                </span>
                              )}
                            </div>
                            <div className="text-xs leading-snug text-gray-600 dark:text-gray-400 line-clamp-2">
                              {unit.title}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-500">
                              <span>
                                {unit.creditPoints > 0 ? `${unit.creditPoints} CP` : "Credit points unknown"}
                                {unit.campus ? ` · ${unit.campus}` : ""}
                              </span>
                              {unavailable && (
                                <span
                                  className="text-amber-600 dark:text-amber-400"
                                  title={`Offered: ${describeOfferings(offered.offeredIn)}`}
                                >
                                  {describeOfferings(offered.offeredIn)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              data-testid="slot-candidate-star"
                              aria-label={starred ? `Unstar ${unit.code}` : `Star ${unit.code}`}
                              title={starred ? "Starred" : "Star this unit"}
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleStar(unit.code)
                              }}
                              className={cn(
                                "rounded-md p-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] motion-reduce:transition-none",
                                starred
                                  ? "text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                                  : "text-gray-400 hover:bg-gray-100 hover:text-amber-500 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-amber-400",
                              )}
                            >
                              <Star
                                className={cn("h-3.5 w-3.5", starred && "fill-amber-500 dark:fill-amber-400")}
                              />
                            </button>
                            <button
                              type="button"
                              data-testid="slot-candidate-outline"
                              aria-label={`View the outline for ${unit.code}`}
                              title="View outline"
                              onClick={(event) => {
                                event.stopPropagation()
                                onInspect(unit)
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-[#003A6E]/30 hover:bg-[#003A6E]/5 hover:text-[#003A6E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003A6E] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-200"
                            >
                              <BookOpen className="h-3 w-3" />
                              View outline
                            </button>
                            <Button
                              type="button"
                              size="sm"
                              variant={used ? "ghost" : "outline"}
                              disabled={used}
                              data-testid="slot-candidate-choose"
                              onClick={(event) => {
                                event.stopPropagation()
                                onChoose(unit)
                              }}
                              className="h-7 rounded-md px-2 text-xs"
                            >
                              {used ? "In plan" : isSelected ? "Selected" : "Choose"}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-200 bg-white p-3 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          Choosing a unit fills this slot and adds its credit points to {semesterName}. “View outline” opens the
          unit details without choosing it.
        </div>
      </div>
    </div>
  )
}

// ── Planner ──────────────────────────────────────────────────────────────────

export function CoursePlanner() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [listState, setListState] = useState<LoadState>("loading")
  const [listError, setListError] = useState<string | null>(null)
  const [listReloadKey, setListReloadKey] = useState(0)

  const [courseCode, setCourseCode] = useState("")
  const [specIndex, setSpecIndex] = useState(0)
  const [structureId, setStructureId] = useState("")

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [courseState, setCourseState] = useState<LoadState>("idle")
  const [courseError, setCourseError] = useState<string | null>(null)
  const [courseErrorKind, setCourseErrorKind] = useState<"not_found" | "error" | null>(null)
  const [courseReloadKey, setCourseReloadKey] = useState(0)

  const [plan, setPlan] = useState<PlanSemester[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [activeUid, setActiveUid] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)

  /** Plan-wide credit-point target; `loadSettingsReady` stops the persist effects
   *  from writing the default 48 over a stored part-time choice on first render. */
  const [loadTarget, setLoadTarget] = useState<number>(DEFAULT_LOAD_TARGET)
  const [loadOverrides, setLoadOverrides] = useState<Record<string, number>>({})
  const [loadSettingsReady, setLoadSettingsReady] = useState(false)

  /** What the last target change did to the plan. Cleared by any manual edit. */
  const [reflowNotice, setReflowNotice] = useState<string | null>(null)

  /**
   * The Tune disclosure: the load target, the per-semester overrides and the
   * instructions live behind it so the planner opens on the plan itself.
   * Collapsed by default, and remembered once the student opens it.
   */
  const [tuneOpen, setTuneOpen] = useState(false)
  const [tuneReady, setTuneReady] = useState(false)

  /**
   * The confirmation line for the last one-tap fix, plus the plan signature it
   * describes. The signature is what retires it: the moment the plan is anything
   * other than the layout that fix produced, the strip goes back to reporting.
   */
  const [fixNotice, setFixNotice] = useState<{ text: string; signature: string } | null>(null)

  /** data/unit-prereqs.json, fetched once: it is plan-independent. */
  const [prereqDoc, setPrereqDoc] = useState<PrereqDocument | null>(null)

  const planRef = useRef<PlanSemester[]>([])

  // Restore the last course/pathway/plan the user was looking at.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:selection`)
      if (!raw) return
      const stored = JSON.parse(raw)
      if (stored && typeof stored.courseCode === "string" && stored.courseCode) {
        setCourseCode(stored.courseCode)
        setSpecIndex(typeof stored.specIndex === "number" && stored.specIndex >= 0 ? stored.specIndex : 0)
        setStructureId(typeof stored.structureId === "string" ? stored.structureId : "")
      }
    } catch {
      // Ignore corrupt storage and fall back to the default course.
    }
  }, [])

  // Load target: one preference for the whole planner plus per-semester overrides.
  // localStorage only, like the plan itself — the timetable keeps working with no
  // account and no env vars.
  useEffect(() => {
    setLoadTarget(readLoadTarget())
    setLoadOverrides(readLoadOverrides())
    setLoadSettingsReady(true)
  }, [])

  // The Tune disclosure, restored the same way: read on mount so the server
  // render and the first client render agree, then persist every change.
  useEffect(() => {
    setTuneOpen(readTune())
    setTuneReady(true)
  }, [])

  useEffect(() => {
    if (!tuneReady) return
    writeTune(tuneOpen)
  }, [tuneOpen, tuneReady])

  useEffect(() => {
    if (!loadSettingsReady) return
    try {
      window.localStorage.setItem(LOAD_TARGET_STORAGE_KEY, JSON.stringify(loadTarget))
    } catch {
      // Storage full or blocked — the target still applies for this session.
    }
  }, [loadTarget, loadSettingsReady])

  useEffect(() => {
    if (!loadSettingsReady) return
    try {
      window.localStorage.setItem(LOAD_OVERRIDES_STORAGE_KEY, JSON.stringify(loadOverrides))
    } catch {
      // Non-fatal, same as above.
    }
  }, [loadOverrides, loadSettingsReady])

  // Course list (small summary payload — the 4 MB structure file stays server-side).
  useEffect(() => {
    let cancelled = false
    setListState("loading")
    setListError(null)

    ;(async () => {
      try {
        const response = await fetch("/api/courses")
        const data = await response.json().catch(() => null)
        if (cancelled) return
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(
            (data && typeof data.message === "string" && data.message) || `Course list request failed (HTTP ${response.status}).`,
          )
        }
        setCourses(data as CourseSummary[])
        setListState("ready")
        setCourseCode((current) => {
          if (current) return current
          const preferred = (data as CourseSummary[]).find((entry) => entry.hasStructure) ?? (data as CourseSummary[])[0]
          return preferred?.code ?? ""
        })
      } catch (error) {
        if (cancelled) return
        setListState("error")
        setListError(error instanceof Error ? error.message : "Could not load the course list.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [listReloadKey])

  // One course's full pathway tree.
  useEffect(() => {
    if (!courseCode) {
      setCourse(null)
      setCourseState("idle")
      return
    }

    let cancelled = false
    setCourseState("loading")
    setCourseError(null)
    setCourseErrorKind(null)

    ;(async () => {
      try {
        const response = await fetch(`/api/courses/${encodeURIComponent(courseCode)}`)
        const data = await response.json().catch(() => null)
        if (cancelled) return
        if (!response.ok) {
          setCourse(null)
          setCourseState("error")
          setCourseErrorKind(data && data.error === "not_found" ? "not_found" : "error")
          setCourseError(
            (data && typeof data.message === "string" && data.message) || `Could not load ${courseCode} (HTTP ${response.status}).`,
          )
          return
        }
        const normalised = normaliseCourse(data)
        if (!normalised) {
          setCourse(null)
          setCourseState("error")
          setCourseErrorKind("error")
          setCourseError(`${courseCode} came back without any usable structure data.`)
          return
        }
        setCourse(normalised)
        setCourseState("ready")
      } catch {
        if (cancelled) return
        setCourse(null)
        setCourseState("error")
        setCourseErrorKind("error")
        setCourseError("Could not reach the course planner API. Check your connection and try again.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [courseCode, courseReloadKey])

  const specializations = course?.specializations ?? []
  const effectiveSpecIndex = specializations[specIndex] ? specIndex : 0
  const activeSpec = specializations[effectiveSpecIndex] ?? null
  const allStructures = activeSpec?.structures ?? []
  // QUT lists option pools ("Minor Options List", "QUT You") alongside real study
  // plans. Only progressions belong in the plan picker; the pools feed the option
  // slots instead. Fall back to everything if a course has no labelled progression.
  const progressions = allStructures.filter((entry) => entry.kind !== "options")
  const structures = progressions.length > 0 ? progressions : allStructures
  const structure = structures.find((entry) => entry.id === structureId) ?? structures[0] ?? null

  const structureKey = course && structure ? `${course.courseCode}:${effectiveSpecIndex}:${structure.id}` : ""
  const qutPlan = useMemo(() => (structure ? buildQutPlan(structure) : []), [structure])

  /**
   * Option pools the slots draw from: this pathway's own option lists first,
   * then every other pathway's in the same course. Some lists only hang off a
   * sibling pathway (IN01 lists QUT You under one major only), and a note with
   * no pool has to stay text rather than open an empty picker.
   */
  const optionPools = useMemo(() => {
    if (!course) return [] as Structure[]
    const pools: Structure[] = []
    const seen = new Set<string>()
    const add = (structures: Structure[] | undefined) => {
      for (const candidate of structures ?? []) {
        if (candidate.kind !== "options" || seen.has(candidate.id)) continue
        seen.add(candidate.id)
        pools.push(candidate)
      }
    }
    add(course.specializations[effectiveSpecIndex]?.structures)
    for (const spec of course.specializations) add(spec.structures)
    return pools
  }, [course, effectiveSpecIndex])

  // Load the saved plan for this course/pathway/structure, or start from QUT's.
  useEffect(() => {
    if (!structureKey) {
      planRef.current = []
      setPlan([])
      setSavedAt(null)
      return
    }
    const stored = readStoredPlan(planStorageKey(courseCode, effectiveSpecIndex, structure?.id ?? ""))
    const next = stored ?? qutPlan
    planRef.current = next
    setPlan(next)
    setSavedAt(stored ? Date.now() : null)
    setReflowNotice(null)
    // qutPlan only changes when the structure does; both move together.
  }, [structureKey, qutPlan, courseCode, effectiveSpecIndex, structure])

  // Persist layout changes.
  useEffect(() => {
    if (!structureKey || plan.length === 0) return
    try {
      window.localStorage.setItem(planStorageKey(courseCode, effectiveSpecIndex, structure?.id ?? ""), JSON.stringify(plan))
      setSavedAt(Date.now())
    } catch {
      // Storage full or blocked — the planner still works for this session.
    }
  }, [plan, structureKey, courseCode, effectiveSpecIndex, structure])

  useEffect(() => {
    if (!courseCode) return
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}:selection`,
        JSON.stringify({ courseCode, specIndex: effectiveSpecIndex, structureId: structure?.id ?? "" }),
      )
    } catch {
      // Non-fatal.
    }
  }, [courseCode, effectiveSpecIndex, structure])

  // The confirmation names one specific unit and semester, so it only belongs on
  // the layout that fix produced. Any later change to the plan (another fix, a
  // drag, a reset) retires it and the strip starts reporting again.
  useEffect(() => {
    if (!fixNotice) return
    if (planSignature(plan) === fixNotice.signature) return
    setFixNotice(null)
  }, [plan, fixNotice])

  // Prerequisite + offering catalogue. Fetched once for the whole app session:
  // the document does not depend on the plan, and `planIssues` needs the full
  // index anyway because it derives QUT's equivalent-unit map from every entry.
  useEffect(() => {
    const controller = new AbortController()

    ;(async () => {
      try {
        const response = await fetch("/api/unit-prereqs", { signal: controller.signal })
        if (!response.ok) return
        const data = await response.json().catch(() => null)
        const units = data && typeof data === "object" ? (data as PrereqDocument).units : null
        if (!units || typeof units !== "object") return
        setPrereqDoc({ units })
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return
        // A missing catalogue means "no flags", not a broken planner: stay quiet.
      }
    })()

    return () => controller.abort()
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const columnOf = (id: string): string | null => {
    if (id.startsWith("col~")) return id.slice(4)
    for (const semester of planRef.current) {
      if (semester.units.some((unit) => unit.uid === id)) return semester.id
    }
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveUid(id)
    setOverColumn(columnOf(id))
    // The notice describes the last reflow; a manual drag is a new state.
    setReflowNotice(null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const from = columnOf(activeId)
    const to = overId.startsWith("col~") ? overId.slice(4) : columnOf(overId)

    setOverColumn(to)
    if (!from || !to || from === to) return

    const current = planRef.current
    const next = moveUnit(current, from, to, activeId, overId)
    if (next === current) return
    planRef.current = next
    setPlan(next)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveUid(null)
    setOverColumn(null)
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const current = planRef.current
    const from = columnOf(activeId)
    const to = overId.startsWith("col~") ? overId.slice(4) : columnOf(overId)
    if (!from || !to) return

    if (from !== to) {
      // Normally onDragOver has already moved it; this covers a drop that never fired one.
      const next = moveUnit(current, from, to, activeId, overId)
      if (next !== current) {
        planRef.current = next
        setPlan(next)
      }
      return
    }

    const semester = current.find((entry) => entry.id === from)
    if (!semester) return
    const oldIndex = semester.units.findIndex((unit) => unit.uid === activeId)
    const newIndex = semester.units.findIndex((unit) => unit.uid === overId)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

    const next = current.map((entry) =>
      entry.id === from ? { ...entry, units: arrayMove(entry.units, oldIndex, newIndex) } : entry,
    )
    planRef.current = next
    setPlan(next)
  }

  const resetToQutPlan = () => {
    if (!structure) return
    const next = buildQutPlan(structure)
    planRef.current = next
    setPlan(next)
    setOpenSlotId(null)
    setReflowNotice(null)
  }

  /**
   * One-tap repair from the problem strip.
   *
   * Same write path as a drag: `planRef` plus `setPlan`, which is what the persist
   * effect and "Reset to QUT plan" both work from. The move was worked out in
   * lib/plan-fixes.ts against the plan on screen, so clicking only has to write it:
   * one unit, one semester, nothing else touched.
   */
  const applyProblemFix = (fix: PlanProblemFix) => {
    const current = planRef.current
    const next = applyPlanMove(current, fix.move)
    if (next === current) return
    planRef.current = next
    setPlan(next)
    setFixNotice({ text: describeMove(fix.move), signature: planSignature(next) })
    setReflowNotice(null)
  }

  /** `null` clears the override so the semester follows the plan default again. */
  // Semester ids ("s1", "s2") are only unique within one plan, and every plan has
  // them. Keying overrides on the bare id meant choosing part-time on one course
  // silently changed the load of a different course's matching slot. Namespace by
  // the same course/pathway/plan key the saved plan itself uses.
  const loadOverrideKey = (semesterId: string) =>
    structureKey ? `${structureKey}|${semesterId}` : semesterId

  /**
   * What an open option slot weighs, in the same units `deriveSlots` uses. A
   * reflow needs this to count an unfilled "QUT You unit (6 CP)" card as 6 CP the
   * column still has to hold; a note with no pool behind it returns null and is
   * just text.
   */
  const slotCreditsFor = (note: string): number | null => {
    const hit = classifyNote(note, optionPools)
    return hit ? hit.creditPoints : null
  }

  /** "3 units and 2 open slots moved" without repeating a zero. */
  const describeReflow = (moved: number, notesMoved: number) => {
    const parts: string[] = []
    if (moved > 0) parts.push(`${moved} ${moved === 1 ? "unit" : "units"}`)
    if (notesMoved > 0) parts.push(`${notesMoved} open ${notesMoved === 1 ? "slot" : "slots"}`)
    return parts.join(" and ")
  }

  /**
   * One column's target re-packs from QUT's plan, exactly like the plan-wide
   * target does.
   *
   * It used to push forward from the current arrangement, which made it a one-way
   * valve: a column shed its units into the next one and clearing the override had
   * nothing to pull back, so Year 1 Semester 1 stayed drained and the plan stayed
   * one column longer. Both controls now recompute from `reflowBasePlan(qutPlan)`,
   * so setting an override and setting it back to Default returns the canonical
   * layout: same columns, same names, same choice cards in each one.
   *
   * The cost is the same one the plan-wide target already has, and the notice says
   * it: a target change re-packs from QUT's plan, so manual drags are dropped.
   * One rule for both controls is easier to predict than two.
   */
  const setSemesterLoadOverride = (semesterId: string, target: number | null) => {
    const key = loadOverrideKey(semesterId)
    const nextOverrides: Record<string, number> = { ...loadOverrides }
    if (target === null) delete nextOverrides[key]
    else nextOverrides[key] = target
    setLoadOverrides(nextOverrides)

    const current = planRef.current
    // The column is named in the notice, and the canonical plan has it even when
    // the current layout does not.
    const semester =
      current.find((entry) => entry.id === semesterId) ?? qutPlan.find((entry) => entry.id === semesterId) ?? null
    if (!semester) return

    const cap = resolveLoadTarget(target, loadTarget)
    const base = reflowBasePlan(qutPlan, current)
    const { plan: reflowed, moved, notesMoved } = reflowPlan(base, {
      planTarget: loadTarget,
      overrideFor: (id) => nextOverrides[loadOverrideKey(id)] ?? null,
      slotCreditsFor,
    })

    if (planSignature(reflowed) !== planSignature(current)) {
      planRef.current = reflowed
      setPlan(reflowed)
    }

    setReflowNotice(
      moved > 0 || notesMoved > 0
        ? `Re-packed from QUT's plan with ${semester.name} at ${cap} CP: ${describeReflow(moved, notesMoved)} moved, ${reflowed.length} semesters. Reset to QUT plan undoes it.`
        : `${semester.name} already fits ${cap} CP, so nothing had to move.`,
    )
  }

  /**
   * Changing the plan-wide target re-packs from QUT's canonical plan, not from the
   * current arrangement: see `reflowBasePlan`. The consequence is intentional and
   * the notice says so — drags made by hand before a target change are discarded,
   * and Reset to QUT plan is the way back to anything the student wants again.
   */
  const applyLoadTarget = (next: number) => {
    if (next === loadTarget) return
    setLoadTarget(next)

    const current = planRef.current
    const base = reflowBasePlan(qutPlan, current)
    const { plan: reflowed, moved, notesMoved } = reflowPlan(base, {
      planTarget: next,
      overrideFor: (semesterId) => loadOverrides[loadOverrideKey(semesterId)] ?? null,
      slotCreditsFor,
    })

    if (planSignature(reflowed) !== planSignature(current)) {
      planRef.current = reflowed
      setPlan(reflowed)
    }

    setReflowNotice(
      moved > 0 || notesMoved > 0
        ? `Re-packed from QUT's plan to ${next} CP: ${describeReflow(moved, notesMoved)} moved, ${reflowed.length} semesters. Reset to QUT plan undoes it.`
        : `Nothing needed moving. Every semester already fits ${next} CP.`,
    )
  }

  // Slots are derived from the plan's notes, not stored with it: the notes never
  // change, so the same note always produces the same slot, and only which unit
  // was chosen (PlanUnit.slotId) has to survive a reload.
  const slotsBySemester = useMemo(() => deriveSlots(plan, optionPools), [plan, optionPools])
  const allSlots = useMemo(() => [...slotsBySemester.values()].flat(), [slotsBySemester])
  const openSlots = useMemo(
    () =>
      plan.flatMap((semester) => {
        const filled = filledSlotIds(semester)
        return (slotsBySemester.get(semester.id) ?? []).filter((slot) => !filled.has(slot.id))
      }),
    [plan, slotsBySemester],
  )
  const pendingCredits = openSlots.reduce((total, slot) => total + slot.creditPoints, 0)

  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const openSlot = openSlotId ? allSlots.find((slot) => slot.id === openSlotId) ?? null : null
  const openSlotSemester = openSlot ? plan.find((semester) => semester.id === openSlot.semesterId) ?? null : null
  /** The unit already answering the open slot, when Change opened the picker. */
  const openSlotChoice = openSlot
    ? plan.flatMap((semester) => semester.units).find((unit) => unit.slotId === openSlot.id) ?? null
    : null

  const totalCredits = plan.reduce((total, semester) => total + creditPointsOf(semester), 0)
  const totalUnits = plan.reduce((total, semester) => total + semester.units.length, 0)

  // A structure holds one progression per intake ("February entry", "July entry"),
  // and both use the same semester names for different units. Summing the whole
  // plan therefore counts two degrees' worth of units — 456 CP for a 288 CP course.
  // A student only ever follows one path, so report the totals per path instead.
  const sectionTotals = useMemo(() => {
    const map = new Map<string, { units: number; credits: number; pending: number }>()
    for (const semester of plan) {
      const key = semester.section || "Plan"
      const entry = map.get(key) ?? { units: 0, credits: 0, pending: 0 }
      entry.units += semester.units.length
      entry.credits += creditPointsOf(semester)
      // Slots still to be chosen are the honest gap between what the plan shows
      // and a full load, so they travel with the totals rather than being hidden.
      const filled = filledSlotIds(semester)
      entry.pending += (slotsBySemester.get(semester.id) ?? [])
        .filter((slot) => !filled.has(slot.id))
        .reduce((total, slot) => total + slot.creditPoints, 0)
      map.set(key, entry)
    }
    return [...map.entries()]
  }, [plan, slotsBySemester])
  const showSection = useMemo(
    () => new Set(plan.map((semester) => semester.section).filter(Boolean)).size > 1,
    [plan],
  )

  /**
   * The one line at the top: how big the plan is and how much of it is still a
   * choice. Two entry paths hold two degrees' worth of units, so the line
   * reports the fullest path rather than adding them together.
   */
  const planSummary = useMemo(() => {
    if (sectionTotals.length > 1) {
      const fullest = sectionTotals.reduce(
        (best, [, totals]) =>
          totals.credits + totals.pending > best.credits + best.pending ? totals : best,
        sectionTotals[0][1],
      )
      return { credits: fullest.credits + fullest.pending, pending: fullest.pending }
    }
    return { credits: totalCredits + pendingCredits, pending: pendingCredits }
  }, [sectionTotals, totalCredits, pendingCredits])
  const dirty = useMemo(() => planSignature(plan) !== planSignature(qutPlan), [plan, qutPlan])
  const activeUnit = activeUid ? plan.flatMap((semester) => semester.units).find((unit) => unit.uid === activeUid) ?? null : null

  const [courseQuery, setCourseQuery] = useState("")
  /** The unit whose detail panel is open, if any. */
  const [detailUnit, setDetailUnit] = useState<PlanUnit | null>(null)

  /**
   * Fill an empty slot, or swap the unit already in it, in one plan update.
   *
   * The swap is deliberately a replacement rather than remove-then-add: the slot
   * stays filled at every point, so the pending total never moves and the card
   * never leaves the column between two renders.
   */
  const chooseSlotUnit = (slot: PlanSlot, candidate: StructureUnit) => {
    const current = planRef.current
    const holder = current.find((semester) => semester.units.some((unit) => unit.slotId === slot.id))
    const existing = holder?.units.find((unit) => unit.slotId === slot.id) ?? null

    // Picking the unit that already answers the slot changes nothing.
    if (existing?.code === candidate.code) {
      setOpenSlotId(null)
      return
    }

    const unit: PlanUnit = {
      uid: `slot:${slot.id}:${candidate.code}`,
      code: candidate.code,
      title: candidate.title || candidate.code,
      creditPoints: candidate.creditPoints,
      slotId: slot.id,
    }

    const next = current.map((semester) => {
      if (holder && semester.id === holder.id) {
        // Same position in the column, same slot id: only the unit changes.
        const position = semester.units.findIndex((entry) => entry.slotId === slot.id)
        const units = [...semester.units]
        units[position] = unit
        return { ...semester, units }
      }
      if (!holder && semester.id === slot.semesterId) {
        return { ...semester, units: [...semester.units, unit] }
      }
      return semester
    })

    planRef.current = next
    setPlan(next)
    setOpenSlotId(null)
    setDetailUnit((current) => (existing && current?.uid === existing.uid ? null : current))
    setReflowNotice(null)
  }

  /** Reopen the picker for the slot `unit` fills, with that unit marked as chosen. */
  const changeSlotUnit = (unit: PlanUnit) => {
    if (!unit.slotId) return
    const slot = allSlots.find((candidate) => candidate.id === unit.slotId)
    if (!slot) return
    setOpenSlotId(slot.id)
  }

  /** Empty a slot again. The unit is removed, not just unlinked, so the totals drop with it. */
  const clearSlotUnit = (unit: PlanUnit) => {
    const next = planRef.current.map((semester) =>
      semester.units.some((candidate) => candidate.uid === unit.uid)
        ? { ...semester, units: semester.units.filter((candidate) => candidate.uid !== unit.uid) }
        : semester,
    )
    planRef.current = next
    setPlan(next)
    setDetailUnit((current) => (current?.uid === unit.uid ? null : current))
    setReflowNotice(null)
  }

  /** Peek at an option without committing to it — the outline panel opens on top of the picker. */
  const inspectCandidate = (unit: StructureUnit) => {
    setDetailUnit({
      uid: `preview:${unit.code}`,
      code: unit.code,
      title: unit.title || unit.code,
      creditPoints: unit.creditPoints,
    })
  }

  const usedCodes = useMemo(
    () => new Set(plan.flatMap((semester) => semester.units.map((unit) => unit.code))),
    [plan],
  )

  const courseOptions = useMemo(() => {
    const q = courseQuery.trim().toLowerCase()
    const matches = (entry: CourseSummary) => {
      if (!q) return true
      return entry.code.toLowerCase().includes(q) || entry.title.toLowerCase().includes(q)
    }

    const withPlans = courses.filter((entry) => entry.hasStructure && matches(entry))
    const withoutPlans = courses.filter((entry) => !entry.hasStructure && matches(entry))
    return { withPlans, withoutPlans, total: withPlans.length + withoutPlans.length }
  }, [courses, courseQuery])

  const selectedCourse = courses.find((entry) => entry.code === courseCode) ?? null

  // The plan data carries a campus per unit offering; the unit itself does not.
  // Collect every campus a unit appears at, since a lecture can run at GP and KG.
  const campusByCode = useMemo(() => {
    const map = new Map<string, string>()
    if (!structure) return map
    // Option pools too: a unit chosen into a slot comes from one of those lists,
    // and the outline panel should still show where it is taught.
    for (const candidate of [structure, ...optionPools]) {
      for (const semester of candidate.semesters) {
        for (const unit of semester.units) {
          if (!unit.campus) continue
          const existing = map.get(unit.code)
          if (!existing) {
            map.set(unit.code, unit.campus)
          } else if (!existing.split(" / ").includes(unit.campus)) {
            map.set(unit.code, `${existing} / ${unit.campus}`)
          }
        }
      }
    }
    return map
  }, [structure, optionPools])

  /**
   * The plan reshaped for `planIssues`: code plus the unit's real credit points.
   * The evaluator otherwise assumes QUT's standard 12cp for every unit, which is
   * wrong for the 6cp QUT You units and can flip a credit-point prerequisite.
   */
  const planForIssues = useMemo(
    () =>
      plan.map((semester) => ({
        units: semester.units.map((unit) => ({
          code: unit.code,
          creditPoints: unit.creditPoints > 0 ? unit.creditPoints : undefined,
        })),
      })),
    [plan],
  )

  /**
   * Everything wrong with the plan right now, derived in one pass.
   *
   * `planIssues` already counts only strictly earlier semesters as completed and
   * derives equivalents from the index; we only reshape its input and drop the
   * "unknown" verdicts. An unknown means we could not read QUT's wording, which
   * is not the student's mistake, so it must not be shown or dotted.
   */
  // Where QUT itself put each unit, so we can tell "the student moved this into a
  // semester it does not run in" apart from "QUT's own plan disagrees with its own
  // offering list". The second is a data problem on their side (EFB349 is published
  // Semester 1 only but scheduled in Year 3 Semester 2), and reporting it on an
  // untouched plan reads as the tool being wrong.
  const qutPlacement = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const semester of qutPlan) {
      for (const unit of semester.units) {
        const existing = map.get(unit.code)
        if (existing) existing.add(semester.id)
        else map.set(unit.code, new Set([semester.id]))
      }
    }
    return map
  }, [qutPlan])

  const planProblems = useMemo<PlanProblems>(() => {
    const byUid = new Map<string, PlanProblem[]>()
    if (!prereqDoc) return { prereq: [], availability: [], byUid }

    const unmet = new Map<string, PlanIssue>()
    for (const issue of planIssues(planForIssues, prereqDoc, { courseCode: courseCode || undefined })) {
      if (issue.status !== "unmet") continue
      unmet.set(`${issue.semesterIndex}:${issue.unitCode}`, issue)
    }

    const prereq: PlanProblem[] = []
    const availability: PlanProblem[] = []
    const presentInPlan = new Set(
      plan.flatMap((semester) => semester.units.map((unit) => unit.code)),
    )

    plan.forEach((semester, semesterIndex) => {
      const semesterNumber = semesterNumberFromName(semester.name)

      for (const unit of semester.units) {
        const problems: PlanProblem[] = []

        const issue = unmet.get(`${semesterIndex}:${unit.code}`)
        if (issue) {
          // One action per line: the extra alternatives ride along in the tooltip.
          const described = describeIssue(issue.kind, unit.code, issue.missingUnits, presentInPlan)
          // The move is worked out here, not on the click, so a row only carries a
          // button when the fix has already been proved to clear it.
          const move = findPrerequisiteMove(
            plan,
            { unitUid: unit.uid, unitCode: unit.code, kind: issue.kind, missingUnits: issue.missingUnits },
            prereqDoc,
            { courseCode: courseCode || undefined },
          )
          const problem: PlanProblem = {
            kind: "prereq",
            sentence: described.sentence,
            detail: described.detail,
            fix: move ? { label: "Move it later", kind: "prereq", move } : undefined,
          }
          prereq.push(problem)
          problems.push(problem)
        }

        // Semester numbers only: a plan is year-agnostic, so the unit's calendar
        // year is irrelevant. "unknown" (no offerings we can read, unknown
        // column name) never becomes a problem.
        const satWhereQutPutIt = qutPlacement.get(unit.code)?.has(semester.id) ?? false
        const offered = checkAvailability(unit.code, semester.name, prereqDoc)
        if (offered.status === "unavailable" && semesterNumber !== null && !satWhereQutPutIt) {
          const move = findAvailabilityMove(
            plan,
            { unitUid: unit.uid, unitCode: unit.code },
            prereqDoc,
            { courseCode: courseCode || undefined },
          )
          const problem: PlanProblem = {
            kind: "availability",
            sentence: `${unit.code} is not offered in Semester ${semesterNumber}. ${describeOfferings(
              offered.offeredIn,
            )}`,
            fix: move ? { label: "Find a slot", kind: "availability", move } : undefined,
          }
          availability.push(problem)
          problems.push(problem)
        }

        if (problems.length > 0) byUid.set(unit.uid, problems)
      }
    })

    return { prereq, availability, byUid }
  }, [plan, planForIssues, prereqDoc, courseCode, qutPlacement])

  const handleCourseSelect = (code: string) => {
    setCourseCode(code)
    setSpecIndex(0)
    setStructureId("")
  }

  return (
    <div className="space-y-6">
      {/* overflow-visible so the combobox panel can extend past the card edge */}
      <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md transition-all duration-300">
        <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
          <CardTitle className="text-base text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
            Course Planner
          </CardTitle>
          <CardDescription className="dark:text-gray-400 transition-colors duration-300">
            Pick a course, then a pathway, then a study plan. Click a unit for its synopsis and
            assessment, or drag it between semesters to see how it fits.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 dark:bg-gray-900 rounded-b-xl transition-colors duration-300 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="planner-course" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                Course
              </Label>
              {/* Search is folded into the trigger: click it, type, and the list
                  underneath narrows by code or title. */}
              <CourseCombobox
                id="planner-course"
                options={courseOptions}
                value={courseCode}
                selected={selectedCourse}
                query={courseQuery}
                onQueryChange={setCourseQuery}
                onSelect={handleCourseSelect}
                disabled={listState === "loading" || courses.length === 0}
                loading={listState === "loading"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="planner-pathway" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                Pathway / major
              </Label>
              <Select
                value={activeSpec ? String(effectiveSpecIndex) : ""}
                onValueChange={(value) => {
                  setSpecIndex(Number(value))
                  setStructureId("")
                }}
                disabled={courseState !== "ready" || specializations.length === 0}
              >
                <SelectTrigger
                  id="planner-pathway"
                  className="focus:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                >
                  <SelectValue
                    placeholder={
                      courseState === "loading" ? "Loading pathways..." : specializations.length === 0 ? "No pathways" : "Choose a pathway"
                    }
                  >
                    {activeSpec ? prettyName(activeSpec.name) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 rounded-lg max-w-[min(90vw,420px)]">
                  {specializations.map((spec, index) => (
                    <SelectItem
                      key={`${spec.name}-${index}`}
                      value={String(index)}
                      className="focus:bg-[#003A6E]/10 dark:focus:bg-blue-900/30 transition-colors duration-200"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm">{prettyName(spec.name)}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {spec.structures.length} {spec.structures.length === 1 ? "study plan" : "study plans"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="planner-structure" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                Study plan
              </Label>
              <Select
                value={structure?.id ?? ""}
                onValueChange={setStructureId}
                disabled={structures.length === 0}
              >
                <SelectTrigger
                  id="planner-structure"
                  className="focus:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                >
                  <SelectValue placeholder={structures.length === 0 ? "No study plans" : "Choose a study plan"}>
                    {structure ? structure.title : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 rounded-lg max-w-[min(90vw,460px)]">
                  {structures.map((entry) => (
                    <SelectItem
                      key={entry.id}
                      value={entry.id}
                      className="focus:bg-[#003A6E]/10 dark:focus:bg-blue-900/30 transition-colors duration-200"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm">{entry.title}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {entry.unitCount ?? entry.semesters.reduce((n, s) => n + s.units.length, 0)} units
                          {entry.creditPoints ? ` · ${entry.creditPoints} CP` : ""}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedCourse && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>
                {selectedCourse.code} · {selectedCourse.title}
              </span>
              {selectedCourse.aqfLevel && <span>{selectedCourse.aqfLevel}</span>}
              {typeof selectedCourse.creditPoints === "number" && <span>{selectedCourse.creditPoints} CP total</span>}
              {course && course.approvedMajors.length > 0 && <span>{course.approvedMajors.length} approved majors</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Course list failure */}
      {listState === "error" && (
        <Alert variant="destructive" className="rounded-lg shadow-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load the course list</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{listError ?? "The planner API did not respond."}</p>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={() => setListReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Course exists in the catalogue but has no scraped structure */}
      {listState !== "error" && courseState === "error" && courseErrorKind === "not_found" && (
        <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden">
          <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
            <CardTitle className="text-base text-[#003A6E] dark:text-blue-300">No study plan for this course yet</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-sm text-gray-600 dark:text-gray-400 dark:bg-gray-900 space-y-3">
            <p>{courseError ?? `We have not collected a structure for ${courseCode} yet.`}</p>
            {selectedCourse && (
              <p>
                {selectedCourse.code} · {selectedCourse.title}
                {selectedCourse.aqfLevel ? ` · ${selectedCourse.aqfLevel}` : ""}
                {typeof selectedCourse.creditPoints === "number" ? ` · ${selectedCourse.creditPoints} CP` : ""}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => setCourseReloadKey((key) => key + 1)}
              >
                Check again
              </Button>
              {courseOptions.withPlans[0] && (
                <Button
                  size="sm"
                  className="rounded-lg bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700"
                  onClick={() => {
                    setCourseCode(courseOptions.withPlans[0].code)
                    setSpecIndex(0)
                    setStructureId("")
                  }}
                >
                  Open {courseOptions.withPlans[0].code} instead
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real fetch/parse failure */}
      {listState !== "error" && courseState === "error" && courseErrorKind !== "not_found" && (
        <Alert variant="destructive" className="rounded-lg shadow-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load {courseCode || "this course"}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{courseError ?? "Unknown error."}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => setCourseReloadKey((key) => key + 1)}
              >
                Try again
              </Button>
              {courseOptions.withPlans[0] && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    setCourseCode(courseOptions.withPlans[0].code)
                    setSpecIndex(0)
                    setStructureId("")
                  }}
                >
                  Open {courseOptions.withPlans[0].code} instead
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {courseState === "loading" && (
        <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md">
          <CardContent className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading study plans for {courseCode}...
          </CardContent>
        </Card>
      )}

      {/* Course exists but has no readable structure */}
      {courseState === "ready" && course && !structure && (
        <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden">
          <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
            <CardTitle className="text-base text-[#003A6E] dark:text-blue-300">No study plan for this course yet</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-sm text-gray-600 dark:text-gray-400 dark:bg-gray-900 space-y-2">
            <p>
              We know {course.courseCode}, {course.courseTitle}, but QUT has not published a structure we could read for it.
            </p>
            {course.approvedMajors.length > 0 && (
              <p>
                It does list {course.approvedMajors.length} approved majors: {course.approvedMajors.slice(0, 6).join(", ")}
                {course.approvedMajors.length > 6 ? "…" : ""}.
              </p>
            )}
            <p>Pick another course above, or try again later once the structure scrape catches up.</p>
          </CardContent>
        </Card>
      )}

      {/* Plan */}
      {courseState === "ready" && structure && (
        <>
          <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden">
            <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-base text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                    {course?.courseTitle ?? courseCode}
                  </CardTitle>
                  <CardDescription className="dark:text-gray-400">
                    {activeSpec ? prettyName(activeSpec.name) : "Pathway"} · {structure.title}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToQutPlan}
                  disabled={!dirty}
                  className="rounded-lg border-[#003A6E]/30 dark:border-blue-900/50 text-[#003A6E] dark:text-blue-300 hover:bg-[#003A6E]/5 dark:hover:bg-blue-900/20 transition-all duration-200 shrink-0"
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Reset to QUT plan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4 dark:bg-gray-900 transition-colors duration-300">
              {/* One line by default: how big the plan is, and one way in to the knobs. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p data-testid="plan-summary" className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-[#003A6E] dark:text-blue-300">
                    {planSummary.credits} CP plan
                  </span>
                  {planSummary.pending > 0 && (
                    <span data-testid="pending-credits" className="text-gray-500 dark:text-gray-400">
                      {" · "}
                      {planSummary.pending} CP still to choose
                    </span>
                  )}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="tune-toggle"
                  aria-expanded={tuneOpen}
                  aria-controls="plan-tune-panel"
                  onClick={() => setTuneOpen((open) => !open)}
                  className="h-8 shrink-0 rounded-lg px-2.5 text-[#003A6E] hover:bg-[#003A6E]/5 dark:text-blue-300 dark:hover:bg-blue-900/20"
                >
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Tune
                </Button>
              </div>

              {reflowNotice && (
                <div
                  data-testid="reflow-notice"
                  aria-live="polite"
                  className="mt-2 flex items-center gap-1.5 text-xs text-[#003A6E] dark:text-blue-300"
                >
                  <Layers3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{reflowNotice}</span>
                </div>
              )}

              {tuneOpen && (
                <div
                  id="plan-tune-panel"
                  data-testid="tune-panel"
                  className="mt-3 space-y-3 rounded-lg border border-[#003A6E]/15 bg-[#003A6E]/[0.02] p-3 dark:border-blue-900/40 dark:bg-blue-900/10"
                >
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    {showSection && sectionTotals.length > 1 ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-500 dark:text-gray-400 text-xs">Per entry path</span>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          {sectionTotals.map(([name, totals]) => (
                            <span key={name} className="text-xs">
                              <span className="font-semibold text-[#003A6E] dark:text-blue-300">
                                {totals.units} units · {totals.credits} CP
                              </span>
                              {totals.pending > 0 && (
                                <span className="text-gray-500 dark:text-gray-400"> + {totals.pending} to choose</span>
                              )}
                              <span className="text-gray-500 dark:text-gray-400"> {name}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">Units </span>
                          <span className="font-semibold text-[#003A6E] dark:text-blue-300">{totalUnits}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">Credit points </span>
                          <span className="font-semibold text-[#003A6E] dark:text-blue-300">{totalCredits}</span>
                        </div>
                        {openSlots.length > 0 && (
                          <div data-testid="tune-pending-credits">
                            <span className="text-gray-500 dark:text-gray-400 text-xs">Still to choose </span>
                            <span className="font-semibold text-[#003A6E] dark:text-blue-300">{pendingCredits} CP</span>
                            <span className="text-gray-500 dark:text-gray-400 text-xs">
                              {" "}
                              across {openSlots.length} {openSlots.length === 1 ? "slot" : "slots"}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Semesters </span>
                      <span className="font-semibold text-[#003A6E] dark:text-blue-300">{plan.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5" data-testid="load-target-control">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Load target</span>
                      <LoadTargetSelect
                        testId="load-target-select"
                        ariaLabel="Credit points per semester load target"
                        title="Changing this moves the units that no longer fit into the next semester, starting from QUT's own plan"
                        value={String(loadTarget)}
                        onChange={(value) => {
                          const next = normaliseLoadTarget(value)
                          if (next !== null) applyLoadTarget(next)
                        }}
                      >
                        {(LOAD_TARGET_PRESETS.some((preset) => preset.value === loadTarget)
                          ? LOAD_TARGET_PRESETS
                          : [...LOAD_TARGET_PRESETS, { value: loadTarget, label: `${loadTarget} CP` }]
                        ).map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </LoadTargetSelect>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {savedAt ? "Saved in this browser" : "Not saved yet"}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#003A6E] dark:text-blue-400" />
                    <span>
                      Drag a unit to another semester, or up and down within one, to reorder. Click a unit to read its
                      synopsis and assessment. Dashed cards are choices QUT leaves open. Click one to pick a unit, and
                      Change on a filled one to swap it. Changing either target re-packs from QUT&rsquo;s plan, so drags
                      made by hand are dropped. Reset to QUT plan is the way back. A semester can be set above the plan
                      target if you want to take more units. Changes are kept on this device only.
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <PlanProblemStrip problems={planProblems} notice={fixNotice?.text ?? null} onFix={applyProblemFix} />

          {plan.length === 0 ? (
            <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md">
              <CardContent className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                This study plan has no semester columns we can show. Try another plan from the list above.
              </CardContent>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={() => {
                setActiveUid(null)
                setOverColumn(null)
              }}
            >
              <div
                className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x"
                data-testid="planner-board"
              >
                {plan.map((semester) => {
                  const override =
                    typeof loadOverrides[loadOverrideKey(semester.id)] === "number"
                      ? loadOverrides[loadOverrideKey(semester.id)]
                      : null
                  return (
                    <SemesterColumn
                      key={semester.id}
                      semester={semester}
                      slots={slotsBySemester.get(semester.id) ?? []}
                      showSection={showSection}
                      isActiveColumn={overColumn === semester.id}
                      isAnyDrag={activeUid !== null}
                      loadTarget={resolveLoadTarget(override, loadTarget)}
                      loadOverride={override}
                      onSetLoadOverride={setSemesterLoadOverride}
                      showTune={tuneOpen}
                      unitProblems={planProblems.byUid}
                      onOpenUnit={setDetailUnit}
                      onChooseSlot={(slot) => setOpenSlotId(slot.id)}
                      onChangeSlot={changeSlotUnit}
                      onClearSlot={clearSlotUnit}
                    />
                  )
                })}
              </div>

              <DragOverlay dropAnimation={null}>
                {activeUnit ? (
                  <div className="w-[232px] sm:w-[248px] rotate-1 scale-[1.02] rounded-lg border border-[#003A6E]/40 dark:border-blue-700 bg-white dark:bg-gray-800 px-2.5 py-2 shadow-xl cursor-grabbing">
                    <UnitCardBody unit={activeUnit} dragging />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      {openSlot && (
        <OptionSlotPicker
          slot={openSlot}
          semesterName={openSlotSemester?.name ?? "this semester"}
          usedCodes={usedCodes}
          selectedCode={openSlotChoice?.code ?? null}
          escapeDisabled={detailUnit !== null}
          prereqDoc={prereqDoc}
          onChoose={(candidate) => chooseSlotUnit(openSlot, candidate)}
          onInspect={inspectCandidate}
          onClose={() => setOpenSlotId(null)}
        />
      )}

      {detailUnit && (
        <PlanUnitPanel
          unit={detailUnit}
          campus={campusByCode.get(detailUnit.code) ?? null}
          onClose={() => setDetailUnit(null)}
        />
      )}

      <SectionNote>
        I open this before enrolment opens, mostly to answer one question: if I switch to this major, what
        does the rest of my degree actually look like? Dragging a unit forward a semester is usually enough
        to tell whether a minor fits or whether I would be doubling up on something heavy.
      </SectionNote>
    </div>
  )
}
