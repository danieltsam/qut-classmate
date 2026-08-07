"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Loader2 } from "lucide-react"
import { UnitCodeAutocomplete } from "./unit-code-autocomplete"

interface ReviewSearchProps {
  unitCode: string
  onUnitCodeChange: (unitCode: string) => void
  onSearch: (unitCode: string) => void
  isLoading: boolean
}

export function ReviewSearch({ unitCode, onUnitCodeChange, onSearch, isLoading }: ReviewSearchProps) {
  const [validationError, setValidationError] = useState<string | null>(null)

  const validateUnitCode = (code: string): boolean => {
    if (!code.trim()) {
      setValidationError("Please enter a unit code")
      return false
    }

    const unitCodePattern = /^[A-Za-z]{3}[0-9]{3}$/
    if (!unitCodePattern.test(code.trim())) {
      setValidationError("Unit code must be 3 letters followed by 3 digits (e.g., CAB202)")
      return false
    }

    setValidationError(null)
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (validateUnitCode(unitCode)) {
      onSearch(unitCode)
    }
  }

  return (
    <Card className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md overflow-hidden transition-all duration-300">
      <CardHeader className="bg-[#003A6E]/5 dark:bg-blue-900/20 rounded-t-xl">
        <CardTitle className="text-[#003A6E] dark:text-blue-300 transition-colors duration-300">
          Search Unit Reviews
        </CardTitle>
        <CardDescription className="dark:text-gray-400 transition-colors duration-300">
          Find out what other students think about QUT units
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 dark:bg-gray-900 transition-colors duration-300">
        {/* Make sure the component is responsive */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
            <div className="flex-grow">
              <UnitCodeAutocomplete
                value={unitCode}
                onChange={(value) => {
                  onUnitCodeChange(value)
                  if (validationError) validateUnitCode(value)
                }}
                disabled={isLoading}
                placeholder="Enter unit code (e.g. CAB202)"
              />
              {validationError && <p className="text-red-500 text-xs mt-1">{validationError}</p>}
            </div>
            <Button
              type="submit"
              className="bg-[#003A6E] hover:bg-[#003A6E]/90 dark:bg-blue-800 dark:hover:bg-blue-700 text-white rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="sm:inline">Searching...</span>
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  <span className="sm:inline">Search Reviews</span>
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Click the search button to load reviews for this unit
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
