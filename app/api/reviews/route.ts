import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Server-side Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Rate limiting constants
const MAX_REVIEWS_PER_DAY_PER_IP = 20
const DAILY_WINDOW = 24 * 60 * 60 // 24 hours in seconds

// Simple profanity filter
function containsProfanity(text: string): boolean {
  if (!text) return false

  const profanityList = [
    "badword1",
    "badword2",
    "offensive",
    "inappropriate",
    // Add more words as needed
  ]

  const lowerText = text.toLowerCase()
  return profanityList.some((word) => lowerText.includes(word))
}

// Get client IP address
function getClientIP(request: NextRequest): string {
  return request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || request.ip || "unknown"
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, data, sessionId } = body

    switch (action) {
      case "submitReview": {
        // Check for profanity
        const hasProfanity =
          containsProfanity(data.review_text) || (data.tutor_comments ? containsProfanity(data.tutor_comments) : false)

        if (hasProfanity) {
          return NextResponse.json(
            { error: "Review contains inappropriate language. Please revise and try again." },
            { status: 400 },
          )
        }

        // Insert review
        const { data: review, error } = await supabase.from("reviews").insert([data]).select().single()

        if (error) {
          console.error("Error submitting review:", error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ data: review })
      }

      case "fetchReviews": {
        const { unitCode, sortBy = "date", sortOrder = "desc" } = data

        const sortColumnMap = {
          date: "created_at",
          rating: "rating",
          ease: "ease_rating",
          usefulness: "usefulness_rating",
        }

        const sortColumn = sortColumnMap[sortBy as keyof typeof sortColumnMap]

        const { data: reviews, error } = await supabase
          .from("reviews")
          .select("*")
          .eq("unit_code", unitCode.toUpperCase())
          .order(sortColumn, { ascending: sortOrder === "asc" })

        if (error) {
          console.error("Error fetching reviews:", error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ data: reviews })
      }

      case "fetchUnitSummary": {
        const { unitCode } = data

        const { data: summary, error } = await supabase
          .from("unit_review_summary")
          .select("*")
          .eq("unit_code", unitCode.toUpperCase())
          .single()

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching unit summary:", error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ data: summary })
      }

      case "fetchReviewRatings": {
        const { reviewIds } = data

        if (!reviewIds.length) {
          return NextResponse.json({ data: {} })
        }

        const { data: ratings, error } = await supabase
          .from("review_ratings")
          .select("review_id, helpful")
          .in("review_id", reviewIds)

        if (error) {
          console.warn("review_ratings table may not exist:", error.message)
          return NextResponse.json({ data: {} })
        }

        // Group ratings by review_id and calculate summaries
        const result: Record<string, any> = {}
        reviewIds.forEach((reviewId: string) => {
          const reviewRatings = ratings?.filter((rating) => rating.review_id === reviewId) || []
          const helpfulCount = reviewRatings.filter((rating) => rating.helpful === true).length
          const unhelpfulCount = reviewRatings.filter((rating) => rating.helpful === false).length
          const totalRatings = reviewRatings.length

          result[reviewId] = {
            review_id: reviewId,
            total_ratings: totalRatings,
            helpful_count: helpfulCount,
            unhelpful_count: unhelpfulCount,
            helpful_percentage: totalRatings > 0 ? Math.round((helpfulCount / totalRatings) * 100) : null,
          }
        })

        return NextResponse.json({ data: result })
      }

      case "fetchUserReviewRatings": {
        const { reviewIds, sessionId } = data

        if (!reviewIds.length) {
          return NextResponse.json({ data: {} })
        }

        const { data: ratings, error } = await supabase
          .from("review_ratings")
          .select("review_id, helpful")
          .in("review_id", reviewIds)
          .eq("user_session_id", sessionId)

        if (error) {
          console.warn("review_ratings table may not exist:", error.message)
          return NextResponse.json({ data: {} })
        }

        const result: Record<string, boolean | null> = {}
        reviewIds.forEach((id: string) => {
          result[id] = null
        })

        ratings?.forEach((rating) => {
          result[rating.review_id] = rating.helpful
        })

        return NextResponse.json({ data: result })
      }

      case "submitReviewRating": {
        const { reviewId, helpful, sessionId } = data

        if (helpful === null) {
          // Delete the rating
          const { error } = await supabase
            .from("review_ratings")
            .delete()
            .eq("review_id", reviewId)
            .eq("user_session_id", sessionId)

          if (error) {
            console.error("Error deleting review rating:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
          }
        } else {
          // Upsert the rating
          const { error } = await supabase.from("review_ratings").upsert(
            {
              review_id: reviewId,
              user_session_id: sessionId,
              helpful,
            },
            { onConflict: "review_id,user_session_id" },
          )

          if (error) {
            console.error("Error submitting review rating:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
          }
        }

        return NextResponse.json({ success: true })
      }

      case "updateReview": {
        const { id, ...updateData } = data

        // First check if the user owns this review
        const { data: existingReview, error: fetchError } = await supabase
          .from("reviews")
          .select("*")
          .eq("id", id)
          .single()

        if (fetchError) {
          return NextResponse.json({ error: "Review not found" }, { status: 404 })
        }

        if (existingReview.user_session_id !== sessionId) {
          return NextResponse.json({ error: "You don't have permission to edit this review" }, { status: 403 })
        }

        // Check for profanity
        const hasProfanity =
          containsProfanity(updateData.review_text || "") ||
          (updateData.tutor_comments ? containsProfanity(updateData.tutor_comments) : false)

        if (hasProfanity) {
          return NextResponse.json(
            { error: "Review contains inappropriate language. Please revise and try again." },
            { status: 400 },
          )
        }

        // Update the review
        const { data: updatedReview, error } = await supabase
          .from("reviews")
          .update(updateData)
          .eq("id", id)
          .eq("user_session_id", sessionId)
          .select()
          .single()

        if (error) {
          console.error("Error updating review:", error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ data: updatedReview })
      }

      case "deleteReview": {
        const { reviewId } = data

        // First check if the user owns this review
        const { data: existingReview, error: fetchError } = await supabase
          .from("reviews")
          .select("*")
          .eq("id", reviewId)
          .single()

        if (fetchError) {
          return NextResponse.json({ error: "Review not found" }, { status: 404 })
        }

        if (existingReview.user_session_id !== sessionId) {
          return NextResponse.json({ error: "You don't have permission to delete this review" }, { status: 403 })
        }

        // Delete the review
        const { error } = await supabase.from("reviews").delete().eq("id", reviewId).eq("user_session_id", sessionId)

        if (error) {
          console.error("Error deleting review:", error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
