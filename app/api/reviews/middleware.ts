import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { kv } from "@vercel/kv"

// Rate limiting constants
const MAX_REVIEWS_PER_DAY_PER_IP = 20
const DAILY_WINDOW = 24 * 60 * 60 // 24 hours in seconds

export async function middleware(request: NextRequest) {
  // Only apply to POST requests to /api/reviews endpoints
  if (request.method === "POST" && request.nextUrl.pathname.startsWith("/api/reviews")) {
    // Get client IP
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"

    // Create key for IP-based rate limiting
    const dailyKey = `review_rate:${ip}:daily`

    // Get current count
    const count = (await kv.get(dailyKey)) as number | null

    // Check if rate limit is exceeded
    if ((count || 0) >= MAX_REVIEWS_PER_DAY_PER_IP) {
      return NextResponse.json(
        {
          error: true,
          message: "Daily rate limit exceeded. Please try again tomorrow.",
          rateLimitExceeded: true,
        },
        { status: 429 },
      )
    }

    // Continue with the request
    return NextResponse.next()
  }

  // For non-review routes, just continue
  return NextResponse.next()
}

export const config = {
  matcher: ["/api/reviews/:path*"],
}
