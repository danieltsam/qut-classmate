import { kv } from "@vercel/kv"
import { CACHE_CONFIG } from "./config"

/**
 * KV is optional. When the env vars are absent (local dev, preview deploys, any
 * deploy without an Upstash instance) every call used to reach @vercel/kv, throw
 * "Missing required environment variables", get caught, and be logged — on every
 * single request, twice. The API still worked, but the logs were noise and each
 * request paid for two pointless async round trips.
 *
 * Checking first makes the unconfigured case a no-op, which is what it should be.
 */
const KV_ENABLED = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

let announced = false

function kvAvailable(): boolean {
  if (KV_ENABLED) return true
  if (!announced) {
    announced = true
    console.info(
      "[cache] KV disabled — KV_REST_API_URL / KV_REST_API_TOKEN are not set. " +
        "Every timetable request will go to QUT directly.",
    )
  }
  return false
}

/** True when a server-side cache is actually in use. Used by the health/summary paths. */
export function isCacheEnabled(): boolean {
  return KV_ENABLED
}

// Generic cache functions
export async function getFromCache<T>(key: string): Promise<T | null> {
  if (!kvAvailable()) return null
  try {
    const fullKey = `${CACHE_CONFIG.keyPrefix}${key}`
    const data = await kv.get<T>(fullKey)
    return data
  } catch (error) {
    console.error("Cache get error:", error)
    return null
  }
}

export async function setCache<T>(key: string, value: T, ttl: number = CACHE_CONFIG.defaultTTL): Promise<void> {
  if (!kvAvailable()) return
  try {
    const fullKey = `${CACHE_CONFIG.keyPrefix}${key}`
    await kv.setex(fullKey, ttl, JSON.stringify(value))
  } catch (error) {
    console.error("Cache set error:", error)
    // Don't throw - caching is not critical
  }
}

export async function deleteFromCache(key: string): Promise<void> {
  if (!kvAvailable()) return
  try {
    const fullKey = `${CACHE_CONFIG.keyPrefix}${key}`
    await kv.del(fullKey)
  } catch (error) {
    console.error("Cache delete error:", error)
  }
}

export async function clearCachePattern(pattern: string): Promise<number> {
  if (!kvAvailable()) return 0
  try {
    const fullPattern = `${CACHE_CONFIG.keyPrefix}${pattern}`
    const keys = await kv.keys(fullPattern)
    if (keys.length > 0) {
      await kv.del(...keys)
    }
    return keys.length
  } catch (error) {
    console.error("Cache clear pattern error:", error)
    return 0
  }
}

// Specific cache functions for timetable data
export async function getTimetableFromCache(unitCode: string, teachingPeriodId: string) {
  const key = `timetable:${unitCode}:${teachingPeriodId}`
  return getFromCache(key)
}

export async function storeTimetableInCache(unitCode: string, teachingPeriodId: string, data: any) {
  const key = `timetable:${unitCode}:${teachingPeriodId}`
  return setCache(key, data, CACHE_CONFIG.timetableTTL)
}

// Rate limiting cache functions
export async function getRateLimitFromCache(identifier: string) {
  const key = `rate_limit:${identifier}`
  return getFromCache<{ count: number; resetTime: number }>(key)
}

export async function setRateLimitInCache(identifier: string, count: number, resetTime: number) {
  const key = `rate_limit:${identifier}`
  const ttl = Math.ceil((resetTime - Date.now()) / 1000)
  return setCache(key, { count, resetTime }, ttl)
}
