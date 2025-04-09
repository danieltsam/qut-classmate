"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Input } from "@/components/ui/input"
import { Check } from "lucide-react"
import { filterUnitCodes } from "@/lib/unit-codes"

interface UnitCodeAutocompleteProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export function UnitCodeAutocomplete({
  value,
  onChange,
  disabled = false,
  placeholder = "Enter a unit code...",
}: UnitCodeAutocompleteProps) {
  const [open, setOpen] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<string[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 })
  const [isMounted, setIsMounted] = React.useState(false)

  // Set mounted state after component mounts
  React.useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // Update position when input changes or when dropdown opens
  React.useEffect(() => {
    if (inputRef.current && open) {
      const rect = inputRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }, [open, value])

  // Update suggestions when input value changes
  React.useEffect(() => {
    if (value.length >= 2) {
      // Only show suggestions after at least 2 characters
      const filteredCodes = filterUnitCodes(value)
      setSuggestions(filteredCodes.slice(0, 5)) // Limit to exactly 5 results
      setOpen(filteredCodes.length > 0)
    } else {
      setSuggestions([])
      setOpen(false)
    }
  }, [value])

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  // Handle direct click on a suggestion
  const handleSuggestionClick = (code: string) => {
    onChange(code)
    setOpen(false) // This should close the dropdown immediately
    setSuggestions([]) // Also clear suggestions to ensure dropdown disappears
  }

  // Create dropdown portal
  const renderDropdown = () => {
    if (!open || suggestions.length === 0 || !isMounted) return null

    return createPortal(
      <div
        className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-md border shadow-md"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
        }}
      >
        {suggestions.map((code, index) => (
          <div
            key={code}
            className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-sm text-gray-700 dark:text-gray-300 ${
              index === suggestions.length - 1 ? "rounded-b-md mb-1" : ""
            }`}
            onMouseDown={(e) => {
              // Prevent the input's onBlur from firing before the click
              e.preventDefault()
            }}
            onClick={() => handleSuggestionClick(code)}
          >
            <Check className="mr-2 h-4 w-4 flex-shrink-0" style={{ opacity: value === code ? 1 : 0 }} />
            <span>{code}</span>
          </div>
        ))}
      </div>,
      document.body,
    )
  }

  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full focus-visible:ring-[#003A6E] dark:bg-gray-800 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm"
        onFocus={() => value.length >= 2 && suggestions.length > 0 && setOpen(true)}
        onBlur={() => {
          // Delay closing to allow for clicks on suggestions
          setTimeout(() => setOpen(false), 200)
        }}
      />
      {renderDropdown()}
    </div>
  )
}
