import { kv } from "@vercel/kv"

// Cache duration (30 days in seconds)
const CACHE_DURATION = 30 * 24 * 60 * 60

// Cache prefix to organize keys
const CACHE_PREFIX = "timetable:"

/**
 * Get timetable data from KV cache
 */
export async function getTimetableFromCache(unitCode: string, teachingPeriodId: string) {
  try {
    const cacheKey = `${CACHE_PREFIX}${unitCode}:${teachingPeriodId}`
    const cachedData = await kv.get(cacheKey)

    if (cachedData) {
      console.log(`🔄 Server cache hit for ${unitCode} (teaching period: ${teachingPeriodId})`)
      return cachedData
    }

    console.log(`❌ No server cache found for ${unitCode} (teaching period: ${teachingPeriodId})`)
    return null
  } catch (error) {
    console.error("Error accessing KV cache:", error)
    return null
  }
}

/**
 * Store timetable data in KV cache
 */
export async function storeTimetableInCache(unitCode: string, teachingPeriodId: string, data: any) {
  try {
    const cacheKey = `${CACHE_PREFIX}${unitCode}:${teachingPeriodId}`

    // Store with expiration (30 days)
    await kv.set(cacheKey, data, { ex: CACHE_DURATION })

    console.log(`💾 Saved ${unitCode} to server cache (expires in 30 days)`)
    return true
  } catch (error) {
    console.error("Error storing in KV cache:", error)
    return false
  }
}
