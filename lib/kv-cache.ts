import { kv } from "@vercel/kv"
import { CACHE_CONFIG } from "./config"

// Generic cache functions
export async function getFromCache<T>(key: string): Promise<T | null> {
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
  try {
    const fullKey = `${CACHE_CONFIG.keyPrefix}${key}`
    await kv.setex(fullKey, ttl, JSON.stringify(value))
  } catch (error) {
    console.error("Cache set error:", error)
    // Don't throw - caching is not critical
  }
}

export async function deleteFromCache(key: string): Promise<void> {
  try {
    const fullKey = `${CACHE_CONFIG.keyPrefix}${key}`
    await kv.del(fullKey)
  } catch (error) {
    console.error("Cache delete error:", error)
  }
}

export async function clearCachePattern(pattern: string): Promise<number> {
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
