import type { TeachingPeriod } from "./types"

export const teachingPeriods: TeachingPeriod[] = [
  // Semester 2 2026 - Current/Default (QUT Virtual 4)
  { id: "4381474", name: "Semester 2, 2026", campus: "All Campuses", dateRange: "Jul 2026 to Nov 2026" },

  // Semester 1 2026 (QUT Virtual 4)
  { id: "4381471", name: "Semester 1, 2026", campus: "All Campuses", dateRange: "Feb 2026 to Jun 2026" },

  // Exchange semesters 2026
  { id: "4734572", name: "Exchange Semester 1, 2026", campus: "All Campuses", dateRange: "Feb 2026 to Jun 2026" },
  { id: "4734574", name: "Exchange Semester 2, 2026", campus: "All Campuses", dateRange: "Jul 2026 to Nov 2026" },

  // Legacy 2025 periods (may no longer be available)
  { id: "621052", name: "Semester 2, 2025", campus: "All Campuses", dateRange: "21 Jul 2025 to 15 Nov 2025" },
  { id: "621050", name: "Semester 1, 2025", campus: "Gardens Point", dateRange: "24 Feb 2025 to 21 Jun 2025" },
  { id: "621051", name: "Semester 1, 2025", campus: "Kelvin Grove", dateRange: "24 Feb 2025 to 21 Jun 2025" },
  { id: "4732918", name: "6 Week Semester A, 2025", campus: "Gardens Point", dateRange: "24 Feb 2025 to 04 Apr 2025" },
  { id: "4732919", name: "6 Week Semester A, 2025", campus: "Kelvin Grove", dateRange: "24 Feb 2025 to 04 Apr 2025" },
  { id: "4733019", name: "6 Week Semester B, 2025", campus: "Gardens Point", dateRange: "22 Apr 2025 to 30 May 2025" },
  { id: "4733024", name: "6 Week Semester B, 2025", campus: "Kelvin Grove", dateRange: "22 Apr 2025 to 30 May 2025" },
]

const VIRTUAL4_TEACHING_PERIOD_IDS = new Set([
  "4381471",
  "4381474",
  "4734572",
  "4734574",
])

// Helper function to get teaching period by ID
export function getTeachingPeriodById(id: string): TeachingPeriod | undefined {
  return teachingPeriods.find((period) => period.id === id)
}

// Helper function to get current teaching period (defaults to Semester 2 2025)
export function getCurrentTeachingPeriod(): TeachingPeriod {
  return teachingPeriods[0] // Semester 2 2025 (Gardens Point)
}

// Helper function to format teaching period for display
export function formatTeachingPeriod(period: TeachingPeriod): string {
  return `${period.name} (${period.dateRange})`
}

export function getTeachingPeriodName(id: string): string {
  const period = teachingPeriods.find((p) => p.id === id)
  return period ? period.name : id
}

export function getTeachingPeriodId(name: string, campus?: string): string | undefined {
  if (campus) {
    const period = teachingPeriods.find((p) => p.name === name && p.campus === campus)
    return period?.id
  } else {
    const period = teachingPeriods.find((p) => p.name === name)
    return period?.id
  }
}

// Add back the getTeachingPeriodWithCampus function
export function getTeachingPeriodWithCampus(id: string): string {
  const period = teachingPeriods.find((p) => p.id === id)
  if (!period) return id
  return period.campus ? `${period.name} @ ${period.campus}` : period.name
}

// QUT Virtual 4 SolrQuest endpoint (guest session + CSRF token)
export function shouldUseVirtual4API(teachingPeriodId: string): boolean {
  return VIRTUAL4_TEACHING_PERIOD_IDS.has(teachingPeriodId)
}

// Legacy mytimetable.qut.edu.au API (currently authenticated / unavailable)
export function shouldUseNewAPI(teachingPeriodId: string): boolean {
  return teachingPeriodId === "621052"
}
