import { NextResponse } from "next/server"
import { kv } from "@vercel/kv"

// Rate limiting constants
const MAX_REVIEWS_PER_DAY_PER_IP = 20
const MAX_REVIEWS_GLOBAL_PER_DAY = 500
const DAILY_WINDOW = 24 * 60 * 60 // 24 hours in seconds

export async function POST(request: Request) {
  try {
    // Get client IP from headers
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"

    // Get session ID (as a secondary identifier)
    const { key: sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session identifier" }, { status: 400 })
    }

    // Create composite keys for different rate limits
    const dailyKey = `review_rate:${ip}:daily`
    const globalKey = `review_rate:global:daily`

    // Get current counts from Redis using a single pipeline
    const pipeline = kv.pipeline()
    pipeline.get(dailyKey)
    pipeline.get(globalKey)

    const [dailyCount, globalCount] = (await pipeline.exec()) as (number | null)[]

    // Check if any rate limit is exceeded
    if ((dailyCount || 0) >= MAX_REVIEWS_PER_DAY_PER_IP) {
      return NextResponse.json({
        allowed: false,
        message: "Daily rate limit exceeded. Please try again tomorrow.",
        currentCount: dailyCount,
        maxAllowed: MAX_REVIEWS_PER_DAY_PER_IP,
        resetIn: DAILY_WINDOW,
      })
    }

    if ((globalCount || 0) >= MAX_REVIEWS_GLOBAL_PER_DAY) {
      return NextResponse.json({
        allowed: false,
        message: "System-wide rate limit exceeded. Please try again tomorrow.",
        currentCount: globalCount,
        maxAllowed: MAX_REVIEWS_GLOBAL_PER_DAY,
        resetIn: DAILY_WINDOW,
      })
    }

    // Increment all counters in a single pipeline
    const incPipeline = kv.pipeline()
    incPipeline.incr(dailyKey)
    incPipeline.incr(globalKey)

    // Set expiration for the keys
    incPipeline.expire(dailyKey, DAILY_WINDOW)
    incPipeline.expire(globalKey, DAILY_WINDOW)

    await incPipeline.exec()

    return NextResponse.json({
      allowed: true,
      currentCount: (dailyCount || 0) + 1,
      maxAllowed: MAX_REVIEWS_PER_DAY_PER_IP,
      remaining: MAX_REVIEWS_PER_DAY_PER_IP - ((dailyCount || 0) + 1),
    })
  } catch (error) {
    console.error("Rate limit check error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
