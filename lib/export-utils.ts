import type { TimetableEntry } from "./types"

// Function to convert time string to Date object
function timeStringToDate(timeStr: string, dayStr: string): Date {
  // Map day strings to day numbers (0 = Sunday, 1 = Monday, etc.)
  const dayMap: Record<string, number> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 0,
    // Support for abbreviated day names for backward compatibility
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
    SUN: 0,
  }

  // Parse the time string
  const isPM = timeStr.toLowerCase().includes("pm")
  const [hourStr, minuteStr] = timeStr.replace(/[ap]m/i, "").split(":")

  let hour = Number.parseInt(hourStr, 10)
  const minute = Number.parseInt(minuteStr, 10)

  // Convert to 24-hour format
  if (isPM && hour < 12) hour += 12
  if (!isPM && hour === 12) hour = 0

  // Create a date for the next occurrence of the specified day
  const date = new Date()
  const currentDay = date.getDay()
  const targetDay = dayMap[dayStr]

  // Calculate days to add to get to the target day
  let daysToAdd = targetDay - currentDay
  if (daysToAdd <= 0) daysToAdd += 7 // If target day is today or earlier, go to next week

  date.setDate(date.getDate() + daysToAdd)
  date.setHours(hour, minute, 0, 0)

  return date
}

// Function to format date for iCalendar
function formatDateForICS(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/g, "")
}

// Function to export timetable entries to ICS file
export function exportToICS(entries: TimetableEntry[]): void {
  let icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//QUT Timetable Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]

  entries.forEach((entry, index) => {
    // Use dayFormatted if available, otherwise fall back to day
    const dayValue = entry.dayFormatted || entry.day

    const startDate = timeStringToDate(entry.startTime, dayValue)
    const endDate = timeStringToDate(entry.endTime, dayValue)

    const startDateStr = formatDateForICS(startDate)
    const endDateStr = formatDateForICS(endDate)

    const summary = entry.unitCode
      ? `${entry.unitCode} - ${entry.classTitle || entry.activityType}`
      : `${entry.classTitle || entry.activityType} - ${entry.class}`

    icsContent = [
      ...icsContent,
      "BEGIN:VEVENT",
      `UID:qut-timetable-${index}@quttimetableplanner`,
      `DTSTAMP:${formatDateForICS(new Date())}`,
      `DTSTART:${startDateStr}`,
      `DTEND:${endDateStr}`,
      `SUMMARY:${summary}`,
      `LOCATION:${entry.location}`,
      `DESCRIPTION:${entry.class}\\nTeaching Staff: ${entry.teachingStaff}`,
      "END:VEVENT",
    ]
  })

  icsContent.push("END:VCALENDAR")

  // Create and download the ICS file
  const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar" })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = "qut-timetable.ics"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

