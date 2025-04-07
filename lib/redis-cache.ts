import redis from "./redis"
import type { TimetableEntry } from "./types"

// Cache duration (30 days in seconds)
const CACHE_DURATION = 30 * 24 * 60 * 60

// Cache prefix to organize keys
const CACHE_PREFIX = "timetable:"

/**
 * Get timetable data from Redis cache
 */
export async function getTimetableFromCache(
  unitCode: string,
  teachingPeriodId: string,
): Promise<TimetableEntry[] | null> {
  try {
    const cacheKey = `${CACHE_PREFIX}${unitCode}:${teachingPeriodId}`
    const cachedData = await redis.get(cacheKey)

    if (cachedData) {
      console.log(
        `%c🔄 SERVER CACHE HIT: Loading ${unitCode} from Redis (teaching period: ${teachingPeriodId})`,
        "background: #4caf50; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
      )
      return cachedData as TimetableEntry[]
    }

    console.log(
      `%c❌ SERVER CACHE MISS: No Redis cache found for ${unitCode} (teaching period: ${teachingPeriodId})`,
      "background: #f44336; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
    )
    return null
  } catch (error) {
    console.error("Error accessing Redis cache:", error)
    return null
  }
}

/**
 * Store timetable data in Redis cache
 */
export async function storeTimetableInCache(
  unitCode: string,
  teachingPeriodId: string,
  data: TimetableEntry[],
): Promise<boolean> {
  try {
    const cacheKey = `${CACHE_PREFIX}${unitCode}:${teachingPeriodId}`

    // Store with expiration (30 days)
    await redis.set(cacheKey, data, { ex: CACHE_DURATION })

    console.log(
      `%c💾 SERVER CACHE UPDATED: Saved ${unitCode} to Redis (expires in 30 days)`,
      "background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
    )
    return true
  } catch (error) {
    console.error("Error storing in Redis cache:", error)
    return false
  }
}

/**
 * Clear specific cache entry
 */
export async function clearCacheEntry(unitCode: string, teachingPeriodId: string): Promise<boolean> {
  try {
    const cacheKey = `${CACHE_PREFIX}${unitCode}:${teachingPeriodId}`
    await redis.del(cacheKey)
    return true
  } catch (error) {
    console.error("Error clearing cache entry:", error)
    return false
  }
}

/**
 * Clear all cache entries
 */
export async function clearAllCache(): Promise<number> {
  try {
    // Get all keys with our prefix
    const keys = await redis.keys(`${CACHE_PREFIX}*`)

    if (keys.length === 0) {
      return 0
    }

    // Delete all keys
    await Promise.all(keys.map((key) => redis.del(key)))
    return keys.length
  } catch (error) {
    console.error("Error clearing all cache:", error)
    return 0
  }
}

