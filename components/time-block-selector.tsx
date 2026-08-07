"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { useMediaQuery } from "@/hooks/use-mobile"

interface TimeBlockSelectorProps {
  onBlocksChange: (blocks: { day: string; startHour: number; endHour: number }[]) => void
}

// Days of the week (Monday to Friday)
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

// Time slots from 8am to 9pm
const timeSlots = Array.from({ length: 14 }, (_, i) => i + 8)

// Function to detect if the device is mobile
// const isMobileDevice = () => {
//   return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
// }

// Add isMobile check
const TimeBlockSelectorComponent = ({ onBlocksChange }: TimeBlockSelectorProps) => {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [selectedBlocks, setSelectedBlocks] = useState<Record<string, boolean>>({})
  const [isSelecting, setIsSelecting] = useState(false)
  const [isErasing, setIsErasing] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // Add touch state tracking
  const [touchStartBlock, setTouchStartBlock] = useState<string | null>(null)
  const [isTouchSelecting, setIsTouchSelecting] = useState(false)

  // Detect if the device is mobile
  // const [isMobile, setIsMobile] = useState(false);

  // useEffect(() => {
  //   setIsMobile(isMobileDevice());
  // }, []);

  // Memoize the mergeAdjacentBlocks function to prevent unnecessary recalculations
  const mergeAdjacentBlocks = useCallback((blocks: { day: string; startHour: number; endHour: number }[]) => {
    if (blocks.length === 0) return []

    // Sort blocks by day and start time
    const sortedBlocks = [...blocks].sort((a, b) => {
      if (a.day !== b.day) return days.indexOf(a.day) - days.indexOf(b.day)
      return a.startHour - b.startHour
    })

    const mergedBlocks: { day: string; startHour: number; endHour: number }[] = []
    let currentBlock = { ...sortedBlocks[0] }

    for (let i = 1; i < sortedBlocks.length; i++) {
      const block = sortedBlocks[i]

      // If same day and adjacent time, merge
      if (block.day === currentBlock.day && block.startHour === currentBlock.endHour) {
        currentBlock.endHour = block.endHour
      } else {
        // Otherwise, add current block and start a new one
        mergedBlocks.push(currentBlock)
        currentBlock = { ...block }
      }
    }

    // Add the last block
    mergedBlocks.push(currentBlock)

    return mergedBlocks
  }, [])

  // Convert selected blocks to the format expected by the parent component
  // Use useCallback to memoize this function
  const updateParentBlocks = useCallback(() => {
    const blocks = Object.entries(selectedBlocks)
      .filter(([_, isSelected]) => isSelected)
      .map(([key]) => {
        const [day, hourStr] = key.split("-")
        const hour = Number.parseInt(hourStr)
        return { day, startHour: hour, endHour: hour + 1 }
      })

    // Merge adjacent blocks on the same day
    const mergedBlocks = mergeAdjacentBlocks(blocks)
    onBlocksChange(mergedBlocks)
  }, [selectedBlocks, mergeAdjacentBlocks, onBlocksChange])

  // Use a separate useEffect with proper dependencies
  useEffect(() => {
    updateParentBlocks()
  }, [updateParentBlocks])

  // Handle mouse down on a cell
  const handleMouseDown = (day: string, hour: number, isSelected: boolean) => {
    setIsSelecting(true)
    setIsErasing(isSelected)
    toggleBlock(day, hour, !isSelected)
  }

  // Handle mouse enter on a cell during selection
  const handleMouseEnter = (day: string, hour: number) => {
    if (isSelecting) {
      toggleBlock(day, hour, !isErasing)
    }
  }

  // Handle mouse up to end selection
  const handleMouseUp = () => {
    setIsSelecting(false)
  }

  // Toggle a block's selection state
  const toggleBlock = (day: string, hour: number, isSelected: boolean) => {
    const key = `${day}-${hour}`
    setSelectedBlocks((prev) => ({
      ...prev,
      [key]: isSelected,
    }))
  }

  // Clear all selections
  const handleClearAll = () => {
    setSelectedBlocks({})
  }

  // Add event listeners for mouse up outside the grid
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelecting(false)
    }

    window.addEventListener("mouseup", handleGlobalMouseUp)
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [])

  // Add a useEffect to handle touch events globally
  useEffect(() => {
    const handleGlobalTouchEnd = () => {
      setIsTouchSelecting(false)
      setTouchStartBlock(null)
    }

    window.addEventListener("touchend", handleGlobalTouchEnd)
    return () => {
      window.removeEventListener("touchend", handleGlobalTouchEnd)
    }
  }, [])

  // Update the touch handling to be more reliable
  const handleTouchStart = (day: string, hour: number, isSelected: boolean, e: React.TouchEvent) => {
    e.preventDefault()
    setTouchStartBlock(`${day}-${hour}`)
    setIsTouchSelecting(true)
    setIsErasing(isSelected)
    toggleBlock(day, hour, !isSelected)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isTouchSelecting) {
      e.preventDefault()
      // Get touch position
      const touch = e.touches[0]
      const element = document.elementFromPoint(touch.clientX, touch.clientY)

      // Check if we're over a grid cell
      if (element && element.getAttribute("data-grid-cell")) {
        const cellData = element.getAttribute("data-grid-cell")?.split("-")
        if (cellData && cellData.length === 2) {
          const touchDay = cellData[0]
          const touchHour = Number.parseInt(cellData[1], 10)
          if (!isNaN(touchHour)) {
            toggleBlock(touchDay, touchHour, !isErasing)
          }
        }
      }
    }
  }

  // Add CSS to prevent text selection when dragging
  return (
    <div className="space-y-2 select-none">
      <div className="flex justify-end">
        <button onClick={handleClearAll} className="text-sm text-[#003A6E] dark:text-blue-300 hover:underline">
          Clear All
        </button>
      </div>

      <Card
        className="border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-sm overflow-hidden transition-all duration-300 select-none"
        ref={gridRef}
      >
        <div className="p-2 select-none">
          <div className="overflow-x-auto sm:overflow-visible">
            <div className="min-w-[500px] sm:min-w-0 sm:w-full">
              {/* Grid header */}
              <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-1 mb-1 select-none">
                <div className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-1 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md text-xs">
                  Time
                </div>
                {days.map((day) => (
                  <div
                    key={day}
                    className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-1 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md text-xs"
                  >
                    {day.substring(0, 3)}
                  </div>
                ))}
              </div>

              {/* Time slots */}
              {timeSlots.map((hour) => (
                <div key={hour} className="grid grid-cols-[60px_repeat(5,1fr)] gap-1 mb-1 select-none">
                  <div className="bg-[#003A6E]/5 dark:bg-blue-900/20 p-1 text-center text-xs text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md">
                    {hour % 12 || 12}
                    {hour >= 12 ? "pm" : "am"}
                  </div>

                  {days.map((day) => {
                    const key = `${day}-${hour}`
                    const isSelected = !!selectedBlocks[key]

                    return (
                      <div
                        key={`${day}-${hour}`}
                        className={`relative min-h-[30px] rounded-md cursor-pointer transition-colors duration-150 select-none ${
                          isSelected
                            ? "bg-[#003A6E]/40 dark:bg-blue-900/60"
                            : "bg-gray-50 dark:bg-gray-800 hover:bg-[#003A6E]/10 dark:hover:bg-blue-900/30"
                        }`}
                        onMouseDown={() => handleMouseDown(day, hour, isSelected)}
                        onMouseEnter={() => handleMouseEnter(day, hour)}
                        onMouseUp={handleMouseUp}
                        onTouchStart={(e) => handleTouchStart(day, hour, isSelected, e)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => {
                          setIsTouchSelecting(false)
                          setTouchStartBlock(null)
                        }}
                        data-grid-cell={`${day}-${hour}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center select-none">
        {isMobile
          ? "Tap and drag to select or deselect time blocks"
          : "Click and drag to select or deselect multiple time blocks at once"}
      </p>
    </div>
  )
}

export function TimeBlockSelector(props: TimeBlockSelectorProps) {
  return <TimeBlockSelectorComponent {...props} />
}
