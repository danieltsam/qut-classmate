"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Star, Loader2, ThumbsUp, ThumbsDown, BookOpen, Brain } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { updateReview, type Review } from "@/lib/supabase"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface EditReviewDialogProps {
  review: Review
  open: boolean
  onOpenChange: (open: boolean) => void
  onReviewUpdated: () => void
}

export function EditReviewDialog({ review, open, onOpenChange, onReviewUpdated }: EditReviewDialogProps) {
  const { toast } = useToast()
  const [reviewerName, setReviewerName] = useState(review.reviewer_name || "")
  const [rating, setRating] = useState(review.rating)
  const [easeRating, setEaseRating] = useState(review.ease_rating || 0)
  const [usefulnessRating, setUsefulnessRating] = useState(review.usefulness_rating || 0)
  const [thumbsUp, setThumbsUp] = useState<boolean | null>(review.thumbs_up)
  const [reviewText, setReviewText] = useState(review.review_text)
  const [tutorName, setTutorName] = useState(review.tutor_name || "")
  const [tutorRating, setTutorRating] = useState(review.tutor_rating || 0)
  const [tutorComments, setTutorComments] = useState(review.tutor_comments || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [hoverRating, setHoverRating] = useState(0)
  const [hoverEaseRating, setHoverEaseRating] = useState(0)
  const [hoverUsefulnessRating, setHoverUsefulnessRating] = useState(0)
  const [hoverTutorRating, setHoverTutorRating] = useState(0)

  const validateForm = (): boolean => {
    if (rating === 0) {
      setValidationError("Please select an overall rating")
      return false
    }

    if (easeRating === 0) {
      setValidationError("Please rate the unit's ease")
      return false
    }

    if (usefulnessRating === 0) {
      setValidationError("Please rate the unit's usefulness")
      return false
    }

    if (thumbsUp === null) {
      setValidationError("Please indicate if you would recommend this unit")
      return false
    }

    if (!reviewText.trim()) {
      setValidationError("Please enter your review")
      return false
    }

    // Tutor information is optional, but if tutor name is provided, rating is required
    if (tutorName.trim() && tutorRating === 0) {
      setValidationError("Please provide a rating for the tutor")
      return false
    }

    setValidationError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      await updateReview({
        id: review.id,
        reviewer_name: reviewerName.trim() || null,
        rating,
        ease_rating: easeRating,
        usefulness_rating: usefulnessRating,
        thumbs_up: thumbsUp,
        review_text: reviewText.trim(),
        tutor_name: tutorName.trim() || null,
        tutor_rating: tutorName.trim() ? tutorRating : null,
        tutor_comments: tutorComments.trim() || null,
      })

      toast({
        title: "Review updated",
        description: "Your review has been successfully updated.",
        className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
      })

      onReviewUpdated()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update your review. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md dark:bg-gray-800 dark:border-gray-700 rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#003A6E] dark:text-blue-300">Edit Your Review</DialogTitle>
          <DialogDescription>
            Update your review for {review.unit_code}
            {review.unit_name ? ` - ${review.unit_name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">Overall Rating</Label>
            <div className="flex space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="focus:outline-none"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= (hoverRating || rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                    } transition-colors duration-200`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                {rating > 0 ? `${rating} star${rating !== 1 ? "s" : ""}` : "Select a rating"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
              <div className="flex items-center">
                <BookOpen className="h-4 w-4 mr-1" />
                Ease Rating
              </div>
            </Label>
            <div className="flex space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="focus:outline-none"
                  onClick={() => setEaseRating(star)}
                  onMouseEnter={() => setHoverEaseRating(star)}
                  onMouseLeave={() => setHoverEaseRating(0)}
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= (hoverEaseRating || easeRating)
                        ? "text-blue-400 fill-blue-400"
                        : "text-gray-300 dark:text-gray-600"
                    } transition-colors duration-200`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                {easeRating > 0
                  ? `${easeRating} - ${easeRating === 1 ? "Very Difficult" : easeRating === 2 ? "Difficult" : easeRating === 3 ? "Moderate" : easeRating === 4 ? "Easy" : "Very Easy"}`
                  : "How easy was this unit?"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
              <div className="flex items-center">
                <Brain className="h-4 w-4 mr-1" />
                Usefulness Rating
              </div>
            </Label>
            <div className="flex space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="focus:outline-none"
                  onClick={() => setUsefulnessRating(star)}
                  onMouseEnter={() => setHoverUsefulnessRating(star)}
                  onMouseLeave={() => setHoverUsefulnessRating(0)}
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= (hoverUsefulnessRating || usefulnessRating)
                        ? "text-purple-400 fill-purple-400"
                        : "text-gray-300 dark:text-gray-600"
                    } transition-colors duration-200`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                {usefulnessRating > 0
                  ? `${usefulnessRating} - ${usefulnessRating === 1 ? "Not Useful" : usefulnessRating === 2 ? "Slightly Useful" : usefulnessRating === 3 ? "Moderately Useful" : usefulnessRating === 4 ? "Very Useful" : "Extremely Useful"}`
                  : "How useful was this unit?"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
              Would you recommend this unit?
            </Label>
            <div className="flex space-x-4">
              <Button
                type="button"
                variant={thumbsUp === true ? "default" : "outline"}
                className={`flex items-center ${
                  thumbsUp === true
                    ? "bg-green-500 hover:bg-green-600 text-white"
                    : "hover:bg-green-100 dark:hover:bg-green-900/20"
                }`}
                onClick={() => setThumbsUp(true)}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Yes
              </Button>
              <Button
                type="button"
                variant={thumbsUp === false ? "default" : "outline"}
                className={`flex items-center ${
                  thumbsUp === false
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "hover:bg-red-100 dark:hover:bg-red-900/20"
                }`}
                onClick={() => setThumbsUp(false)}
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                No
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reviewText" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
              Your Review
            </Label>
            <Textarea
              id="reviewText"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your experience with this unit..."
              className="min-h-[100px] focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 border-t pt-4 border-gray-200 dark:border-gray-700">
            <Label htmlFor="tutorName" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
              Tutor Name (Optional)
            </Label>
            <Input
              id="tutorName"
              value={tutorName}
              onChange={(e) => setTutorName(e.target.value)}
              placeholder="Enter tutor's name"
              className="focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
              disabled={isSubmitting}
            />
          </div>

          {tutorName.trim() && (
            <>
              <div className="space-y-2">
                <Label className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">Tutor Rating</Label>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="focus:outline-none"
                      onClick={() => setTutorRating(star)}
                      onMouseEnter={() => setHoverTutorRating(star)}
                      onMouseLeave={() => setHoverTutorRating(0)}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= (hoverTutorRating || tutorRating)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-gray-300 dark:text-gray-600"
                        } transition-colors duration-200`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {tutorRating > 0 ? `${tutorRating} star${tutorRating !== 1 ? "s" : ""}` : "Rate the tutor"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="tutorComments"
                  className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300"
                >
                  Comments about the Tutor
                </Label>
                <Textarea
                  id="tutorComments"
                  value={tutorComments}
                  onChange={(e) => setTutorComments(e.target.value)}
                  placeholder="Share your experience with this tutor..."
                  className="min-h-[100px] focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
                  disabled={isSubmitting}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="reviewerName" className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
              Your Name (optional)
            </Label>
            <Input
              id="reviewerName"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Anonymous"
              className="focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Leave blank to submit anonymously</p>
          </div>

          {validationError && <p className="text-red-500 text-sm">{validationError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="mt-2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#003A6E] hover:bg-[#003A6E]/90 dark:bg-blue-800 dark:hover:bg-blue-700 text-white rounded-lg transition-all duration-300 shadow-md hover:shadow-lg mt-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Review"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
