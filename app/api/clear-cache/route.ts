import { NextResponse } from "next/server"
import { clearCacheEntry, clearAllCache } from "@/lib/redis-cache"

// Admin endpoint to clear cache if needed
export async function POST(request: Request) {
  try {
    const { authorization } = Object.fromEntries(request.headers)
    const { unitCode, teachingPeriodId, all } = await request.json()

    // Basic auth check - in production, use a more secure method
    if (process.env.ADMIN_API_KEY && authorization !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (all) {
      // Clear all timetable cache
      const count = await clearAllCache()
      return NextResponse.json({ success: true, message: `Cleared all cache entries (${count})` })
    } else if (unitCode && teachingPeriodId) {
      // Clear specific unit cache
      await clearCacheEntry(unitCode, teachingPeriodId)
      return NextResponse.json({ success: true, message: `Cleared cache for ${unitCode} (${teachingPeriodId})` })
    } else {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error clearing cache:", error)
    return NextResponse.json({ error: "Failed to clear cache" }, { status: 500 })
  }
}
