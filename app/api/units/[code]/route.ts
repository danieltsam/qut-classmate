import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

// One unit's outline (title, synopsis, assessment breakdown) on demand.
//
// data/unit-meta.json is 1.3 MB. Importing it from a client component would put
// the whole bundle in the browser, so the file is read here, parsed once per
// file change, and only the requested unit is served.
export const dynamic = "force-dynamic"

const META_FILE = path.join(process.cwd(), "data", "unit-meta.json")

interface UnitMetaItem {
  name?: string
  description?: string | null
  weight?: number | null
  individualGroup?: string | null
  dueDate?: string | null
}

interface UnitMetaEntry {
  title?: string
  synopsis?: string | null
  hasExam?: boolean
  assessmentCount?: number
  items?: UnitMetaItem[]
}

interface MetaFile {
  builtAt?: string
  units?: Record<string, UnitMetaEntry>
}

interface MetaCache {
  signature: string
  data: MetaFile | null
}

let cache: MetaCache | null = null

function signature(): string {
  try {
    const stat = fs.statSync(META_FILE)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return "missing"
  }
}

function load(): MetaFile | null {
  const current = signature()
  if (cache && cache.signature === current) return cache.data

  try {
    const data = JSON.parse(fs.readFileSync(META_FILE, "utf8")) as MetaFile
    cache = { signature: current, data }
    return data
  } catch (error) {
    console.error("[api/units/[code]] failed to read unit metadata:", error)
    // A half-written file (the scraper rebuilds it in place) must not 500 the
    // endpoint while the previous good copy is still in memory.
    return cache?.data ?? null
  }
}

export async function GET(_request: Request, { params }: { params: { code: string } }) {
  const raw = decodeURIComponent(params.code || "").trim()
  const code = raw.toUpperCase()

  if (!/^[A-Z]{3}[0-9]{3}$/.test(code)) {
    return NextResponse.json(
      { error: "invalid_code", message: `"${raw}" is not a valid QUT unit code.` },
      { status: 400 },
    )
  }

  const data = load()
  if (!data) {
    return NextResponse.json(
      { error: "unavailable", message: "Unit outline data could not be read right now." },
      { status: 500 },
    )
  }

  const entry = data.units?.[code] ?? data.units?.[raw]
  if (!entry) {
    return NextResponse.json(
      {
        error: "not_found",
        message: `No outline has been collected for ${code}.`,
      },
      { status: 404 },
    )
  }

  return NextResponse.json(
    {
      code,
      title: entry.title ?? null,
      synopsis: entry.synopsis ?? null,
      hasExam: entry.hasExam === true,
      assessmentCount: typeof entry.assessmentCount === "number" ? entry.assessmentCount : entry.items?.length ?? 0,
      items: Array.isArray(entry.items) ? entry.items : [],
      builtAt: data.builtAt ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
