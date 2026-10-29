import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

// Serves one course's full pathway/structure tree. The 4 MB source file stays on
// the server; only the selected course is shipped to the browser.
export const dynamic = "force-dynamic"

const STRUCTURES_FILE = path.join(process.cwd(), "data", "course-structures.json")

interface StructuresFile {
  builtAt?: string
  courses?: Record<string, Record<string, unknown>>
}

interface FileCache {
  signature: string
  data: StructuresFile | null
}

let cache: FileCache | null = null

function signature(): string {
  try {
    const stat = fs.statSync(STRUCTURES_FILE)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return "missing"
  }
}

function load(): StructuresFile | null {
  const current = signature()
  if (cache && cache.signature === current) return cache.data

  try {
    const data = JSON.parse(fs.readFileSync(STRUCTURES_FILE, "utf8")) as StructuresFile
    cache = { signature: current, data }
    return data
  } catch (error) {
    console.error("[api/courses/[code]] failed to read course structures:", error)
    // Keep the last good copy rather than 500ing on a partial write.
    return cache?.data ?? null
  }
}

export async function GET(_request: Request, { params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code || "").trim().toUpperCase()

  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    return NextResponse.json(
      { error: "invalid_code", message: `"${params.code}" is not a valid QUT course code.` },
      { status: 400 },
    )
  }

  const data = load()
  if (!data) {
    return NextResponse.json(
      { error: "unavailable", message: "Course structure data could not be read right now." },
      { status: 500 },
    )
  }

  const course = data.courses?.[code]
  if (!course) {
    return NextResponse.json(
      {
        error: "not_found",
        message: `No study plan data has been collected for ${code} yet.`,
      },
      { status: 404 },
    )
  }

  return NextResponse.json(
    { ...course, courseCode: code, builtAt: data.builtAt ?? null },
    { headers: { "Cache-Control": "no-store" } },
  )
}
