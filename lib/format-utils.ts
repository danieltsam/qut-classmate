// Activity type mapping
export const activityTypeMap: Record<string, string> = {
  STU: "Studio",
  TUT: "Tutorial",
  LEC: "Lecture",
  PRC: "Practical",
  AS1: "Assessment 1",
  AS2: "Assessment 2",
  WOR: "Workshop",
  PRA: "Practical",
  SEM: "Seminar",
  FLD: "Field Trip",
  LAB: "Laboratory",
}

// Day name mapping
const dayMap: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
}

// Format activity type
export function formatActivityType(type: string): string {
  return activityTypeMap[type] || type
}

// Format day name
export function formatDayName(day: string): string {
  return dayMap[day] || day
}

// Parse and format location to show building and room
export function parseLocation(location: string): { building: string; room: string } {
  // Default values
  let building = ""
  let room = location

  // If the location has a hyphen, it may already be in the format "Building - Room"
  if (location.includes(" - ")) {
    const parts = location.split(" - ")
    building = parts[0]
    room = parts[1]
  }
  // Otherwise, try to extract the room number (usually the last part)
  else {
    const parts = location.split(" ")
    if (parts.length > 1) {
      // The last part is likely the room number
      room = parts[parts.length - 1]
      // The rest might be the building name
      building = parts.slice(0, parts.length - 1).join(" ")
    }
  }

  return { building, room }
}

// Format location for display
export function formatLocation(location: string, building?: string): string {
  const parsedLocation = parseLocation(location)
  const buildingName = building || parsedLocation.building

  if (buildingName) {
    return `${buildingName} - ${parsedLocation.room}`
  }

  return parsedLocation.room || location
}

// Format teaching staff names to fix spacing after commas
export function formatTeachingStaff(staff: string): string {
  return staff.replace(/\s+,\s+/g, ", ")
}

// Convert time string to minutes for comparison
export function timeToMinutes(timeStr: string): number {
  const isPM = timeStr.toLowerCase().includes("pm")
  const [hourStr, minuteStr] = timeStr.replace(/[ap]m/i, "").split(":")

  let hour = Number.parseInt(hourStr, 10)
  const minute = Number.parseInt(minuteStr, 10)

  // Convert to 24-hour format
  if (isPM && hour < 12) hour += 12
  if (!isPM && hour === 12) hour = 0

  return hour * 60 + minute
}

// Check if two time ranges overlap
export function doTimesOverlap(
  day1: string,
  start1: string,
  end1: string,
  day2: string,
  start2: string,
  end2: string,
): boolean {
  if (day1 !== day2) return false

  const start1Minutes = timeToMinutes(start1)
  const end1Minutes = timeToMinutes(end1)
  const start2Minutes = timeToMinutes(start2)
  const end2Minutes = timeToMinutes(end2)

  return (
    (start1Minutes >= start2Minutes && start1Minutes < end2Minutes) ||
    (end1Minutes > start2Minutes && end1Minutes <= end2Minutes) ||
    (start1Minutes <= start2Minutes && end1Minutes >= end2Minutes)
  )
}

// Generate a unique ID for a class
export function generateClassId(classEntry: {
  unitCode?: string
  activityType: string
  dayFormatted: string
  startTime: string
  endTime: string
}): string {
  return `${classEntry.unitCode || ""}-${classEntry.activityType}-${classEntry.dayFormatted}-${classEntry.startTime}-${classEntry.endTime}`
}

