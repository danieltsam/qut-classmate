import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

// The structure file is several megabytes. It must never reach the client bundle,
// so it is read here, parsed once per file change, and only a light summary is served.
export const dynamic = "force-dynamic"

const STRUCTURES_FILE = path.join(process.cwd(), "data", "course-structures.json")
const ACTIVE_COURSES_FILE = path.join(process.cwd(), "data", "qut-active-courses.json")

interface RawStructure {
  id?: string
  title?: string
  semesters?: unknown[]
}

interface RawSpecialization {
  name?: string
  structures?: RawStructure[]
}

interface RawCourse {
  courseCode?: string
  courseTitle?: string
  creditPoints?: number | null
  aqfLevel?: string
  approvedMajors?: string[]
  specializations?: RawSpecialization[]
}

interface StructuresFile {
  builtAt?: string
  courseCount?: number
  courses?: Record<string, RawCourse>
}

interface CourseSummary {
  code: string
  title: string
  creditPoints: number | null
  aqfLevel: string | null
  /** Number of specializations (pathways) with structure data. */
  pathways: number
  /** Number of study plans across all pathways. */
  plans: number
  hasStructure: boolean
}

interface CourseListCache {
  signature: string
  builtAt: string | null
  payload: { builtAt: string | null; courses: CourseSummary[] }
}

let cache: CourseListCache | null = null

function fileSignature(): string {
  const parts = [STRUCTURES_FILE, ACTIVE_COURSES_FILE].map((file) => {
    try {
      const stat = fs.statSync(file)
      return `${stat.size}:${stat.mtimeMs}`
    } catch {
      return "missing"
    }
  })
  return parts.join("|")
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T
  } catch {
    return null
  }
}

function buildPayload() {
  const structures = readJson<StructuresFile>(STRUCTURES_FILE)
  const active = readJson<{ courses?: Array<{ code?: string; title?: string; creditPoints?: number | null; aqfLevel?: string }> }>(
    ACTIVE_COURSES_FILE,
  )

  const courses: CourseSummary[] = []
  const seen = new Set<string>()

  if (structures?.courses) {
    for (const [key, course] of Object.entries(structures.courses)) {
      const code = (course.courseCode || key || "").toUpperCase()
      if (!code) continue
      const specializations = Array.isArray(course.specializations) ? course.specializations : []
      const plans = specializations.reduce(
        (total, spec) => total + (Array.isArray(spec.structures) ? spec.structures.length : 0),
        0,
      )
      courses.push({
        code,
        title: course.courseTitle || code,
        creditPoints: typeof course.creditPoints === "number" ? course.creditPoints : null,
        aqfLevel: course.aqfLevel ?? null,
        pathways: specializations.length,
        plans,
        hasStructure: plans > 0,
      })
      seen.add(code)
    }
  }

  // Everything else in the active catalogue is still browsable — it just has no
  // scraped study plan yet, and the planner shows an empty state for it.
  if (Array.isArray(active?.courses)) {
    for (const course of active.courses) {
      const code = (course?.code || "").toUpperCase()
      if (!code || seen.has(code)) continue
      seen.add(code)
      courses.push({
        code,
        title: course.title || code,
        creditPoints: typeof course.creditPoints === "number" ? course.creditPoints : null,
        aqfLevel: course.aqfLevel ?? null,
        pathways: 0,
        plans: 0,
        hasStructure: false,
      })
    }
  }

  courses.sort((a, b) => {
    if (a.hasStructure !== b.hasStructure) return a.hasStructure ? -1 : 1
    return a.code.localeCompare(b.code)
  })

  return { builtAt: structures?.builtAt ?? null, courses }
}

export async function GET() {
  const signature = fileSignature()

  if (!cache || cache.signature !== signature) {
    try {
      const payload = buildPayload()
      cache = { signature, builtAt: payload.builtAt, payload }
    } catch (error) {
      // A half-written file (another process rebuilding the scrape) must not take
      // the endpoint down while a previous good copy is still in memory.
      if (!cache) {
        console.error("[api/courses] failed to read course structures:", error)
        return NextResponse.json(
          { error: "unavailable", message: "Course structure data could not be read right now." },
          { status: 500 },
        )
      }
    }
  }

  return NextResponse.json(cache.payload.courses, {
    headers: { "Cache-Control": "no-store" },
  })
}
