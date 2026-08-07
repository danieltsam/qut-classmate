"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowDownAZ, ArrowUpAZ, Calendar, Star, BookOpen, Brain, ChevronDown } from "lucide-react"

export type SortOption = "date" | "rating" | "ease" | "usefulness"
export type SortOrder = "asc" | "desc"

interface ReviewSortControlProps {
  sortBy: SortOption
  sortOrder: SortOrder
  onSortChange: (sortBy: SortOption, sortOrder: SortOrder) => void
}

export function ReviewSortControl({ sortBy, sortOrder, onSortChange }: ReviewSortControlProps) {
  const toggleSortOrder = () => {
    onSortChange(sortBy, sortOrder === "asc" ? "desc" : "asc")
  }

  const getSortLabel = (option: SortOption): string => {
    switch (option) {
      case "date":
        return "Date"
      case "rating":
        return "Overall Rating"
      case "ease":
        return "Ease"
      case "usefulness":
        return "Usefulness"
    }
  }

  const getSortIcon = (option: SortOption) => {
    switch (option) {
      case "date":
        return <Calendar className="h-4 w-4 mr-2" />
      case "rating":
        return <Star className="h-4 w-4 mr-2" />
      case "ease":
        return <BookOpen className="h-4 w-4 mr-2" />
      case "usefulness":
        return <Brain className="h-4 w-4 mr-2" />
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-500 dark:text-gray-400">Sort by:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-3">
            {getSortIcon(sortBy)}
            {getSortLabel(sortBy)}
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuRadioGroup
            value={sortBy}
            onValueChange={(value) => onSortChange(value as SortOption, sortOrder)}
          >
            <DropdownMenuRadioItem value="date" className="flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Date
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="rating" className="flex items-center">
              <Star className="h-4 w-4 mr-2" />
              Overall Rating
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="ease" className="flex items-center">
              <BookOpen className="h-4 w-4 mr-2" />
              Ease
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="usefulness" className="flex items-center">
              <Brain className="h-4 w-4 mr-2" />
              Usefulness
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={toggleSortOrder}
        title={sortOrder === "asc" ? "Ascending" : "Descending"}
      >
        {sortOrder === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
      </Button>
    </div>
  )
}
