// Constants
const MAX_STORAGE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
const CACHE_PREFIX = "timetable-"
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds

/**
 * Calculates the approximate size of a string in bytes
 */
function getStringSize(str: string): number {
  // In JavaScript, each character is 2 bytes (UTF-16)
  return str.length * 2
}

/**
 * Gets the current localStorage usage in bytes
 */
export function getLocalStorageSize(): number {
  let totalSize = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      const value = localStorage.getItem(key) || ""
      totalSize += getStringSize(key) + getStringSize(value)
    }
  }
  return totalSize
}

/**
 * Formats bytes into a human-readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

/**
 * Clears the oldest 50% of cached timetable entries
 */
export function clearOldestCacheEntries(): void {
  // Get all timetable cache keys
  const cacheKeys: Array<{ key: string; timestamp: number }> = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(CACHE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || "{}")
        cacheKeys.push({
          key,
          timestamp: data.timestamp || 0,
        })
      } catch (error) {
        console.error(`Error parsing cache entry ${key}:`, error)
        // If we can't parse it, consider it old
        cacheKeys.push({ key, timestamp: 0 })
      }
    }
  }

  // Sort by timestamp (oldest first)
  cacheKeys.sort((a, b) => a.timestamp - b.timestamp)

  // Remove the oldest 50%
  const entriesToRemove = Math.ceil(cacheKeys.length / 2)
  console.log(`🧹 Clearing ${entriesToRemove} oldest cache entries to free up space`)

  for (let i = 0; i < entriesToRemove; i++) {
    localStorage.removeItem(cacheKeys[i].key)
    console.log(`🗑️ Removed cache entry: ${cacheKeys[i].key}`)
  }
}

/**
 * Safely stores data in localStorage, managing storage limits
 */
export function safelyStoreInCache(key: string, data: any): void {
  try {
    const serializedData = JSON.stringify(data)
    const dataSize = getStringSize(key) + getStringSize(serializedData)

    // Check if we're approaching the storage limit
    const currentSize = getLocalStorageSize()
    console.log(`📊 Current localStorage usage: ${formatBytes(currentSize)} / ${formatBytes(MAX_STORAGE_SIZE)}`)

    if (currentSize + dataSize > MAX_STORAGE_SIZE * 0.9) {
      // 90% of max
      console.warn(`⚠️ localStorage is getting full (${formatBytes(currentSize)}), clearing oldest entries`)
      clearOldestCacheEntries()
    }

    // Try to store the data
    localStorage.setItem(key, serializedData)
    console.log(`💾 Saved to cache with key: ${key} (${formatBytes(dataSize)})`)
  } catch (error) {
    console.error("Error saving to localStorage:", error)

    // If we get a quota error, clear some space and try again
    if (
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      console.warn("🚨 Storage quota exceeded, clearing oldest entries and trying again")
      clearOldestCacheEntries()

      try {
        localStorage.setItem(key, JSON.stringify(data))
        console.log(`💾 Successfully saved to cache after clearing space: ${key}`)
      } catch (retryError) {
        console.error("Failed to save to cache even after clearing space:", retryError)
      }
    }
  }
}

/**
 * Checks if data exists in cache and is still valid
 */
export function checkCache(unitCode: string, teachingPeriodId: string): any | null {
  const cacheKey = `${CACHE_PREFIX}${unitCode}-${teachingPeriodId}`
  console.log(`🔍 Checking cache for key: ${cacheKey}`)

  const cachedData = localStorage.getItem(cacheKey)
  if (cachedData) {
    try {
      const parsedData = JSON.parse(cachedData)
      // Only use cached data if it's less than 30 days old
      const cacheTime = parsedData.timestamp || 0
      const now = Date.now()
      const cacheAge = now - cacheTime

      if (cacheAge < CACHE_DURATION_MS) {
        console.log(
          `%c🔄 CLIENT CACHE HIT: Loading ${unitCode} from localStorage (age: ${Math.round(cacheAge / (60 * 60 * 1000))} hours)`,
          "background: #ffeb3b; color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
        )
        return parsedData.data
      } else {
        console.log(
          `%c⏰ CLIENT CACHE EXPIRED: Cache for ${unitCode} is older than 30 days`,
          "background: #ff9800; color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
        )
      }
    } catch (error) {
      console.error("Error parsing cached data:", error)
    }
  } else {
    console.log(
      `%c❌ CLIENT CACHE MISS: No localStorage cache found for ${unitCode}`,
      "background: #f44336; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
    )
  }

  return null
}

