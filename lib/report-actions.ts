"use server"

import { createClient } from "@supabase/supabase-js"
import { getSessionId } from "./supabase"
import { revalidatePath } from "next/cache"

// Create a Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

const adminSupabase = createClient(supabaseUrl, supabaseServiceKey)

// Type for report data
export interface ReviewReport {
  id: string
  review_id: string
  user_session_id: string
  reason: string
  created_at: string
  resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
}

// Type for report submission
export interface ReportSubmission {
  review_id: string
  reason: string
}

/**
 * Submit a report for a review
 */
export async function submitReviewReport(report: ReportSubmission): Promise<{ success: boolean; message: string }> {
  try {
    // Get the user's session ID
    const sessionId = getSessionId()

    // Check if the user has already reported this review
    const { data: existingReports } = await adminSupabase
      .from("review_reports")
      .select("id")
      .eq("review_id", report.review_id)
      .eq("user_session_id", sessionId)

    if (existingReports && existingReports.length > 0) {
      return {
        success: false,
        message: "You have already reported this review",
      }
    }

    // Submit the report
    const { error } = await adminSupabase.from("review_reports").insert([
      {
        review_id: report.review_id,
        user_session_id: sessionId,
        reason: report.reason,
        resolved: false,
      },
    ])

    if (error) {
      console.error("Error submitting report:", error)
      return {
        success: false,
        message: error.message,
      }
    }

    // Revalidate the reviews page to reflect the report
    revalidatePath("/reviews")

    return {
      success: true,
      message: "Report submitted successfully",
    }
  } catch (error) {
    console.error("Error in submitReviewReport:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

/**
 * Get reports for a specific review (admin only)
 */
export async function getReviewReports(reviewId: string): Promise<ReviewReport[]> {
  try {
    // This function should only be called by admins
    // In a real app, you would check admin status here

    const { data, error } = await adminSupabase
      .from("review_reports")
      .select("*")
      .eq("review_id", reviewId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching reports:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("Error in getReviewReports:", error)
    return []
  }
}

/**
 * Resolve a report (admin only)
 */
export async function resolveReport(reportId: string, adminId: string): Promise<{ success: boolean; message: string }> {
  try {
    // This function should only be called by admins
    // In a real app, you would check admin status here

    const { error } = await adminSupabase
      .from("review_reports")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: adminId,
      })
      .eq("id", reportId)

    if (error) {
      console.error("Error resolving report:", error)
      return {
        success: false,
        message: error.message,
      }
    }

    return {
      success: true,
      message: "Report resolved successfully",
    }
  } catch (error) {
    console.error("Error in resolveReport:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

/**
 * Get user's reports
 */
export async function getUserReports(): Promise<ReviewReport[]> {
  try {
    const sessionId = getSessionId()

    // This will use RLS to only return the user's reports
    const { data, error } = await adminSupabase
      .from("review_reports")
      .select("*")
      .eq("user_session_id", sessionId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching user reports:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("Error in getUserReports:", error)
    return []
  }
}
