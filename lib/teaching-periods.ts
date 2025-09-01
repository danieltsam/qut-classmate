import type { TeachingPeriod } from "./types"

export const teachingPeriods: TeachingPeriod[] = [
  // Semester 2 2025 - Current/Default (Combined campuses)
  { id: "621052", name: "Semester 2, 2025", campus: "All Campuses", dateRange: "21 Jul 2025 to 15 Nov 2025" },

  // Semester 1 2025
  { id: "621050", name: "Semester 1, 2025", campus: "Gardens Point", dateRange: "24 Feb 2025 to 21 Jun 2025" },
  { id: "621051", name: "Semester 1, 2025", campus: "Kelvin Grove", dateRange: "24 Feb 2025 to 21 Jun 2025" },

  // 6 Week Semesters
  { id: "4732918", name: "6 Week Semester A, 2025", campus: "Gardens Point", dateRange: "24 Feb 2025 to 04 Apr 2025" },
  { id: "4732919", name: "6 Week Semester A, 2025", campus: "Kelvin Grove", dateRange: "24 Feb 2025 to 04 Apr 2025" },
  { id: "4733019", name: "6 Week Semester B, 2025", campus: "Gardens Point", dateRange: "22 Apr 2025 to 30 May 2025" },
  { id: "4733024", name: "6 Week Semester B, 2025", campus: "Kelvin Grove", dateRange: "22 Apr 2025 to 30 May 2025" },
]

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

// Helper function to check if a teaching period should use the new API
export function shouldUseNewAPI(teachingPeriodId: string): boolean {
  // Use new API for Semester 2 2025 (combined campuses)
  return teachingPeriodId === "621052"
}
