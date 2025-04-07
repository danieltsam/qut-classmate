import { Redis } from "@upstash/redis"

// Create a Redis client using environment variables
// Check for multiple possible environment variable names
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.REDIS_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
})

export default redis

