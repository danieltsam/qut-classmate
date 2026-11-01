import { NextResponse } from "next/server"
import { clearCachePattern, isCacheEnabled } from "@/lib/kv-cache"

/**
 * Admin endpoint to clear cached timetable data.
 *
 * This used to run its own @upstash/redis client (lib/redis.ts + lib/redis-cache.ts)
 * while the timetable route used @vercel/kv — two clients, two key schemes, and the
 * admin clear could not actually clear what the route had written. Both now share
 * lib/kv-cache.ts.
 */
export async function POST(request: Request) {
  try {
    const { authorization } = Object.fromEntries(request.headers)

    if (process.env.ADMIN_API_KEY && authorization !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isCacheEnabled()) {
      return NextResponse.json({
        success: true,
        cached: false,
        message: "No server-side cache is configured (KV_REST_API_URL / KV_REST_API_TOKEN unset).",
      })
    }

    const { unitCode, teachingPeriodId, all } = await request.json()

    if (all) {
      const count = await clearCachePattern("*")
      return NextResponse.json({ success: true, message: `Cleared all cache entries (${count})` })
    }

    if (unitCode && teachingPeriodId) {
      await clearCachePattern(`timetable:${unitCode}:${teachingPeriodId}`)
      return NextResponse.json({ success: true, message: `Cleared cache for ${unitCode} (${teachingPeriodId})` })
    }

    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  } catch (error) {
    console.error("Error clearing cache:", error)
    return NextResponse.json({ error: "Failed to clear cache" }, { status: 500 })
  }
}
