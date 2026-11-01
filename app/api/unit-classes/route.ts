import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

// The whole class snapshot (data/qut-unit-classes.json, ~830 KB) in one go.
//
// Campus Explorer filters by day, hour, campus, faculty and class type across
// every unit QUT offers, so it needs the full document rather than one unit at a
// time. The file used to be imported straight into the client component, which
// put 830 KB into the first-load bundle; reading it here keeps it out of the
// browser and lets a refreshed scrape be picked up without a rebuild.
export const dynamic = "force-dynamic"

const CLASSES_FILE = path.join(process.cwd(), "data", "qut-unit-classes.json")

interface ClassesCache {
  /** "size:mtime" of the file the cached copy came from. */
  signature: string
  /** The file exactly as published — re-serving it avoids a parse/stringify round trip. */
  text: string
}

let cache: ClassesCache | null = null

function signature(): string {
  try {
    const stat = fs.statSync(CLASSES_FILE)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return "missing"
  }
}

/**
 * The file's bytes, or the last good copy when a write is caught mid-flight.
 * The class scraper rewrites this JSON in place and writes incrementally, so a
 * half-written file is a normal thing to hit rather than a real failure.
 */
function load(): string | null {
  const current = signature()
  if (cache && cache.signature === current) return cache.text

  try {
    const text = fs.readFileSync(CLASSES_FILE, "utf8")
    const parsed = JSON.parse(text) as { data?: Record<string, unknown> }
    if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
      throw new Error("qut-unit-classes.json has no data map")
    }
    cache = { signature: current, text }
    return text
  } catch (error) {
    console.error("[api/unit-classes] could not read the class snapshot:", error)
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
        message: "The class snapshot has not been built yet. Run the class scrape and reload.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }

  // Campus Explorer fetches this once per mount; there is no reason to cache
  // 830 KB in a browser or CDN while the scrape is still moving.
  return new NextResponse(text, {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
