import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Headers are only present when the middleware limiter is enabled
    // (RATE_LIMIT_ENABLED=true). Without them there is no window to report —
    // returning epoch zero made the UI show a 1970 reset date.
    const limit = request.headers.get("X-RateLimit-Limit")
    const remaining = request.headers.get("X-RateLimit-Remaining")
    const reset = request.headers.get("X-RateLimit-Reset")

    if (!limit || !remaining) {
      return NextResponse.json({ unlimited: true, limit: null, remaining: null, resetTime: null })
    }

    const resetSeconds = Number.parseInt(reset ?? "0", 10)

    return NextResponse.json({
      unlimited: false,
      limit: Number.parseInt(limit, 10),
      remaining: Number.parseInt(remaining, 10),
      reset: resetSeconds,
      resetTime: resetSeconds > 0 ? new Date(resetSeconds * 1000).toISOString() : null,
    })
  } catch (error) {
    console.error("Rate limit check error:", error)
    return NextResponse.json({ error: "Failed to check rate limit" }, { status: 500 })
  }
}
