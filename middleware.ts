import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { cookies } from "next/headers"

// Rate limiting constants
const DAILY_RATE_LIMIT = 15
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

// In-memory store for rate limits (in a production app, this would be Redis or a database)
// This is a global variable that persists between requests but will reset when the server restarts
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Clean up expired rate limits periodically
setInterval(
  () => {
    const now = Date.now()
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  },
  60 * 60 * 1000,
) // Clean up every hour

export async function middleware(request: NextRequest) {
  // Only apply rate limiting to API routes that fetch timetable data
  if (request.nextUrl.pathname.startsWith("/api/timetable") || request.nextUrl.pathname === "/api/check-rate-limit") {
    // Get IP address
    const ip = request.ip || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"

    // Get user agent
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Create a composite key that includes IP and a portion of the user agent
    // This helps identify different devices from the same IP
    const userAgentHash = userAgent.slice(0, 50)
    const key = `${ip}-${userAgentHash}`

    // Get current time
    const now = Date.now()

    // Get or create rate limit entry
    let rateLimit = rateLimitStore.get(key)

    if (!rateLimit || now > rateLimit.resetTime) {
      // Create new rate limit if none exists or if it has expired
      rateLimit = {
        count: 0,
        resetTime: now + RATE_LIMIT_WINDOW,
      }
    }

    // Check if rate limit is exceeded
    if (rateLimit.count >= DAILY_RATE_LIMIT) {
      // Set rate limit headers
      const response = NextResponse.json(
        {
          error: true,
          message: "Rate limit exceeded",
          rateLimitExceeded: true,
          remainingRequests: 0,
        },
        { status: 429 },
      )

      response.headers.set("X-RateLimit-Limit", DAILY_RATE_LIMIT.toString())
      response.headers.set("X-RateLimit-Remaining", "0")
      response.headers.set("X-RateLimit-Reset", rateLimit.resetTime.toString())

      // Also set a cookie for client-side awareness
      const cookieStore = cookies()
      cookieStore.set(
        "timetable-rate-limit",
        JSON.stringify({
          count: DAILY_RATE_LIMIT,
          resetTime: rateLimit.resetTime,
          resetDate: new Date(rateLimit.resetTime).toDateString(),
        }),
        {
          maxAge: RATE_LIMIT_WINDOW / 1000,
          path: "/",
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
        },
      )

      return response
    }

    // Increment rate limit counter ONLY for POST requests to /api/timetable/search
    // Don't increment for GET requests to /api/check-rate-limit
    if (request.method === "POST" && request.nextUrl.pathname === "/api/timetable/search") {
      rateLimit.count += 1
      rateLimitStore.set(key, rateLimit)

      // Update the cookie
      const cookieStore = cookies()
      cookieStore.set(
        "timetable-rate-limit",
        JSON.stringify({
          count: rateLimit.count,
          resetTime: rateLimit.resetTime,
          resetDate: new Date(rateLimit.resetTime).toDateString(),
        }),
        {
          maxAge: RATE_LIMIT_WINDOW / 1000,
          path: "/",
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
        },
      )
    }

    // Add rate limit headers to the response
    const response = NextResponse.next()
    response.headers.set("X-RateLimit-Limit", DAILY_RATE_LIMIT.toString())
    response.headers.set("X-RateLimit-Remaining", (DAILY_RATE_LIMIT - rateLimit.count).toString())
    response.headers.set("X-RateLimit-Reset", rateLimit.resetTime.toString())

    return response
  }

  // For non-API routes, just continue
  return NextResponse.next()
}

// Configure the middleware to run only on specific paths
export const config = {
  matcher: ["/api/timetable/:path*", "/api/check-rate-limit"],
}

