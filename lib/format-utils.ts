// Activity type mapping
export const activityTypeMap: Record<string, string> = {
  STU: "Studio",
  TUT: "Tutorial",
  TU1: "Tutorial 1",
  TU2: "Tutorial 2",
  LEC: "Lecture",
  LC1: "Lecture 1",
  LC2: "Lecture 2",
  PRC: "Practical",
  PR1: "Practical 1",
  PR2: "Practical 2",
  PR3: "Practical 3",
  AS1: "Assessment 1",
  AS2: "Assessment 2",
  WOR: "Workshop",
  PRA: "Practical",
  LAB: "Laboratory",
  CON: "Consultation",
  ASS: "Assessment",
  CLN: "Clinical",
  COA: "Community Activity",
  FTR: "Field Trip / Field Training",
  GSL: "Guided Self Learning",
  HCL: "Hospital Clinical Learning",
  PFC: "Portfolio Class",
  SIM: "Simulation",
  VIRTUAL: "Virtual",
  RoomsPlus: "RoomsPlus Booking",
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

// Update the extractWeeksInfo function to properly handle ranges like "Weeks 1-13"
export function extractWeeksInfo(classInfo: string): string {
  if (!classInfo) return "Weeks 1-13"

  // Try to match week range pattern (e.g., "Weeks 1-13" or "Week 1-12")
  const weekRangeMatch = classInfo.match(/Week[s]?\s+(\d+)[-–](\d+)/i)
  if (weekRangeMatch && weekRangeMatch.length >= 3) {
    return `Weeks ${weekRangeMatch[1]}-${weekRangeMatch[2]}`
  }

  // Try to match parentheses pattern with commas (e.g., "(Week 3, 7)")
  const parenthesesMatch = classInfo.match(/$$Week[s]?\s+(\d+(?:,\s*\d+)*)(?:\s*&\s*\d+)*$$/i)
  if (parenthesesMatch && parenthesesMatch.length >= 2) {
    console.log("Parentheses match found:", parenthesesMatch[1])
    // Format with commas and & for the final week
    return formatWeekNumbers(parenthesesMatch[1])
  }

  // Try to match simple "Week X, Y" pattern without parentheses
  const simpleMatch = classInfo.match(/Week[s]?\s+(\d+(?:,\s*\d+)*(?:\s*&\s*\d+)*)/i)
  if (simpleMatch && simpleMatch.length >= 2) {
    console.log("Simple match found:", simpleMatch[1])
    // Format with commas and & for the final week
    return formatWeekNumbers(simpleMatch[1])
  }

  // Try to match multiple individual weeks (e.g., "Weeks 1, 3, 5")
  const multipleWeeksMatch = classInfo.match(/Weeks\s+(\d+(?:,\s*\d+)+)(?:\s*&\s*\d+)*/i)
  if (multipleWeeksMatch && multipleWeeksMatch.length >= 2) {
    // Format with commas and & for the final week
    return `Weeks ${formatWeekNumbers(multipleWeeksMatch[1])}`
  }

  // Try to match single week pattern (e.g., "Week 9")
  const singleWeekMatch = classInfo.match(/Week\s+(\d+)(?!\s*[-–]|\s*,)/i)
  if (singleWeekMatch && singleWeekMatch.length >= 2) {
    return `Week ${singleWeekMatch[1]}`
  }

  // Default to "Weeks 1-13" if no specific pattern is found
  return "Weeks 1-13"
}

// Helper function to format week numbers with commas and & for the final week
function formatWeekNumbers(weekStr: string): string {
  // Extract all numbers from the string
  const numbers = weekStr
    .split(/[,&\s]+/)
    .filter((n) => /^\d+$/.test(n))
    .map(Number)

  if (numbers.length === 0) return weekStr
  if (numbers.length === 1) return `Week ${numbers[0]}`

  // Sort the numbers
  numbers.sort((a, b) => a - b)

  // Format with commas and & for the final week
  const formattedWeeks =
    numbers.length > 1 ? numbers.slice(0, -1).join(", ") + " & " + numbers[numbers.length - 1] : numbers[0].toString()

  return `Week${numbers.length > 1 ? "s" : ""} ${formattedWeeks}`
}

// Update the parseWeeks function to handle the new format

// Parse weeks into an array of week numbers
export function parseWeeks(weeksInfo: string): number[] {
  const weeks: number[] = []

  // Handle range format "Weeks X-Y"
  const rangeMatch = weeksInfo.match(/Weeks\s+(\d+)-(\d+)/i)
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10)
    const end = Number.parseInt(rangeMatch[2], 10)
    for (let i = start; i <= end; i++) {
      weeks.push(i)
    }
    return weeks
  }

  // Handle single week format "Week X"
  const singleMatch = weeksInfo.match(/Week\s+(\d+)/i)
  if (singleMatch) {
    weeks.push(Number.parseInt(singleMatch[1], 10))
    return weeks
  }

  // Handle comma-separated or ampersand-separated weeks "Weeks X, Y, Z" or "Weeks X, Y & Z"
  const commaMatch = weeksInfo.match(/Weeks\s+([\d,\s&]+)/i)
  if (commaMatch) {
    // Split by both commas and ampersands
    const weekNumbers = commaMatch[1].split(/[,&]/).map((w) => Number.parseInt(w.trim(), 10))
    return weekNumbers.filter((w) => !isNaN(w))
  }

  // Default to weeks 1-13 if no pattern matches
  for (let i = 1; i <= 13; i++) {
    weeks.push(i)
  }

  return weeks
}

// Check if two classes overlap in time AND weeks
export function doClassesOverlap(
  class1: {
    dayFormatted: string
    startTime: string
    endTime: string
    class: string
    activityType?: string
    unitCode?: string
  },
  class2: {
    dayFormatted: string
    startTime: string
    endTime: string
    class: string
    activityType?: string
    unitCode?: string
  },
  ignoreActivityType = false,
): boolean {
  // First check if they're on the same day
  if (class1.dayFormatted !== class2.dayFormatted) return false

  // If they have the same unit code but different activity types, don't consider them as overlapping
  if (
    !ignoreActivityType &&
    class1.unitCode &&
    class2.unitCode &&
    class1.unitCode === class2.unitCode &&
    class1.activityType &&
    class2.activityType &&
    class1.activityType !== class2.activityType
  ) {
    return false
  }

  // Check if times overlap
  const timeOverlap = doTimesOverlap(
    class1.dayFormatted,
    class1.startTime,
    class1.endTime,
    class2.dayFormatted,
    class2.startTime,
    class2.endTime,
  )

  if (!timeOverlap) return false

  // Extract weeks information
  const weeks1 = parseWeeks(extractWeeksInfo(class1.class))
  const weeks2 = parseWeeks(extractWeeksInfo(class2.class))

  // Check if any weeks overlap
  return weeks1.some((week) => weeks2.includes(week))
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
  class: string
}): string {
  // Extract week information to include in the ID
  const weekInfo = extractWeeksInfo(classEntry.class)

  return `${classEntry.unitCode || ""}-${classEntry.activityType}-${classEntry.dayFormatted}-${classEntry.startTime}-${classEntry.endTime}-${weekInfo}`
}

// Helper function to combine week information
const combineWeekInfo = (week1: string, week2: string): string => {
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
    // Format with commas and & for the final week
    const formattedWeeks = allNumbers.slice(0, -1).join(", ") + " & " + allNumbers[allNumbers.length - 1]
    return `Weeks ${formattedWeeks}`
  }
}
