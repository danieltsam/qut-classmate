import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Get rate limit headers from middleware
    const limit = request.headers.get("X-RateLimit-Limit") || "15"
    const remaining = request.headers.get("X-RateLimit-Remaining") || "15"
    const reset = request.headers.get("X-RateLimit-Reset") || "0"

    return NextResponse.json({
      limit: Number.parseInt(limit),
      remaining: Number.parseInt(remaining),
      reset: Number.parseInt(reset),
      resetTime: new Date(Number.parseInt(reset) * 1000).toISOString(),
    })
  } catch (error) {
    console.error("Rate limit check error:", error)
    return NextResponse.json({ error: "Failed to check rate limit" }, { status: 500 })
  }
}
