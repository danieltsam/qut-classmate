import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

// The whole prerequisite catalogue (data/unit-prereqs.json, ~574 KB) in one go.
//
// The Course Planner needs every entry, not just the units in the current plan:
// `planIssues` derives QUT's equivalent-unit map from the entire index, and a
// plan can hold a unit from any faculty. A per-code endpoint would mean walking
// the board to build a request list, and the document is small enough that one
// fetch is the cheaper, simpler answer.
//
// Read with fs rather than imported, so the file never enters the client bundle
// and a refreshed data file is picked up without a rebuild.
export const dynamic = "force-dynamic"

const PREREQ_FILE = path.join(process.cwd(), "data", "unit-prereqs.json")

interface PrereqCache {
  /** "size:mtime" of the file the cached copy came from. */
  signature: string
  /** The file exactly as published — re-serving it avoids a parse/stringify round trip. */
  text: string
}

let cache: PrereqCache | null = null

function signature(): string {
  try {
    const stat = fs.statSync(PREREQ_FILE)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return "missing"
  }
}

/**
 * The file's bytes, or the last good copy when a write is caught mid-flight.
 * A scraper rewriting the JSON is not a reason to empty the planner's flags.
 */
function load(): string | null {
  const current = signature()
  if (cache && cache.signature === current) return cache.text

  try {
    const text = fs.readFileSync(PREREQ_FILE, "utf8")
    const parsed = JSON.parse(text) as { units?: Record<string, unknown> }
    if (!parsed || typeof parsed !== "object" || !parsed.units || typeof parsed.units !== "object") {
      throw new Error("unit-prereqs.json has no units map")
    }
    cache = { signature: current, text }
    return text
  } catch (error) {
    console.error("[api/unit-prereqs] could not read the prerequisite data:", error)
    // Keep serving the previous copy; the signature stays stale so the next
    // request retries the read.
    return cache ? cache.text : null
  }
}

export async function GET() {
  const text = load()

  if (!text) {
    return NextResponse.json(
      {
        error: "unavailable",
        message: "The prerequisite data has not been built yet. Run the unit metadata scrape and reload.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }

  // The planner fetches this once per mount; there is no reason to cache 574 KB
  // in a browser or CDN.
  return new NextResponse(text, {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
