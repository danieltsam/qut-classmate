import type { TeachingPeriod } from "./types"

// Update the teachingPeriods array to include the 6-week semesters
export const teachingPeriods: TeachingPeriod[] = [
  { id: "621050", name: "Semester 1, 2025", campus: "Gardens Point", dateRange: "24 Feb 2025 to 21 Jun 2025" },
  { id: "621051", name: "Semester 1, 2025", campus: "Kelvin Grove", dateRange: "24 Feb 2025 to 21 Jun 2025" },
  { id: "4732918", name: "6 Week Semester A, 2025", campus: "Gardens Point", dateRange: "24 Feb 2025 to 04 Apr 2025" },
  { id: "4732919", name: "6 Week Semester A, 2025", campus: "Kelvin Grove", dateRange: "24 Feb 2025 to 04 Apr 2025" },
  { id: "4733019", name: "6 Week Semester B, 2025", campus: "Gardens Point", dateRange: "22 Apr 2025 to 30 May 2025" },
  { id: "4733024", name: "6 Week Semester B, 2025", campus: "Kelvin Grove", dateRange: "22 Apr 2025 to 30 May 2025" },
]

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

// Update the getTeachingPeriodWithCampus function to use @ instead of -
export function getTeachingPeriodWithCampus(id: string): string {
  const period = teachingPeriods.find((p) => p.id === id)
  if (!period) return id
  return period.campus ? `${period.name} @ ${period.campus}` : period.name
}
