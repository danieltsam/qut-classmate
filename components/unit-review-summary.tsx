"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Star, ThumbsUp, ThumbsDown, BookOpen, Brain } from "lucide-react"
import { fetchUnitSummary, type UnitReviewSummary } from "@/lib/supabase"
import { Progress } from "@/components/ui/progress"

interface UnitReviewSummaryProps {
  unitCode: string
}

export function UnitReviewSummary({ unitCode }: UnitReviewSummaryProps) {
  const [summary, setSummary] = useState<UnitReviewSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!unitCode) return

    const loadSummary = async () => {
      setIsLoading(true)
      try {
        const data = await fetchUnitSummary(unitCode)
        setSummary(data)
      } catch (error) {
        console.error("Error loading unit summary:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSummary()
  }, [unitCode])

  if (isLoading) {
    return (
      <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!summary) {
    return null // Don't show anything if there's no summary
  }

  return (
    <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300">
      <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl pb-3">
        <CardTitle className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300 text-lg">
          {unitCode} Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm font-medium">
                <Star className="h-4 w-4 mr-1 text-yellow-400" />
                Overall Rating
              </div>
              <span className="text-sm font-bold">{summary.avg_rating || "N/A"}/5</span>
            </div>
            <Progress value={(summary.avg_rating || 0) * 20} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm font-medium">
                <BookOpen className="h-4 w-4 mr-1 text-blue-400" />
                Ease
              </div>
              <span className="text-sm font-bold">{summary.avg_ease || "N/A"}/5</span>
            </div>
            <Progress value={(summary.avg_ease || 0) * 20} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm font-medium">
                <Brain className="h-4 w-4 mr-1 text-purple-400" />
                Usefulness
              </div>
              <span className="text-sm font-bold">{summary.avg_usefulness || "N/A"}/5</span>
            </div>
            <Progress value={(summary.avg_usefulness || 0) * 20} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm font-medium">
                <ThumbsUp className="h-4 w-4 mr-1 text-green-400" />
                Would Recommend
              </div>
              <span className="text-sm font-bold">{summary.thumbs_up_percentage || 0}%</span>
            </div>
            <Progress value={summary.thumbs_up_percentage || 0} className="h-2" />
          </div>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <ThumbsUp className="h-4 w-4 mr-1 text-green-500" />
              <span className="text-sm">{summary.thumbs_up_count}</span>
            </div>
            <div className="flex items-center">
              <ThumbsDown className="h-4 w-4 mr-1 text-red-500" />
              <span className="text-sm">{summary.thumbs_down_count}</span>
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Based on {summary.total_reviews} {summary.total_reviews === 1 ? "review" : "reviews"}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
