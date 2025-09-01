"use client"

import { useState, useEffect } from "react"
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  fetchReviewRatings,
  fetchUserReviewRatings,
  submitReviewRating,
  type ReviewRatingSummary,
} from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"

interface ReviewRatingProps {
  reviewId: string
}

export function ReviewRating({ reviewId }: ReviewRatingProps) {
  const { toast } = useToast()
  const [ratingSummary, setRatingSummary] = useState<ReviewRatingSummary | null>(null)
  const [userRating, setUserRating] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadRatings = async () => {
      try {
        // Fetch the rating summary for this review
        const summaries = await fetchReviewRatings([reviewId])
        setRatingSummary(summaries[reviewId] || null)

        // Fetch the user's rating for this review
        const userRatings = await fetchUserReviewRatings([reviewId])
        setUserRating(userRatings[reviewId] || null)

        setError(null)
      } catch (error) {
        console.error("Error loading review ratings:", error)
        setError(error instanceof Error ? error.message : "Failed to load ratings")
      } finally {
        setIsLoading(false)
      }
    }

    loadRatings()
  }, [reviewId])

  const handleRateReview = async (helpful: boolean) => {
    // If the user clicks the same rating again, toggle it off
    const newRating = userRating === helpful ? null : helpful

    setIsSubmitting(true)
    try {
      await submitReviewRating(reviewId, newRating)
      setUserRating(newRating)

      // Update the summary optimistically
      if (ratingSummary) {
        const updatedSummary = { ...ratingSummary }

        // If removing a rating
        if (userRating !== null && newRating === null) {
          updatedSummary.total_ratings = Math.max(0, updatedSummary.total_ratings - 1)
          if (userRating === true) {
            updatedSummary.helpful_count = Math.max(0, updatedSummary.helpful_count - 1)
          } else {
            updatedSummary.unhelpful_count = Math.max(0, updatedSummary.unhelpful_count - 1)
          }
        }
        // If changing a rating
        else if (userRating !== null && newRating !== null) {
          if (userRating === false && newRating === true) {
            updatedSummary.helpful_count += 1
            updatedSummary.unhelpful_count = Math.max(0, updatedSummary.unhelpful_count - 1)
          } else if (userRating === true && newRating === false) {
            updatedSummary.helpful_count = Math.max(0, updatedSummary.helpful_count - 1)
            updatedSummary.unhelpful_count += 1
          }
        }
        // If adding a new rating
        else if (userRating === null && newRating !== null) {
          updatedSummary.total_ratings += 1
          if (newRating === true) {
            updatedSummary.helpful_count += 1
          } else {
            updatedSummary.unhelpful_count += 1
          }
        }

        // Recalculate percentage
        if (updatedSummary.total_ratings > 0) {
          updatedSummary.helpful_percentage = Math.round(
            (updatedSummary.helpful_count / updatedSummary.total_ratings) * 100,
          )
        } else {
          updatedSummary.helpful_percentage = null
        }

        setRatingSummary(updatedSummary)
      } else {
        // If we don't have a summary yet, create one
        setRatingSummary({
          review_id: reviewId,
          total_ratings: 1,
          helpful_count: newRating === true ? 1 : 0,
          unhelpful_count: newRating === false ? 1 : 0,
          helpful_percentage: newRating === true ? 100 : 0,
        })
      }

      toast({
        title: "Rating submitted",
        description: newRating === null ? "Rating removed" : newRating ? "Marked as helpful" : "Marked as not helpful",
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })

      setError(null)
    } catch (error) {
      console.error("Error submitting rating:", error)
      setError(error instanceof Error ? error.message : "Failed to submit rating")

      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit rating. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-8">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
        <p className="text-amber-600 dark:text-amber-400">Rating feature unavailable</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-1">
        <span>Was this review helpful?</span>
        <div className="flex space-x-1 ml-2">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 px-2 rounded-full ${
              userRating === true ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : ""
            }`}
            onClick={() => handleRateReview(true)}
            disabled={isSubmitting}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            <span>Yes</span>
            {ratingSummary?.helpful_count ? <span className="ml-1">({ratingSummary.helpful_count})</span> : null}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 px-2 rounded-full ${
              userRating === false ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : ""
            }`}
            onClick={() => handleRateReview(false)}
            disabled={isSubmitting}
          >
            <ThumbsDown className="h-4 w-4 mr-1" />
            <span>No</span>
            {ratingSummary?.unhelpful_count ? <span className="ml-1">({ratingSummary.unhelpful_count})</span> : null}
          </Button>
        </div>
      </div>
      {ratingSummary?.total_ratings ? (
        <div className="text-xs">
          {ratingSummary.helpful_percentage}% of users found this review helpful ({ratingSummary.total_ratings}{" "}
          {ratingSummary.total_ratings === 1 ? "vote" : "votes"})
        </div>
      ) : null}
    </div>
  )
}
