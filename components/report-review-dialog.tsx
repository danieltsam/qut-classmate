"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Flag } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { submitReviewReport } from "@/lib/report-actions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

interface ReportReviewDialogProps {
  reviewId: string
  reviewText: string
  unitCode: string
}

export function ReportReviewDialog({ reviewId, reviewText, unitCode }: ReportReviewDialogProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [reasonType, setReasonType] = useState<string | undefined>()
  const [customReason, setCustomReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reasonType) {
      toast({
        title: "Error",
        description: "Please select a reason for reporting this review",
        variant: "destructive",
      })
      return
    }

    const finalReason = reasonType === "other" ? customReason : reason

    if (!finalReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for reporting this review",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const result = await submitReviewReport({
        review_id: reviewId,
        reason: finalReason,
      })

      if (result.success) {
        toast({
          title: "Report Submitted",
          description: "Thank you for helping keep our community safe",
          className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
        })
        setIsOpen(false)
        setReason("")
        setReasonType(undefined)
        setCustomReason("")
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
        description: "Failed to submit report. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReasonTypeChange = (value: string) => {
    setReasonType(value)
    switch (value) {
      case "inappropriate":
        setReason("This review contains inappropriate or offensive content")
        break
      case "spam":
        setReason("This review appears to be spam or advertising")
        break
      case "irrelevant":
        setReason("This review is not relevant to the unit")
        break
      case "other":
        setReason("")
        break
      default:
        setReason("")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
        >
          <Flag className="h-4 w-4" />
          <span className="sr-only">Report Review</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] dark:bg-gray-800 dark:border-gray-700 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[#003A6E] dark:text-blue-300">Report Review</DialogTitle>
          <DialogDescription>
            Report this review for {unitCode} if you believe it violates our community guidelines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md text-sm max-h-[100px] overflow-y-auto">
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{reviewText}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-[#003A6E] dark:text-blue-300">Reason for reporting</Label>
            <RadioGroup value={reasonType} onValueChange={handleReasonTypeChange}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inappropriate" id="inappropriate" />
                <Label htmlFor="inappropriate">Inappropriate content</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="spam" id="spam" />
                <Label htmlFor="spam">Spam or advertising</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="irrelevant" id="irrelevant" />
                <Label htmlFor="irrelevant">Not relevant to unit</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other">Other reason</Label>
              </div>
            </RadioGroup>
          </div>

          {reasonType === "other" && (
            <div className="space-y-2">
              <Label htmlFor="customReason" className="text-[#003A6E] dark:text-blue-300">
                Please specify
              </Label>
              <Textarea
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Please explain why you're reporting this review..."
                className="min-h-[80px] focus-visible:ring-[#003A6E] dark:bg-gray-700 dark:border-gray-600 rounded-lg transition-all duration-200 shadow-sm"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-[#003A6E] hover:bg-[#003A6E]/90 text-white dark:bg-blue-800 dark:hover:bg-blue-700"
          >
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
