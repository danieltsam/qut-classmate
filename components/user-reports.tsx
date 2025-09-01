"use client"

import { useState, useEffect } from "react"
import { getUserReports, type ReviewReport } from "@/lib/report-actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { Loader2 } from "lucide-react"

export function UserReports() {
  const [reports, setReports] = useState<ReviewReport[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadReports = async () => {
      setIsLoading(true)
      try {
        const data = await getUserReports()
        setReports(data)
      } catch (error) {
        console.error("Error loading reports:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadReports()
  }, [])

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
          <p className="text-gray-500 dark:text-gray-400">You haven't reported any reviews yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-[#003A6E] dark:text-blue-300">Your Reports</h2>

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
            <div className="space-y-2">
              <div>
                <span className="text-sm font-medium">Reason:</span>
                <p className="text-sm text-gray-700 dark:text-gray-300">{report.reason}</p>
              </div>

              {report.resolved && (
                <div>
                  <span className="text-sm font-medium">Resolved:</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {formatDistanceToNow(new Date(report.resolved_at!), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
