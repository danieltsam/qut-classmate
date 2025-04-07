import { type NextRequest, NextResponse } from "next/server"

// Rate limiting constants
const DAILY_RATE_LIMIT = 15

export async function GET(req: NextRequest) {
  // Get rate limit info from headers (set by middleware)
  const rateLimit = req.headers.get("X-RateLimit-Limit") || DAILY_RATE_LIMIT.toString()
  const remaining = req.headers.get("X-RateLimit-Remaining") || "0"
  const reset = req.headers.get("X-RateLimit-Reset") || "0"

  const remainingRequests = Number.parseInt(remaining, 10)
  const rateLimitExceeded = remainingRequests <= 0

  return NextResponse.json({
    remainingRequests,
    rateLimitExceeded,
    resetTime: Number.parseInt(reset, 10),
    limit: Number.parseInt(rateLimit, 10),
  })
}

