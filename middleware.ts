import { NextResponse, type NextRequest } from "next/server"
import { RATE_LIMIT_CONFIG } from "./lib/config"

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
      if (value.resetTime <= now) {
        rateLimitStore.delete(key)
      }
    }
  },
  5 * 60 * 1000,
) // Clean up every 5 minutes

function getRateLimitKey(request: NextRequest): string {
  // Use IP + User-Agent for rate limiting
  const ip = request.ip || request.headers.get("x-forwarded-for") || "unknown"
  const userAgent = request.headers.get("user-agent") || "unknown"
  return `${ip}:${userAgent.slice(0, 50)}` // Limit user agent length
}

async function checkRateLimit(key: string): Promise<{ allowed: boolean; count: number; resetTime: number }> {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs

  // Get current rate limit data
  let rateLimitData = rateLimitStore.get(key)

  // Reset if window has expired
  if (!rateLimitData || rateLimitData.resetTime <= now) {
    rateLimitData = {
      count: 0,
      resetTime: now + RATE_LIMIT_CONFIG.windowMs,
    }
  }

  // Check if request is allowed
  const allowed = rateLimitData.count < RATE_LIMIT_CONFIG.maxRequests

  if (allowed) {
    rateLimitData.count++
    rateLimitStore.set(key, rateLimitData)
  }

  return {
    allowed,
    count: rateLimitData.count,
    resetTime: rateLimitData.resetTime,
  }
}

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname

    // Skip middleware for static files and certain API routes
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api/og") ||
      pathname.startsWith("/api/health") ||
      pathname.includes(".") ||
      pathname === "/favicon.ico" ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml"
    ) {
      return NextResponse.next()
    }

    // Only apply rate limiting to specific API routes
    if (pathname.startsWith("/api/timetable") || pathname === "/api/check-rate-limit") {
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

        return response
      }

      // Increment rate limit counter ONLY for POST requests to /api/timetable/search
      // Don't increment for GET requests to /api/check-rate-limit
      if (request.method === "POST" && pathname === "/api/timetable/search") {
        rateLimit.count += 1
        rateLimitStore.set(key, rateLimit)
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
  } catch (error) {
    console.error("Middleware error:", error)
    // Return a simple response to avoid breaking the app
    return NextResponse.next()
  }
}

// Configure the middleware to run only on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
