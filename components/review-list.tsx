"use client"

import type { Review } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Star, ThumbsUp, ThumbsDown, BookOpen, Brain, Pencil, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ReviewRating } from "./review-rating"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { deleteReview, getSessionId } from "@/lib/supabase"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ReportReviewDialog } from "./report-review-dialog"

interface ReviewListProps {
  reviews: Review[]
  unitCode: string
  unitName?: string | null
  isLoading: boolean
  onEditReview?: (review: Review) => void
  onReviewDeleted?: () => void
}

export function ReviewList({ reviews, unitCode, unitName, isLoading, onEditReview, onReviewDeleted }: ReviewListProps) {
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reviewToDelete, setReviewToDelete] = useState<Review | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Get current session ID to check if user owns the review
  const sessionId = getSessionId()

  const handleDeleteClick = (review: Review) => {
    setReviewToDelete(review)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!reviewToDelete) return

    setIsDeleting(true)
    try {
      await deleteReview(reviewToDelete.id)
      toast({
        title: "Review deleted",
        description: "Your review has been successfully deleted.",
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })
      setDeleteDialogOpen(false)
      if (onReviewDeleted) onReviewDeleted()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete review. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-pulse space-y-4 w-full">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-200 dark:bg-gray-800 h-32 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  if (reviews.length === 0 && unitCode) {
    return (
      <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300 mt-6">
        <CardContent className="p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No reviews yet for {unitCode}
            {unitName ? ` - ${unitName}` : ""}.{" "}
            <span className="font-medium">Be the first to share your experience!</span>
          </p>
        </CardContent>
      </Card>
    )
  }

  if (reviews.length === 0 && !unitCode) {
    return (
      <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300 mt-6">
        <CardContent className="p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Enter a unit code above to see what other students think about it
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      {reviews.map((review) => {
        // Check if the current user is the author of this review
        const isOwnReview = review.user_session_id === sessionId

        return (
          <Card
            key={review.id}
            className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md"
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                    {review.reviewer_name || "Anonymous"}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                {/* Edit/Delete buttons for own reviews */}
                {isOwnReview && (
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-blue-600 dark:text-blue-400"
                      onClick={() => onEditReview && onEditReview(review)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 dark:text-red-400"
                      onClick={() => handleDeleteClick(review)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                )}
                {!isOwnReview && (
                  <ReportReviewDialog
                    reviewId={review.id}
                    reviewText={review.review_text}
                    unitCode={review.unit_code}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Rating metrics section */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                {/* Overall Rating */}
                <div className="flex flex-col items-center justify-center">
                  <div className="text-sm font-medium mb-1 flex items-center">
                    <Star className="h-4 w-4 mr-1 text-yellow-400" />
                    Overall
                  </div>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300 dark:text-gray-600"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-sm font-bold mt-1">{review.rating}/5</div>
                </div>

                {/* Ease Rating */}
                <div className="flex flex-col items-center justify-center">
                  <div className="text-sm font-medium mb-1 flex items-center">
                    <BookOpen className="h-4 w-4 mr-1 text-blue-400" />
                    Ease
                  </div>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= (review.ease_rating || 0)
                            ? "text-blue-400 fill-blue-400"
                            : "text-gray-300 dark:text-gray-600"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-sm font-bold mt-1">{review.ease_rating || "N/A"}</div>
                </div>

                {/* Usefulness Rating */}
                <div className="flex flex-col items-center justify-center">
                  <div className="text-sm font-medium mb-1 flex items-center">
                    <Brain className="h-4 w-4 mr-1 text-purple-400" />
                    Usefulness
                  </div>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= (review.usefulness_rating || 0)
                            ? "text-purple-400 fill-purple-400"
                            : "text-gray-300 dark:text-gray-600"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-sm font-bold mt-1">{review.usefulness_rating || "N/A"}</div>
                </div>

                {/* Recommendation */}
                <div className="flex flex-col items-center justify-center">
                  <div className="text-sm font-medium mb-1">Recommends</div>
                  {review.thumbs_up === true ? (
                    <ThumbsUp className="h-6 w-6 text-green-500 fill-green-500" />
                  ) : review.thumbs_up === false ? (
                    <ThumbsDown className="h-6 w-6 text-red-500 fill-red-500" />
                  ) : (
                    <span className="text-gray-500">N/A</span>
                  )}
                  <div className="text-sm font-bold mt-1">
                    {review.thumbs_up === true ? "Yes" : review.thumbs_up === false ? "No" : "Not specified"}
                  </div>
                </div>
              </div>

              {/* Review text */}
              <div>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{review.review_text}</p>
              </div>

              {/* Tutor review section */}
              {review.tutor_name && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="font-medium mb-2">Tutor Review: {review.tutor_name}</h4>

                  {review.tutor_rating && (
                    <div className="flex items-center mb-2">
                      <span className="mr-2">Rating:</span>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= review.tutor_rating
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-gray-300 dark:text-gray-600"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="ml-2 font-medium">{review.tutor_rating}/5</span>
                    </div>
                  )}

                  {review.tutor_comments && (
                    <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-line">
                      {review.tutor_comments}
                    </p>
                  )}
                </div>
              )}

              {/* Review rating component */}
              <ReviewRating reviewId={review.id} />
            </CardContent>
          </Card>
        )
      })}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your review. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
