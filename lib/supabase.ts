import { createClient } from "@supabase/supabase-js"

// Create a single supabase client for the browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Create a singleton instance of the Supabase client
let supabaseInstance: ReturnType<typeof createClient> | null = null

export const getSupabase = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseInstance
}

// Type for review data
export interface Review {
  id: string
  unit_code: string
  unit_name?: string
  reviewer_name: string | null
  rating: number
  ease_rating: number | null
  usefulness_rating: number | null
  thumbs_up: boolean | null
  review_text: string
  tutor_name: string | null
  tutor_rating: number | null
  tutor_comments: string | null
  created_at: string
  user_session_id?: string
  client_ip?: string
}

// Type for unit summary data
export interface UnitReviewSummary {
  unit_code: string
  total_reviews: number
  avg_rating: number
  avg_ease: number | null
  avg_usefulness: number | null
  thumbs_up_count: number
  thumbs_down_count: number
  thumbs_up_percentage: number | null
}

// Type for review rating summary
export interface ReviewRatingSummary {
  review_id: string
  total_ratings: number
  helpful_count: number
  unhelpful_count: number
  helpful_percentage: number | null
}

// Update the fetchReviews function to support sorting
export async function fetchReviews(
  unitCode: string,
  sortBy: "date" | "rating" | "ease" | "usefulness" = "date",
  sortOrder: "asc" | "desc" = "desc",
): Promise<Review[]> {
  // Use our secure API route instead of direct Supabase access
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "fetchReviews",
      data: { unitCode, sortBy, sortOrder },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to fetch reviews")
  }

  const { data } = await response.json()
  return data || []
}

// Function to fetch unit summary
export async function fetchUnitSummary(unitCode: string): Promise<UnitReviewSummary | null> {
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "fetchUnitSummary",
      data: { unitCode },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to fetch unit summary")
  }

  const { data } = await response.json()
  return data
}

// Function to fetch review rating summaries for multiple reviews
export async function fetchReviewRatings(reviewIds: string[]): Promise<Record<string, ReviewRatingSummary>> {
  if (!reviewIds.length) return {}

  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "fetchReviewRatings",
      data: { reviewIds },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to fetch review ratings")
  }

  const { data } = await response.json()
  return data || {}
}

// Function to fetch user's ratings for reviews
export async function fetchUserReviewRatings(reviewIds: string[]): Promise<Record<string, boolean | null>> {
  if (!reviewIds.length) return {}

  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "fetchUserReviewRatings",
      data: { reviewIds, sessionId: getSessionId() },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to fetch user review ratings")
  }

  const { data } = await response.json()
  return data || {}
}

// Function to submit a rating for a review
export async function submitReviewRating(reviewId: string, helpful: boolean | null): Promise<void> {
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "submitReviewRating",
      data: { reviewId, helpful, sessionId: getSessionId() },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to submit review rating")
  }
}

// Function to update a review
export async function updateReview(review: Partial<Review> & { id: string }): Promise<Review> {
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "updateReview",
      data: review,
      sessionId: getSessionId(),
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to update review")
  }

  const { data } = await response.json()
  return data
}

// Function to delete a review
export async function deleteReview(reviewId: string): Promise<void> {
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "deleteReview",
      data: { reviewId },
      sessionId: getSessionId(),
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to delete review")
  }
}

// Add this function to detect potential abuse patterns
function detectAbuse(review: any): boolean {
  // Check for extremely long content (potential spam)
  if (review.review_text && review.review_text.length > 10000) {
    return true
  }

  // Check for rapid submissions (if timestamp exists)
  const lastSubmission = localStorage.getItem("last_review_submission")
  if (lastSubmission) {
    const lastTime = Number.parseInt(lastSubmission, 10)
    const now = Date.now()

    // If less than 10 seconds between submissions, flag as potential abuse
    if (now - lastTime < 10000) {
      return true
    }
  }

  // Update last submission time
  localStorage.setItem("last_review_submission", Date.now().toString())

  return false
}

// Update the submitReview function to include abuse detection
export async function submitReview(
  review: Omit<Review, "id" | "created_at" | "client_ip" | "user_session_id">,
): Promise<Review> {
  // Check for abuse patterns
  if (detectAbuse(review)) {
    throw new Error("Submission blocked due to suspicious activity. Please try again later.")
  }

  // Get session ID for tracking
  const sessionId = getSessionId()

  // Add the user_session_id to the review
  const reviewWithSession = {
    ...review,
    user_session_id: sessionId,
  }

  // Use our secure API route instead of direct Supabase access
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "submitReview",
      data: reviewWithSession,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || "Failed to submit review")
  }

  const { data } = await response.json()
  return data
}

// Rate limiting using Redis/Upstash with IP-based protection
async function checkRateLimit(): Promise<boolean> {
  try {
    // Get session identifier
    const sessionId = getSessionId()

    // Use Redis to check and update rate limit
    const response = await fetch("/api/rate-limit-check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: sessionId }),
    })

    const result = await response.json()

    if (!result.allowed) {
      console.warn(`Rate limit exceeded: ${result.message}`)
    }

    return result.allowed
  } catch (error) {
    console.error("Rate limiting error:", error)
    // If there's an error with rate limiting, we'll allow the submission
    // but log the error
    return true
  }
}

// Get a session ID for rate limiting with IP fingerprinting
export function getSessionId(): string {
  // Try to get an existing session ID from localStorage
  let sessionId = localStorage.getItem("review_session_id")

  if (!sessionId) {
    // Generate a new session ID
    sessionId = crypto.randomUUID()
    localStorage.setItem("review_session_id", sessionId)
  }

  // We'll add a timestamp to the session ID to help identify when it was created
  // This helps with debugging and analytics without adding cost
  const timestamp = Date.now()
  localStorage.setItem("review_session_timestamp", timestamp.toString())

  return sessionId
}
