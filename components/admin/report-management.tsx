"use client"

import { useState, useEffect } from "react"
import { getReviewReports, resolveReport, type ReviewReport } from "@/lib/report-actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"
import { Loader2, CheckCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface ReportManagementProps {
  reviewId?: string // Optional - if provided, only shows reports for this review
  adminId: string // Required - the ID of the admin user
}

export function ReportManagement({ reviewId, adminId }: ReportManagementProps) {
  const { toast } = useToast()
  const [reports, setReports] = useState<ReviewReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingReportId, setProcessingReportId] = useState<string | null>(null)

  useEffect(() => {
    const loadReports = async () => {
      setIsLoading(true)
      try {
        if (reviewId) {
          const data = await getReviewReports(reviewId)
          setReports(data)
        } else {
          // In a real app, you would have an API to get all reports
          // For now, we'll just show an empty list
          setReports([])
        }
      } catch (error) {
        console.error("Error loading reports:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadReports()
  }, [reviewId])

  const handleResolveReport = async (reportId: string) => {
    setProcessingReportId(reportId)
    try {
      const result = await resolveReport(reportId, adminId)

      if (result.success) {
        // Update the local state
        setReports(
          reports.map((report) =>
            report.id === reportId
              ? {
                  ...report,
                  resolved: true,
                  resolved_at: new Date().toISOString(),
                  resolved_by: adminId,
                }
              : report,
          ),
        )

        toast({
          title: "Report Resolved",
          description: "The report has been marked as resolved",
          className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
        })
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resolve report. Please try again.",
        variant: "destructive",
      })
    } finally {
      setProcessingReportId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300 mt-6">
        <CardContent className="p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">No reports found.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-[#003A6E] dark:text-blue-300">
        {reviewId ? "Reports for this Review" : "All Reports"}
      </h2>

      {reports.map((report) => (
        <Card
          key={report.id}
          className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md"
        >
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-base font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
                  Report #{report.id.substring(0, 8)}
                </CardTitle>
                <CardDescription>
                  {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                </CardDescription>
              </div>
              <Badge
                variant={report.resolved ? "outline" : "default"}
                className={
                  report.resolved
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                }
              >
                {report.resolved ? "Resolved" : "Pending"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <span className="text-sm font-medium">Reported by:</span>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  User {report.user_session_id.substring(0, 8)}...
                </p>
              </div>

              <div>
                <span className="text-sm font-medium">Reason:</span>
                <p className="text-sm text-gray-700 dark:text-gray-300">{report.reason}</p>
              </div>

              {report.resolved ? (
                <div>
                  <span className="text-sm font-medium">Resolved:</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {formatDistanceToNow(new Date(report.resolved_at!), { addSuffix: true })} by Admin{" "}
                    {report.resolved_by!.substring(0, 8)}...
                  </p>
                </div>
              ) : (
                <Button
                  onClick={() => handleResolveReport(report.id)}
                  disabled={!!processingReportId}
                  className="bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700 rounded-lg transition-all duration-300"
                >
                  {processingReportId === report.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark as Resolved
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
