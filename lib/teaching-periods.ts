import type { TeachingPeriod } from "./types"

export const teachingPeriods: TeachingPeriod[] = [
  { id: "621050", name: "Semester 1, 2025", campus: "Gardens Point" },
  { id: "621051", name: "Semester 1, 2025", campus: "Kelvin Grove" }
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

export function getTeachingPeriodWithCampus(id: string): string {
  const period = teachingPeriods.find((p) => p.id === id)
  if (!period) return id
  return period.campus ? `${period.name} - ${period.campus}` : period.name
}

