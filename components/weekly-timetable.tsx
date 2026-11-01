"use client"

import type { TimetableEntry, SelectedClass } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import {
  formatActivityType,
  extractWeeksInfo,
  doClassesOverlap,
  formatLocationSummary,
  type CollapsedEntry,
} from "@/lib/format-utils"
import { useMediaQuery } from "@/hooks/use-mobile"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core"

interface WeeklyTimetableProps {
  selectedClasses: SelectedClass[]
  hoveredClass: TimetableEntry | null
  onClassToggle: (classEntry: TimetableEntry | SelectedClass, isRemoval?: boolean) => void
  previewClasses?: TimetableEntry[]
  /**
   * Returns every other stream of the same unit + activity type, read from the
   * per-unit timetable cache. Supplied by the timetable maker so the swap stays
   * in one place (`handleClassToggle`).
   */
  getAlternatives?: (classEntry: TimetableEntry | SelectedClass) => TimetableEntry[]
}

// Days of the week (Monday to Friday)
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

// Time slots from 8am to 10pm
const timeSlots = Array.from({ length: 15 }, (_, i) => i + 8)

// Droppable ids for the "you could move here" ghosts
const GHOST_ID_PREFIX = "alt-ghost:"

// ── Pure helpers (hoisted out of the component so drag state does not rebuild them) ──

// Function to convert time string to hour number (e.g., "10:00am" -> 10)
function timeToHour(timeStr: string): number {
  const isPM = timeStr.toLowerCase().includes("pm")
  const [hourStr] = timeStr.replace(/[ap]m/i, "").split(":")

  let hour = Number.parseInt(hourStr, 10)

  // Convert to 24-hour format
  if (isPM && hour < 12) hour += 12
  if (!isPM && hour === 12) hour = 0

  return hour
}

// Function to convert time string to minutes past the hour (e.g., "10:30am" -> 30)
function timeToMinutes(timeStr: string): number {
  const [_, minuteStr] = timeStr.replace(/[ap]m/i, "").split(":")
  return Number.parseInt(minuteStr, 10)
}

// Calculate position and height for a class entry
function calculateClassPosition(classEntry: TimetableEntry | SelectedClass) {
  const startHour = timeToHour(classEntry.startTime)
  const endHour = timeToHour(classEntry.endTime)
  const startMinutes = timeToMinutes(classEntry.startTime)
  const endMinutes = timeToMinutes(classEntry.endTime)

  // Calculate top position (percentage of the hour)
  const topOffset = (startMinutes / 60) * 100

  // Calculate height (in percentage of hours)
  const durationHours = endHour - startHour + (endMinutes - startMinutes) / 60
  const height = durationHours * 100

  return {
    top: `${topOffset}%`,
    height: `${height}%`,
  }
}

// Extract class mode (Online/On Campus)
function getClassMode(entry: TimetableEntry | SelectedClass): string {
  const classInfo = entry.class.toLowerCase()
  if (classInfo.includes("online")) return "Online"
  if (classInfo.includes("on campus") || classInfo.includes("internal")) return "On Campus"
  return ""
}

// Get color for unit
function getUnitColor(unitCode: string): { bg: string; border: string; text: string } {
  // Generate a consistent color based on the unit code
  const colors = [
    { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800" },
    { bg: "bg-green-100", border: "border-green-300", text: "text-green-800" },
    { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800" },
    { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800" },
    { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-800" },
    { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800" },
    { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
    { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800" },
    { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-800" },
    { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
    { bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-800" },
    { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
  ]

  // Dark mode variants
  const darkColors = [
    { bg: "dark:bg-blue-900/50", border: "dark:border-blue-700", text: "dark:text-blue-300" },
    { bg: "dark:bg-green-900/50", border: "dark:border-green-700", text: "dark:text-green-300" },
    { bg: "dark:bg-purple-900/50", border: "dark:border-purple-700", text: "dark:text-purple-300" },
    { bg: "dark:bg-amber-900/50", border: "dark:border-amber-700", text: "dark:text-amber-300" },
    { bg: "dark:bg-pink-900/50", border: "dark:border-pink-700", text: "dark:text-pink-300" },
    { bg: "dark:bg-cyan-900/50", border: "dark:border-cyan-700", text: "dark:text-cyan-300" },
    { bg: "dark:bg-indigo-900/50", border: "dark:border-indigo-700", text: "dark:text-indigo-300" },
    { bg: "dark:bg-rose-900/50", border: "dark:border-rose-700", text: "dark:text-rose-300" },
    { bg: "dark:bg-teal-900/50", border: "dark:border-teal-700", text: "dark:text-teal-300" },
    { bg: "dark:bg-orange-900/50", border: "dark:border-orange-700", text: "dark:text-orange-300" },
    { bg: "dark:bg-lime-900/50", border: "dark:border-lime-700", text: "dark:text-lime-300" },
    { bg: "dark:bg-emerald-900/50", border: "dark:border-emerald-700", text: "dark:text-emerald-300" },
  ]

  // Use a hash function to get a consistent index
  const hash = unitCode.split("").reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc)
  }, 0)

  const index = Math.abs(hash) % colors.length

  return {
    bg: `${colors[index].bg} ${darkColors[index].bg}`,
    border: `${colors[index].border} ${darkColors[index].border}`,
    text: `${colors[index].text} ${darkColors[index].text}`,
  }
}

// Detect overlapping classes for a specific day and hour
function getOverlappingClasses(day: string, hour: number, classes: SelectedClass[]): SelectedClass[][] {
  // Filter classes that start at this hour on this day
  const classesAtHour = classes.filter((cls) => cls.dayFormatted === day && timeToHour(cls.startTime) === hour)

  // If there's only one or no class, no need for special handling
  if (classesAtHour.length <= 1) return []

  // Group classes by unit code
  const groupedByUnit: Record<string, SelectedClass[]> = {}

  classesAtHour.forEach((cls) => {
    const key = cls.unitCode || "unknown"
    if (!groupedByUnit[key]) {
      groupedByUnit[key] = []
    }
    groupedByUnit[key].push(cls)
  })

  // For each unit, group classes by activity type
  const unitGroups: SelectedClass[][] = []

  Object.values(groupedByUnit).forEach((unitClasses) => {
    // Group by activity type within this unit
    const activityGroups: Record<string, SelectedClass[]> = {}

    unitClasses.forEach((cls) => {
      const key = cls.activityType || "unknown"
      if (!activityGroups[key]) {
        activityGroups[key] = []
      }
      activityGroups[key].push(cls)
    })

    // If there's more than one activity type for this unit, add them as a group
    if (Object.keys(activityGroups).length > 1) {
      const allClassesForUnit: SelectedClass[] = []
      Object.values(activityGroups).forEach((group) => {
        allClassesForUnit.push(...group)
      })
      unitGroups.push(allClassesForUnit)
    }
  })

  // Now check for overlaps between different units
  const overlappingGroups: SelectedClass[][] = [...unitGroups]

  // Create a flat list of all classes that are not part of a unit group
  const remainingClasses = classesAtHour.filter(
    (cls) => !unitGroups.some((group) => group.some((g) => g.id === cls.id)),
  )

  // Check each remaining class against others for time overlaps
  const processedIds = new Set<string>()

  remainingClasses.forEach((cls) => {
    if (processedIds.has(cls.id)) return

    const overlappingClasses: SelectedClass[] = [cls]
    processedIds.add(cls.id)

    remainingClasses.forEach((otherCls) => {
      if (cls.id === otherCls.id) return
      if (processedIds.has(otherCls.id)) return

      // Check if they overlap in time and weeks, ignoring activity type
      if (doClassesOverlap(cls, otherCls, true)) {
        overlappingClasses.push(otherCls)
        processedIds.add(otherCls.id)
      }
    })

    if (overlappingClasses.length > 1) {
      overlappingGroups.push(overlappingClasses)
    }
  })

  return overlappingGroups
}

// Merge classes with the same details but different weeks
function mergeClassesByWeek(classes: SelectedClass[]): SelectedClass[] {
  const mergedClassesMap = new Map<string, SelectedClass>()

  classes.forEach((cls) => {
    // Create a key that identifies the class without the week information
    const key = `${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.endTime}-${cls.location}`

    if (mergedClassesMap.has(key)) {
      // If we already have this class, extract the week info from both and combine
      const existingClass = mergedClassesMap.get(key)!
      const existingWeekInfo = extractWeeksInfo(existingClass.class)
      const newWeekInfo = extractWeeksInfo(cls.class)

      // Only merge if the weeks are different
      if (existingWeekInfo !== newWeekInfo) {
        // Create a combined class description with merged week information
        const combinedClass = {
          ...existingClass,
          class: existingClass.class.replace(existingWeekInfo, combineWeekInfo(existingWeekInfo, newWeekInfo)),
        }
        mergedClassesMap.set(key, combinedClass)
      }
    } else {
      // If this is the first time we're seeing this class, add it to the map
      mergedClassesMap.set(key, cls)
    }
  })

  return Array.from(mergedClassesMap.values())
}

// Helper function to combine week information
function combineWeekInfo(week1: string, week2: string): string {
  // Extract just the week numbers from strings like "Week 9" or "Weeks 1-13" or "Weeks 3 & 7"
  const extractNumbers = (weekStr: string): number[] => {
    const numbers: number[] = []

    // Handle ranges like "Weeks 1-13"
    const rangeMatch = weekStr.match(/Weeks\s+(\d+)-(\d+)/i)
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1])
      const end = Number.parseInt(rangeMatch[2])
      for (let i = start; i <= end; i++) {
        numbers.push(i)
      }
      return numbers
    }

    // Handle single weeks like "Week 9"
    const singleMatch = weekStr.match(/Week\s+(\d+)/i)
    if (singleMatch) {
      numbers.push(Number.parseInt(singleMatch[1]))
      return numbers
    }

    // Handle comma-separated or ampersand-separated weeks like "Weeks 1, 3, 5" or "Weeks 3 & 7"
    const commaMatch = weekStr.match(/Weeks\s+([\d,\s&]+)/i)
    if (commaMatch) {
      // Split by both commas and ampersands
      const weekNumbers = commaMatch[1].split(/[,&]/).map((w) => Number.parseInt(w.trim()))
      return weekNumbers.filter((w) => !isNaN(w))
    }

    return numbers
  }

  // Extract week numbers from both strings
  const numbers1 = extractNumbers(week1)
  const numbers2 = extractNumbers(week2)

  // Combine and sort all week numbers
  const allNumbers = [...new Set([...numbers1, ...numbers2])].sort((a, b) => a - b)

  // If we have no numbers, return the original
  if (allNumbers.length === 0) return week1

  // Format the combined week information
  if (allNumbers.length === 1) {
    return `Week ${allNumbers[0]}`
  } else {
    return `Weeks ${allNumbers.join(" & ")}`
  }
}

// A stable id for a candidate stream, used as the droppable id
function ghostIdFor(entry: TimetableEntry): string {
  return `${GHOST_ID_PREFIX}${entry.unitCode}-${entry.activityType}-${entry.dayFormatted}-${entry.startTime}-${entry.endTime}-${entry.location}`
}

/**
 * Ghosts can only be dropped on if they are actually visible in the Mon–Fri,
 * 8am–10pm grid. Streams that fall outside it are dropped from the candidate
 * list so a drag never offers a destination that cannot be rendered.
 */
function renderableAlternatives(entries: TimetableEntry[]): TimetableEntry[] {
  const seen = new Set<string>()
  const out: TimetableEntry[] = []

  for (const entry of entries) {
    if (!days.includes(entry.dayFormatted)) continue

    const startHour = timeToHour(entry.startTime)
    if (Number.isNaN(startHour) || startHour < timeSlots[0] || startHour > timeSlots[timeSlots.length - 1]) continue

    const id = ghostIdFor(entry)
    if (seen.has(id)) continue

    seen.add(id)
    out.push(entry)
  }

  return out
}

/**
 * Arrow keys jump the keyboard drag between ghosts, picking the nearest one in
 * the pressed direction. Returned values are a translate delta from the dragged
 * block's resting rect, which is how @dnd-kit applies keyboard movement.
 */
const ghostKeyboardCoordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const directions: Record<string, { x: number; y: number }> = {
    ArrowRight: { x: 1, y: 0 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowDown: { x: 0, y: 1 },
    ArrowUp: { x: 0, y: -1 },
  }

  const direction = directions[event.code]
  if (!direction) return

  event.preventDefault()

  const initialRect = context.active?.rect.current.initial
  if (!initialRect) return

  const ghosts = context.droppableContainers
    .getEnabled()
    .filter((container) => String(container.id).startsWith(GHOST_ID_PREFIX) && container.rect.current)

  if (ghosts.length === 0) return

  const origin = {
    x: initialRect.left + currentCoordinates.x + initialRect.width / 2,
    y: initialRect.top + currentCoordinates.y + initialRect.height / 2,
  }

  let best: { score: number; rect: NonNullable<(typeof ghosts)[number]["rect"]["current"]> } | null = null

  for (const container of ghosts) {
    const rect = container.rect.current
    if (!rect) continue

    const dx = rect.left + rect.width / 2 - origin.x
    const dy = rect.top + rect.height / 2 - origin.y

    // Project onto the pressed axis; must be genuinely ahead of where we are
    const forward = dx * direction.x + dy * direction.y
    if (forward <= 8) continue

    const sideways = Math.abs(direction.x === 0 ? dx : dy)
    const score = forward + sideways * 1.5

    if (!best || score < best.score) best = { score, rect }
  }

  if (!best) return

  return {
    x: best.rect.left - initialRect.left,
    y: best.rect.top - initialRect.top,
  }
}

const dragCollisionDetection: CollisionDetection = (args) => {
  // Pointer drags only drop when the cursor is actually inside a ghost; keyboard
  // drags fall back to centre distance because they have no pointer coordinates.
  if (args.pointerCoordinates) {
    return pointerWithin(args)
  }

  return closestCenter(args)
}

export function WeeklyTimetable({
  selectedClasses,
  hoveredClass,
  onClassToggle,
  previewClasses = [],
  getAlternatives = () => [],
}: WeeklyTimetableProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [showScrollMessage, setShowScrollMessage] = useState(true)

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [dragAlternatives, setDragAlternatives] = useState<TimetableEntry[]>([])
  const escapedRef = useRef(false)
  // @dnd-kit can finish a drag a frame after pointerup, so guard clicks on the
  // start of the drag too — otherwise a drag ending near its origin reads as a
  // click and removes the class.
  const dragActivityAtRef = useRef(0)

  const sensors = useSensors(
    // 6px of movement before a drag starts, so a plain click still removes the class
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: ghostKeyboardCoordinateGetter }),
  )

  // Hide scroll message after 30 seconds
  useEffect(() => {
    if (isMobile) {
      const timer = setTimeout(() => {
        setShowScrollMessage(false)
      }, 30000)

      return () => clearTimeout(timer)
    }
  }, [isMobile])

  const mergedSelectedClasses = useMemo(() => mergeClassesByWeek(selectedClasses), [selectedClasses])

  // Alternatives for every placed block, so we know up front which blocks have
  // somewhere to go. Blocks with no other stream are not draggable at all.
  const alternativesById = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>()

    for (const cls of mergedSelectedClasses) {
      map.set(cls.id, renderableAlternatives(getAlternatives(cls)))
    }

    return map
  }, [mergedSelectedClasses, getAlternatives])

  const activeClass = useMemo(
    () => (activeId === null ? null : (mergedSelectedClasses.find((cls) => cls.id === activeId) ?? null)),
    [activeId, mergedSelectedClasses],
  )

  const ghostLayout = useMemo(() => buildGhostLayout(dragAlternatives), [dragAlternatives])

  // Which alternatives would clash with a class that stays on the timetable
  const ghostConflicts = useMemo(() => {
    const conflicts = new Map<string, boolean>()
    if (!activeClass) return conflicts

    const staying = mergedSelectedClasses.filter((cls) => cls.id !== activeClass.id)

    for (const alt of dragAlternatives) {
      conflicts.set(
        ghostIdFor(alt),
        staying.some((cls) => doClassesOverlap(cls, alt, true)),
      )
    }

    return conflicts
  }, [activeClass, dragAlternatives, mergedSelectedClasses])

  // Escape cancels a pointer drag with no change. @dnd-kit handles Escape for
  // keyboard drags itself (onDragCancel); this covers the pointer case.
  useEffect(() => {
    if (activeId === null) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      escapedRef.current = true
      setDragAlternatives([])
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeId])

  const resetDragState = () => {
    dragActivityAtRef.current = Date.now()
    escapedRef.current = false
    setActiveId(null)
    setDragAlternatives([])
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    const alternatives = alternativesById.get(id) ?? []

    // Nothing to swap to — never enter a drag that leads nowhere
    if (alternatives.length === 0) return

    dragActivityAtRef.current = Date.now()
    escapedRef.current = false
    setActiveId(event.active.id)
    setDragAlternatives(alternatives)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = event.over ? String(event.over.id) : null
    const match = overId ? dragAlternatives.find((alt) => ghostIdFor(alt) === overId) : undefined
    const wasCancelled = escapedRef.current

    resetDragState()

    if (wasCancelled || !match) return

    // handleClassToggle owns the swap + conflict rules: this replaces the
    // existing stream for this unit + activity type.
    onClassToggle(match)
  }

  const handleDragCancel = () => resetDragState()

  // A drag can leave a stray click behind; ignore clicks around a drag so drag
  // never swallows or doubles up with the click-to-remove behaviour.
  const handleBlockClick = (cls: SelectedClass) => {
    if (Date.now() - dragActivityAtRef.current < 350) return
    // Make sure we're passing the exact class object with the correct ID
    onClassToggle(cls, true)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dragCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To move a class, press space or enter. Use the arrow keys to jump between the highlighted alternative streams, then press space or enter to swap. Press escape to cancel.",
        },
      }}
    >
      <Card className="h-full border-[#003A6E]/20 dark:border-blue-900/30 rounded-xl shadow-md transition-all duration-300 hover:shadow-lg sticky top-4 z-10 w-full max-h-[85vh] overflow-hidden">
        <CardContent className="p-2 sm:p-3 dark:bg-gray-900 transition-colors duration-300 overflow-y-auto h-full max-h-[calc(85vh-2rem)]">
          <div className={`pb-2 max-w-full h-full ${isMobile ? "overflow-x-auto" : "overflow-x-hidden"}`}>
            {isMobile && showScrollMessage && (
              <div className="text-xs text-center text-gray-500 dark:text-gray-400 mb-2 animate-pulse bg-gray-100 dark:bg-gray-800 p-2 rounded-md mx-auto">
                ← Scroll horizontally to see all days →
              </div>
            )}
            <div className={isMobile ? "min-w-[700px] max-w-[700px]" : "w-full"}>
              {/* Header row with days - sticky on mobile */}
              <div className="sticky top-0 z-20 grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1 bg-white dark:bg-gray-900 pt-1">
                <div className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-1 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md text-sm select-none">
                  Time
                </div>
                {days.map((day) => (
                  <div
                    key={day}
                    className="bg-[#003A6E]/10 dark:bg-blue-900/30 p-1 text-center font-medium text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md text-sm select-none"
                  >
                    {isMobile ? day.substring(0, 3) : day}
                  </div>
                ))}
              </div>

              {/* Time slots */}
              {timeSlots.map((hour) => (
                <div key={hour} className="grid grid-cols-[80px_repeat(5,1fr)] gap-1 mb-1">
                  <div className="bg-[#003A6E]/5 dark:bg-blue-900/20 p-1 text-center text-xs text-[#003A6E] dark:text-blue-300 transition-colors duration-300 rounded-md">
                    {hour % 12 || 12}
                    {hour >= 12 ? "pm" : "am"}
                  </div>

                  {days.map((day) => (
                    <div
                      key={`${day}-${hour}`}
                      className="relative min-h-[50px] bg-gray-50 dark:bg-gray-800 transition-colors duration-300 rounded-md"
                    >
                      {/* Render selected classes */}
                      {mergedSelectedClasses.map((cls) => {
                        // Only render at the starting hour
                        if (cls.dayFormatted !== day || timeToHour(cls.startTime) !== hour) return null

                        const position = calculateClassPosition(cls)
                        const colors = getUnitColor(cls.unitCode)

                        // Find overlapping classes
                        const overlappingGroups = getOverlappingClasses(day, hour, mergedSelectedClasses)
                        const isOverlapping = overlappingGroups.some((group) =>
                          group.some((overlapCls) => overlapCls.id === cls.id),
                        )

                        // Find which group this class belongs to
                        const overlapGroupIndex = overlappingGroups.findIndex((group) =>
                          group.some((overlapCls) => overlapCls.id === cls.id),
                        )

                        // Find position in the group
                        const positionInGroup =
                          overlapGroupIndex >= 0
                            ? overlappingGroups[overlapGroupIndex].findIndex((overlapCls) => overlapCls.id === cls.id)
                            : 0

                        // Calculate width and left offset for overlapping classes
                        const totalInGroup = overlapGroupIndex >= 0 ? overlappingGroups[overlapGroupIndex].length : 1
                        const widthPercentage = isOverlapping ? 100 / totalInGroup : 100
                        const leftOffset = isOverlapping ? positionInGroup * widthPercentage : 0

                        return (
                          <PlacedClassBlock
                            key={cls.id}
                            cls={cls}
                            position={position}
                            colors={colors}
                            isMobile={isMobile}
                            isOverlapping={isOverlapping}
                            widthPercentage={widthPercentage}
                            leftOffset={leftOffset}
                            isDragging={activeId === cls.id}
                            hasAlternatives={(alternativesById.get(cls.id)?.length ?? 0) > 0}
                            onClick={handleBlockClick}
                          />
                        )
                      })}

                      {/* Alternative streams, only while a drag is in progress */}
                      {ghostLayout.get(`${day}-${hour}`)?.map((slot) => (
                        <AlternativeGhost
                          key={ghostIdFor(slot.entry)}
                          entry={slot.entry}
                          position={calculateClassPosition(slot.entry)}
                          isMobile={isMobile}
                          index={slot.index}
                          total={slot.total}
                          willConflict={ghostConflicts.get(ghostIdFor(slot.entry)) ?? false}
                        />
                      ))}

                      {/* Render preview classes */}
                      {previewClasses.map((cls, idx) => {
                        // Only render at the starting hour
                        if (cls.dayFormatted !== day || timeToHour(cls.startTime) !== hour) return null

                        // A collapsed preview carries the other modes at this slot (e.g.
                        // CAB201's lecture in person / Virtual / Online). Modes already on
                        // the timetable are dropped, and what is left is labelled as one
                        // block: "GP B117 · +2 more". The full list lives in the tooltip.
                        const collapsed = cls as Partial<CollapsedEntry>
                        const alternates = collapsed.alternates ?? []
                        const slotLocations = collapsed.locations?.length ? collapsed.locations : [cls.location]
                        const remainingLocations = slotLocations.filter(
                          (location) =>
                            !selectedClasses.some(
                              (selected) =>
                                selected.unitCode === cls.unitCode &&
                                selected.activityType === cls.activityType &&
                                selected.dayFormatted === cls.dayFormatted &&
                                selected.startTime === cls.startTime &&
                                selected.location === location,
                            ),
                        )
                        if (remainingLocations.length === 0) return null

                        const position = calculateClassPosition(cls)
                        const colors = getUnitColor(cls.unitCode ?? "")
                        const activityTypeFull = formatActivityType(cls.activityType)
                        const weeksInfo = extractWeeksInfo(cls.class)
                        const locationLabel = formatLocationSummary(remainingLocations)
                        const locationTooltip = remainingLocations.join(" · ")

                        // Check for overlaps with selected classes
                        const overlappingWithSelected = selectedClasses.some((selected) =>
                          doClassesOverlap(selected, cls, true),
                        )

                        return (
                          <div
                            key={`preview-${cls.unitCode}-${cls.activityType}-${cls.dayFormatted}-${cls.startTime}-${cls.location}-${idx}`}
                            title={locationTooltip}
                            data-preview-block="true"
                            data-preview-alternates={alternates.length}
                            className={`absolute rounded-md border-dashed border ${colors.border} ${colors.text} p-1 overflow-hidden text-xs opacity-90 transition-all duration-200`}
                            style={{
                              top: position.top,
                              height: position.height,
                              width: "calc(100% - 4px)",
                              left: "2px",
                              zIndex: 5,
                              backgroundColor: "rgba(0, 58, 110, 0.15)",
                              borderColor: overlappingWithSelected ? "rgba(234, 179, 8, 0.8)" : undefined,
                              borderWidth: "1.5px",
                            }}
                          >
                            {(() => {
                              const startHour = timeToHour(cls.startTime)
                              const endHour = timeToHour(cls.endTime)
                              const duration = endHour - startHour
                              const isShortClass = duration <= 1

                              return (
                                <>
                                  <div
                                    className={`font-medium break-words ${isMobile || isShortClass ? "text-[9px]" : ""} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                  >
                                    {cls.unitCode} {activityTypeFull}
                                  </div>
                                  <div
                                    className={`whitespace-normal break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                  >
                                    {cls.startTime} - {cls.endTime}
                                  </div>
                                  {!isShortClass || duration > 1.5 ? (
                                    <>
                                      <div
                                        className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                      >
                                        {locationLabel}
                                      </div>
                                      <div
                                        className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                      >
                                        {weeksInfo}
                                      </div>
                                    </>
                                  ) : (
                                    <div className={`text-[7px] truncate leading-relaxed`}>
                                      {locationLabel.split(" - ")[0]}
                                    </div>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        )
                      })}

                      {/* Render hovered class preview */}
                      {hoveredClass &&
                        hoveredClass.dayFormatted === day &&
                        timeToHour(hoveredClass.startTime) === hour && (
                          <div
                            className="absolute inset-x-0 rounded-md border border-dashed p-1 overflow-hidden text-xs transition-all duration-200 animate-in fade-in-50"
                            style={{
                              ...calculateClassPosition(hoveredClass),
                              zIndex: 5,
                              margin: "0 2px",
                              backgroundColor: "rgba(0, 58, 110, 0.2)",
                              borderColor: selectedClasses.some((selected) =>
                                doClassesOverlap(selected, hoveredClass, true),
                              )
                                ? "rgba(234, 179, 8, 0.8)"
                                : "rgba(0, 58, 110, 0.6)",
                              borderWidth: "1.5px",
                            }}
                          >
                            {(() => {
                              const startHour = timeToHour(hoveredClass.startTime)
                              const endHour = timeToHour(hoveredClass.endTime)
                              const duration = endHour - startHour
                              const isShortClass = duration <= 1

                              return (
                                <>
                                  <div
                                    className={`font-medium break-words ${isMobile || isShortClass ? "text-[9px]" : ""} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                  >
                                    {hoveredClass.unitCode} {formatActivityType(hoveredClass.activityType)}
                                  </div>
                                  <div
                                    className={`whitespace-normal break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                                  >
                                    {hoveredClass.startTime} - {hoveredClass.endTime}
                                  </div>
                                  {!isShortClass || duration > 1.5 ? (
                                    <>
                                      <div
                                        className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                      >
                                        {hoveredClass.location}
                                      </div>
                                      <div
                                        className={`break-words ${isMobile || isShortClass ? "text-[8px]" : "text-xs"}`}
                                      >
                                        {extractWeeksInfo(hoveredClass.class)}
                                      </div>
                                    </>
                                  ) : (
                                    <div className={`text-[7px] truncate leading-relaxed`}>
                                      {hoveredClass.location.split(" - ")[0]}
                                    </div>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Follows the cursor; the placed block stays anchored and dimmed underneath */}
      <DragOverlay dropAnimation={null} zIndex={50}>
        {activeClass ? (
          <div
            className={`rounded-md border-2 border-[#003A6E] bg-white dark:bg-gray-800 dark:border-blue-400 p-1 overflow-hidden text-xs text-[#003A6E] dark:text-blue-200 shadow-lg h-full w-full cursor-grabbing`}
          >
            <div className="font-medium truncate">
              {activeClass.unitCode} {formatActivityType(activeClass.activityType)}
            </div>
            <div className="whitespace-normal truncate">
              {activeClass.startTime} - {activeClass.endTime}
            </div>
            <div className="truncate">{activeClass.location}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// Some units run every stream of an activity at the same time and only vary the
// delivery mode (e.g. on-campus / virtual / online lectures). Those ghosts land
// on top of each other, so a cell is split horizontally rather than stacked.
interface GhostSlot {
  entry: TimetableEntry
  index: number
  total: number
}

function ghostCellKey(entry: TimetableEntry): string {
  return `${entry.dayFormatted}-${timeToHour(entry.startTime)}`
}

function buildGhostLayout(alternatives: TimetableEntry[]): Map<string, GhostSlot[]> {
  const byCell = new Map<string, TimetableEntry[]>()

  for (const alt of alternatives) {
    const key = ghostCellKey(alt)
    const list = byCell.get(key)
    if (list) list.push(alt)
    else byCell.set(key, [alt])
  }

  const layout = new Map<string, GhostSlot[]>()

  for (const [cell, entries] of byCell) {
    // Ghosts only need slicing against ghosts that occupy the same time window;
    // ones in the same hour but a different time can keep the full width.
    const byTime = new Map<string, TimetableEntry[]>()

    for (const entry of entries) {
      const key = `${entry.startTime}|${entry.endTime}`
      const list = byTime.get(key)
      if (list) list.push(entry)
      else byTime.set(key, [entry])
    }

    const slots: GhostSlot[] = []

    for (const group of byTime.values()) {
      const ordered = [...group].sort((a, b) => a.location.localeCompare(b.location))
      ordered.forEach((entry, index) => slots.push({ entry, index, total: ordered.length }))
    }

    layout.set(cell, slots)
  }

  return layout
}

interface PlacedClassBlockProps {
  cls: SelectedClass
  position: { top: string; height: string }
  colors: { bg: string; border: string; text: string }
  isMobile: boolean
  isOverlapping: boolean
  widthPercentage: number
  leftOffset: number
  isDragging: boolean
  hasAlternatives: boolean
  onClick: (cls: SelectedClass) => void
}

function PlacedClassBlock({
  cls,
  position,
  colors,
  isMobile,
  isOverlapping,
  widthPercentage,
  leftOffset,
  isDragging,
  hasAlternatives,
  onClick,
}: PlacedClassBlockProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: cls.id,
    data: { classEntry: cls },
    disabled: !hasAlternatives,
  })

  const classMode = getClassMode(cls)
  const weeksInfo = extractWeeksInfo(cls.class)
  const activityTypeFull = formatActivityType(cls.activityType)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setNodeRef}
            data-testid="timetable-class-block"
            data-class-id={cls.id}
            {...(hasAlternatives ? { ...attributes, ...listeners } : {})}
            className={`absolute rounded-md border ${colors.bg} ${colors.border} ${colors.text} p-1 overflow-hidden text-xs transition-all duration-200 motion-reduce:transition-none hover:shadow-md animate-in fade-in-50 shadow-sm ${isOverlapping ? "border-dashed" : ""} ${hasAlternatives ? "cursor-grab" : "cursor-pointer"} ${isDragging ? "opacity-40 ring-2 ring-[#003A6E]/40 dark:ring-blue-400/50" : ""}`}
            style={{
              top: position.top,
              height: position.height,
              width: isOverlapping ? `calc(${widthPercentage}% - 4px)` : "calc(100% - 4px)",
              left: isOverlapping ? `${leftOffset}%` : "2px",
              zIndex: 10,
              touchAction: "none",
            }}
            onClick={() => onClick(cls)}
          >
            <div className="flex flex-col h-full">
              {(() => {
                const startHour = timeToHour(cls.startTime)
                const endHour = timeToHour(cls.endTime)
                const duration = endHour - startHour
                const isShortClass = duration <= 1

                return (
                  <>
                    <div
                      className={`font-medium ${isOverlapping || isMobile || isShortClass ? "text-[9px]" : "truncate"} ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                    >
                      {cls.unitCode} {activityTypeFull}
                    </div>
                    <div
                      className={`${isOverlapping || isMobile || isShortClass ? "text-[8px]" : "text-xs"} whitespace-normal ${isShortClass ? "mb-0.5 leading-snug" : ""}`}
                    >
                      {cls.startTime} - {cls.endTime}
                    </div>
                    {!isShortClass || duration > 1.5 ? (
                      <>
                        <div
                          className={`${isOverlapping || isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isOverlapping ? "break-words" : "truncate"}`}
                        >
                          {cls.location}
                        </div>
                        <div
                          className={`${isOverlapping || isMobile || isShortClass ? "text-[8px]" : "text-xs"} ${isOverlapping ? "break-words" : "truncate"}`}
                        >
                          {weeksInfo}
                        </div>
                      </>
                    ) : (
                      <div className={`text-[7px] truncate leading-relaxed`}>{cls.location.split(" - ")[0]}</div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-md dark:bg-gray-800 dark:border-gray-700 rounded-lg shadow-lg">
          <div className="space-y-1">
            <p className="font-bold">
              {cls.unitCode} - {activityTypeFull}
            </p>
            <p>{cls.class}</p>
            <p className="text-[#003A6E] dark:text-blue-300">
              {cls.dayFormatted} {cls.startTime} - {cls.endTime}
            </p>
            <p>
              <span className="font-semibold">Location:</span>{" "}
              {cls.locationBuilding ? `${cls.locationBuilding} - ${cls.locationRoom}` : cls.location}
            </p>
            <p>
              <span className="font-semibold">Weeks:</span> {extractWeeksInfo(cls.class)}
            </p>
            {cls.teachingStaff && <p>Staff: {cls.teachingStaff}</p>}
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {weeksInfo}
              </Badge>
              {classMode && (
                <Badge variant="outline" className="text-xs">
                  {classMode}
                </Badge>
              )}
              {isOverlapping && (
                <Badge
                  variant="outline"
                  className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700"
                >
                  Overlapping
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {hasAlternatives
                ? "Click to remove · Drag to another stream to move it"
                : "Click to remove · No other streams for this activity"}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface AlternativeGhostProps {
  entry: TimetableEntry
  position: { top: string; height: string }
  isMobile: boolean
  index: number
  total: number
  willConflict: boolean
}

function AlternativeGhost({ entry, position, isMobile, index, total, willConflict }: AlternativeGhostProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: ghostIdFor(entry),
    data: { alternative: entry },
  })

  const activityTypeFull = formatActivityType(entry.activityType)
  const mode = getClassMode(entry)
  const isShortClass = timeToHour(entry.endTime) - timeToHour(entry.startTime) <= 1
  const isSlice = total > 1
  const sliceWidth = 100 / total

  const palette = willConflict
    ? isOver
      ? "border-amber-500 bg-amber-200/90 text-amber-950 shadow-md dark:border-amber-300 dark:bg-amber-500/40 dark:text-amber-50"
      : "border-amber-400/90 bg-amber-50/95 text-amber-900 dark:border-amber-500/80 dark:bg-amber-950/60 dark:text-amber-200"
    : isOver
      ? "border-[#003A6E] bg-[#003A6E]/15 text-[#003A6E] shadow-md dark:border-blue-200 dark:bg-blue-400/30 dark:text-white"
      : "border-[#003A6E]/70 bg-white/95 text-[#003A6E] dark:border-blue-300/80 dark:bg-gray-900/95 dark:text-blue-100"

  return (
    <div
      ref={setNodeRef}
      data-testid="alternative-ghost"
      data-ghost-id={ghostIdFor(entry)}
      data-ghost-location={entry.location}
      data-ghost-conflict={willConflict ? "true" : "false"}
      title={willConflict ? `${entry.location} - clashes with a class you already have` : entry.location}
      className={`absolute rounded-md border-2 border-dashed p-1 overflow-hidden select-none motion-safe:transition-colors motion-safe:duration-150 ${palette}`}
      style={{
        top: position.top,
        height: position.height,
        width: isSlice ? `calc(${sliceWidth}% - 2px)` : "calc(100% - 4px)",
        left: isSlice ? `calc(${index * sliceWidth}% + 1px)` : "2px",
        zIndex: 30,
      }}
    >
      <div className="flex h-full flex-col justify-between">
        {isSlice ? (
          // Same time, different delivery — the location is what distinguishes
          // these, so give the width to that instead of repeating the time.
          <>
            <div
              className={`font-semibold leading-tight break-words ${isMobile ? "text-[8px]" : "text-[9px]"}`}
              title={`${activityTypeFull} - ${entry.location}`}
            >
              {entry.location}
            </div>
            {mode && (
              <div className="truncate text-[7px] uppercase tracking-wide opacity-80">{mode}</div>
            )}
          </>
        ) : (
          <>
            <div>
              <div
                className={`font-semibold truncate ${isMobile || isShortClass ? "text-[9px]" : "text-[10px]"}`}
                title={activityTypeFull}
              >
                {entry.unitCode} {activityTypeFull}
              </div>
              <div className={`truncate ${isMobile ? "text-[8px]" : "text-[9px]"}`}>
                {entry.startTime} - {entry.endTime}
              </div>
            </div>
            <div>
              <div className={`truncate ${isMobile ? "text-[8px]" : "text-[9px]"}`} title={entry.location}>
                {entry.location}
              </div>
              {mode && <div className="truncate text-[8px] uppercase tracking-wide opacity-80">{mode}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
