export interface TimetableEntry {
  class: string
  activityType: string
  classTitle: string // New field for the class title
  dayFormatted: string
  startTime: string
  endTime: string
  location: string
  locationBuilding: string // Added for building name
  locationRoom: string // Added for room number
  teachingStaff: string
  duration?: number // Used for calendar view
  unitCode?: string
  unitName?: string // Added for unit name
  teachingPeriodId?: string
  day?: string // For backward compatibility
}

export interface SelectedClass extends TimetableEntry {
  id: string
  unitCode: string
}

export interface Unit {
  unitCode: string
  teachingPeriodId: string
  teachingPeriodName: string
  classes: TimetableEntry[]
  groupedClasses: Record<string, TimetableEntry[]>
}

export interface TeachingPeriod {
  id: string
  name: string
  campus?: string
}
