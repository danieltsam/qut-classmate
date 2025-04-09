"use client"

import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

export function CacheClearButton() {
  const { toast } = useToast()

  const clearLocalCache = () => {
    // Get all keys in localStorage
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith("timetable-")) {
        keysToRemove.push(key)
      }
    }

    // Remove all timetable cache entries
    keysToRemove.forEach((key) => localStorage.removeItem(key))

    // Show success message
    toast({
      title: "Cache Cleared",
      description: `Cleared ${keysToRemove.length} cached timetable entries.`,
      duration: 3000,
      className: "bg-[#003A6E] text-white dark:bg-blue-800 border-none shadow-lg",
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={clearLocalCache}
      className="border-[#003A6E]/20 hover:bg-[#003A6E]/10 text-[#003A6E] dark:border-blue-800 dark:hover:bg-blue-900/30 dark:text-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Clear Cache
    </Button>
  )
}
