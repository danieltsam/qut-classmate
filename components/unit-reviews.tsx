"use client"

import { useState, useEffect } from "react"
import { ReviewForm } from "./review-form"
import { ReviewList } from "./review-list"
import { ReviewSearch } from "./review-search"
import { UnitReviewSummary } from "./unit-review-summary"
import { fetchReviews, type Review } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReviewSortControl, type SortOption, type SortOrder } from "./review-sort-control"
import { EditReviewDialog } from "./edit-review-dialog"

interface UnitReviewsProps {
  initialUnitCode?: string | null
  initialUnitName?: string | null
}

export function UnitReviews({ initialUnitCode, initialUnitName }: UnitReviewsProps) {
  const { toast } = useToast()
  const [unitCode, setUnitCode] = useState(initialUnitCode || "")
  const [unitName, setUnitName] = useState<string | null>(initialUnitName || null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"search" | "submit">("search")
  const [sortBy, setSortBy] = useState<SortOption>("date")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [reviewToEdit, setReviewToEdit] = useState<Review | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Load unit name from localStorage
  useEffect(() => {
    // First check if we have a unit name from URL parameters
    if (initialUnitName) {
      setUnitName(initialUnitName)
    } else if (initialUnitCode) {
      // If we have a unit code but no name, check localStorage
      const storedUnitName = localStorage.getItem("lastReviewedUnitName")
      if (storedUnitName) {
        setUnitName(storedUnitName)
      }
    }
  }, [initialUnitCode, initialUnitName])

  // Load reviews when initialUnitCode changes, but only if it's from URL parameters
  useEffect(() => {
    if (initialUnitCode) {
      setUnitCode(initialUnitCode)
      loadReviews(initialUnitCode)
      setHasSearched(true)
    }
  }, [initialUnitCode])

  // Load last searched unit from localStorage, but don't automatically load reviews
  useEffect(() => {
    const lastSearchedUnit = localStorage.getItem("lastReviewedUnit")
    if (lastSearchedUnit && !initialUnitCode) {
      setUnitCode(lastSearchedUnit)

      // Also try to load the unit name
      const lastUnitName = localStorage.getItem("lastReviewedUnitName")
      if (lastUnitName) {
        setUnitName(lastUnitName)
      }

      // Don't automatically load reviews - wait for user to click search
    }
  }, [initialUnitCode])

  const loadReviews = async (code: string) => {
    if (!code.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchReviews(code, sortBy, sortOrder)
      setReviews(data)
      setHasSearched(true)

      // Save to localStorage
      localStorage.setItem("lastReviewedUnit", code)

      // Try to get unit name from the first review if available
      if (data.length > 0 && data[0].unit_name) {
        setUnitName(data[0].unit_name)
        localStorage.setItem("lastReviewedUnitName", data[0].unit_name)
      }
    } catch (err) {
      setError("Failed to load reviews. Please try again.")
      console.error("Error loading reviews:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnitCodeChange = (code: string) => {
    setUnitCode(code)

    // Don't automatically load reviews when the code changes
    // Only when it's a valid code and the user explicitly requests it
  }

  const handleSearch = (code: string) => {
    loadReviews(code)
  }

  const handleReviewSubmitted = () => {
    // Reload reviews after a new review is submitted
    loadReviews(unitCode)
    // Switch to search tab to show the new review
    setActiveTab("search")
  }

  const handleSortChange = (newSortBy: SortOption, newSortOrder: SortOrder) => {
    setSortBy(newSortBy)
    setSortOrder(newSortOrder)

    // Reload reviews with new sort options
    if (unitCode && hasSearched) {
      loadReviews(unitCode)
    }
  }

  const handleEditReview = (review: Review) => {
    setReviewToEdit(review)
    setEditDialogOpen(true)
  }

  const handleReviewUpdated = () => {
    // Reload reviews after a review is updated
    loadReviews(unitCode)
    setEditDialogOpen(false)
    setReviewToEdit(null)
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "search" | "submit")}>
        {/* Update the tabs to be more mobile-friendly */}
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger
            value="search"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 px-1 sm:px-3 text-xs sm:text-sm"
          >
            Find Reviews
          </TabsTrigger>
          <TabsTrigger
            value="submit"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200 px-1 sm:px-3 text-xs sm:text-sm"
          >
            Submit Review
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="focus:outline-none animate-in fade-in-50 duration-300">
          <ReviewSearch
            unitCode={unitCode}
            onUnitCodeChange={handleUnitCodeChange}
            onSearch={handleSearch}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="submit" className="focus:outline-none animate-in fade-in-50 duration-300">
          <ReviewForm
            unitCode={unitCode}
            onUnitCodeChange={handleUnitCodeChange}
            onReviewSubmitted={handleReviewSubmitted}
          />
        </TabsContent>
      </Tabs>

      {error && (
        <Alert
          variant="destructive"
          className="rounded-lg shadow-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {unitCode && hasSearched && <UnitReviewSummary unitCode={unitCode} />}

      {unitCode && hasSearched && reviews.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <h2 className="text-xl font-semibold text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
            Reviews for {unitCode}
            {unitName ? ` - ${unitName}` : ""}
          </h2>
          <ReviewSortControl sortBy={sortBy} sortOrder={sortOrder} onSortChange={handleSortChange} />
        </div>
      )}

      {(hasSearched || isLoading) && (
        <ReviewList
          reviews={reviews}
          unitCode={unitCode}
          unitName={unitName}
          isLoading={isLoading}
          onEditReview={handleEditReview}
          onReviewDeleted={() => loadReviews(unitCode)}
        />
      )}

      {/* Edit Review Dialog */}
      {reviewToEdit && (
        <EditReviewDialog
          review={reviewToEdit}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onReviewUpdated={handleReviewUpdated}
        />
      )}
    </div>
  )
}
