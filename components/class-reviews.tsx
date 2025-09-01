"use client"

import { useState, useEffect } from "react"
import { ReviewForm } from "./review-form"
import { ReviewList } from "./review-list"
import { ReviewSearch } from "./review-search"
import { fetchReviews, type Review } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function ClassReviews() {
  const { toast } = useToast()
  const [unitCode, setUnitCode] = useState("")
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"search" | "submit">("search")

  // Load last searched unit from localStorage
  useEffect(() => {
    const lastSearchedUnit = localStorage.getItem("lastReviewedUnit")
    if (lastSearchedUnit) {
      setUnitCode(lastSearchedUnit)
      loadReviews(lastSearchedUnit)
    }
  }, [])

  const loadReviews = async (code: string) => {
    if (!code.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchReviews(code)
      setReviews(data)

      // Save to localStorage
      localStorage.setItem("lastReviewedUnit", code)
    } catch (err) {
      setError("Failed to load reviews. Please try again.")
      console.error("Error loading reviews:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnitCodeChange = (code: string) => {
    setUnitCode(code)

    // If the code is valid (3 letters + 3 numbers), load reviews
    if (/^[A-Za-z]{3}[0-9]{3}$/.test(code)) {
      loadReviews(code)
    }
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

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "search" | "submit")}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger
            value="search"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200"
          >
            Find Reviews
          </TabsTrigger>
          <TabsTrigger
            value="submit"
            className="data-[state=active]:bg-white data-[state=active]:text-[#003A6E] dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-300 rounded-lg transition-all duration-200"
          >
            Submit a Review
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

      <ReviewList reviews={reviews} unitCode={unitCode} isLoading={isLoading} />
    </div>
  )
}
