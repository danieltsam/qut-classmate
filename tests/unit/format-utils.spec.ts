import { test, expect } from "@playwright/test"
import {
  collapseNearDuplicateClasses,
  doClassesOverlap,
  doTimesOverlap,
  formatActivityType,
  formatLocationSummary,
  parseWeeks,
  timeToMinutes,
  type CollapsedEntry,
} from "../../lib/format-utils"

/**
 * Pure-logic tests for lib/format-utils.ts. Playwright transpiles TS, so these
 * import the app module directly - no browser, no Next.js runtime.
 */

const baseClass = {
  activityType: "Lecture",
  unitCode: "CAB201",
  class: "LEC0101 - Week 1-13 - Internal",
}

test.describe("doClassesOverlap", () => {
  test("true when two classes overlap on the same day", () => {
    const a = { ...baseClass, dayFormatted: "Monday", startTime: "9:00am", endTime: "11:00am" }
    const b = { ...baseClass, dayFormatted: "Monday", startTime: "10:00am", endTime: "12:00pm" }

    expect(doClassesOverlap(a, b)).toBe(true)
  })

  test("false for back-to-back classes on the same day", () => {
    const a = { ...baseClass, dayFormatted: "Monday", startTime: "9:00am", endTime: "11:00am" }
    const b = { ...baseClass, dayFormatted: "Monday", startTime: "11:00am", endTime: "1:00pm" }

    expect(doClassesOverlap(a, b)).toBe(false)
  })

  test("false for overlapping times on different days", () => {
    const a = { ...baseClass, dayFormatted: "Monday", startTime: "9:00am", endTime: "11:00am" }
    const b = { ...baseClass, dayFormatted: "Tuesday", startTime: "9:00am", endTime: "11:00am" }

    expect(doClassesOverlap(a, b)).toBe(false)
  })

  test("treats a class fully contained inside another as an overlap", () => {
    const a = { ...baseClass, dayFormatted: "Wednesday", startTime: "9:00am", endTime: "5:00pm" }
    const b = { ...baseClass, dayFormatted: "Wednesday", startTime: "1:00pm", endTime: "3:00pm" }

    expect(doClassesOverlap(a, b)).toBe(true)
  })

  // Documented behaviour of the current implementation: the same unit's lecture
  // and practical are never counted as a clash, even at identical times. The
  // generator and the weekly grid both rely on this exemption.
  test("same unit, different activity type, same time is not a clash", () => {
    const lecture = { ...baseClass, activityType: "Lecture", dayFormatted: "Thursday", startTime: "1:00pm", endTime: "3:00pm" }
    const practical = { ...baseClass, activityType: "Practical", dayFormatted: "Thursday", startTime: "1:00pm", endTime: "3:00pm" }

    expect(doClassesOverlap(lecture, practical)).toBe(false)
    expect(doClassesOverlap(lecture, practical, true)).toBe(true)
  })
})

test.describe("doTimesOverlap", () => {
  test("is day-aware and range-aware", () => {
    expect(doTimesOverlap("Monday", "1:00pm", "3:00pm", "Monday", "2:00pm", "4:00pm")).toBe(true)
    expect(doTimesOverlap("Monday", "1:00pm", "3:00pm", "Monday", "3:00pm", "5:00pm")).toBe(false)
    expect(doTimesOverlap("Monday", "1:00pm", "3:00pm", "Friday", "1:00pm", "3:00pm")).toBe(false)
  })
})

test.describe("timeToMinutes", () => {
  test("handles pm times", () => {
    expect(timeToMinutes("1:00pm")).toBe(780)
    expect(timeToMinutes("1:30pm")).toBe(810)
  })

  test("handles noon and midnight correctly", () => {
    expect(timeToMinutes("12:00pm")).toBe(720)
    expect(timeToMinutes("12:00am")).toBe(0)
  })

  test("handles am times", () => {
    expect(timeToMinutes("8:00am")).toBe(480)
    expect(timeToMinutes("9:05am")).toBe(545)
  })
})

test.describe("parseWeeks", () => {
  test("expands a week range", () => {
    expect(parseWeeks("Weeks 1-13")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  })

  test("handles a single week", () => {
    expect(parseWeeks("Week 9")).toEqual([9])
  })

  test("handles ampersand-separated weeks", () => {
    expect(parseWeeks("Weeks 3 & 7")).toEqual([3, 7])
  })
})

test.describe("formatActivityType", () => {
  test("maps QUT activity codes to display names", () => {
    expect(formatActivityType("LEC")).toBe("Lecture")
    expect(formatActivityType("TUT")).toBe("Tutorial")
    expect(formatActivityType("PRA")).toBe("Practical")
    expect(formatActivityType("WOR")).toBe("Workshop")
  })

  test("passes through names it does not know", () => {
    expect(formatActivityType("Lecture")).toBe("Lecture")
    expect(formatActivityType("Something New")).toBe("Something New")
  })
})

/**
 * The real shape of the bug: QUT lists CAB201's Thursday lecture once per
 * delivery mode. Same unit, activity, day, time, weeks and staff - only the
 * location differs, so the grid drew three blocks on top of each other.
 */
const cab201Lecture = (location: string, overrides: Partial<CollapsedEntry> = {}) => ({
  class: "LEC01 - (Week 1-13) (Internal Mode)",
  activityType: "Lecture",
  classTitle: "Lecture",
  dayFormatted: "Thursday",
  startTime: "1:00pm",
  endTime: "3:00pm",
  location,
  locationBuilding: location.split(" ")[0] ?? "",
  locationRoom: "",
  teachingStaff: "Dr Jane Citizen",
  unitCode: "CAB201",
  ...overrides,
})

test.describe("collapseNearDuplicateClasses", () => {
  test("folds the CAB201 lecture triple into one entry with two alternates", () => {
    const collapsed = collapseNearDuplicateClasses([
      cab201Lecture("GP B117"),
      cab201Lecture("Virtual"),
      cab201Lecture("Online"),
    ])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].location).toBe("GP B117")
    expect(collapsed[0].alternates).toHaveLength(2)
    expect(collapsed[0].alternates.map((entry) => entry.location)).toEqual(["Virtual", "Online"])
    expect(collapsed[0].locations).toEqual(["GP B117", "Virtual", "Online"])
    expect(collapsed[0].locationSummary).toBe("GP B117 · +2 more")
  })

  test("keeps different days apart", () => {
    const collapsed = collapseNearDuplicateClasses([
      cab201Lecture("GP B117"),
      cab201Lecture("Virtual", { dayFormatted: "Friday" }),
    ])

    expect(collapsed).toHaveLength(2)
    expect(collapsed.every((entry) => entry.alternates.length === 0)).toBe(true)
  })

  test("keeps different start times apart", () => {
    const collapsed = collapseNearDuplicateClasses([
      cab201Lecture("GP B117"),
      cab201Lecture("Virtual", { startTime: "2:00pm" }),
    ])

    expect(collapsed).toHaveLength(2)
  })

  test("keeps different weeks apart", () => {
    const collapsed = collapseNearDuplicateClasses([
      cab201Lecture("GP B117"),
      cab201Lecture("Virtual", { class: "LEC01 - (Week 1-6) (Internal Mode)" }),
    ])

    expect(collapsed).toHaveLength(2)
  })

  test("keeps different activity types apart even when the slot matches", () => {
    const collapsed = collapseNearDuplicateClasses([
      cab201Lecture("GP B117"),
      cab201Lecture("Virtual", { activityType: "Consultation" }),
    ])

    expect(collapsed).toHaveLength(2)
  })

  test("collapses on location alone - a differing staff string does not block it", () => {
    const collapsed = collapseNearDuplicateClasses([
      cab201Lecture("GP B117"),
      cab201Lecture("Virtual", { teachingStaff: "Dr Jane Citizan" }),
    ])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].alternates).toHaveLength(1)
  })

  test("preserves input order and lets the first entry represent the slot", () => {
    const practical = (location: string, dayFormatted: string) =>
      cab201Lecture(location, { activityType: "Practical", dayFormatted })

    const collapsed = collapseNearDuplicateClasses([
      practical("GP B117", "Monday"),
      cab201Lecture("Virtual"),
      practical("GP B117", "Tuesday"),
      cab201Lecture("Online"),
      practical("GP B117", "Monday"),
    ])

    expect(collapsed.map((entry) => `${entry.activityType}-${entry.dayFormatted}`)).toEqual([
      "Practical-Monday",
      "Lecture-Thursday",
      "Practical-Tuesday",
    ])
    expect(collapsed[0].location).toBe("GP B117")
    expect(collapsed[1].alternates.map((entry) => entry.location)).toEqual(["Online"])
  })

  test("drops exact duplicate records instead of listing them as alternates", () => {
    const collapsed = collapseNearDuplicateClasses([cab201Lecture("GP B117"), cab201Lecture("GP B117")])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].alternates).toHaveLength(0)
    expect(collapsed[0].locationSummary).toBe("GP B117")
  })

  test("passes empty and single-entry input through unchanged", () => {
    expect(collapseNearDuplicateClasses([])).toEqual([])

    const single = collapseNearDuplicateClasses([cab201Lecture("GP B117")])
    expect(single).toHaveLength(1)
    expect(single[0].location).toBe("GP B117")
    expect(single[0].alternates).toEqual([])
    expect(single[0].locationSummary).toBe("GP B117")
  })
})

test.describe("formatLocationSummary", () => {
  test("is terse enough for a small grid block", () => {
    expect(formatLocationSummary(["GP B117"])).toBe("GP B117")
    expect(formatLocationSummary(["GP B117", "Virtual", "Online"])).toBe("GP B117 · +2 more")
    expect(formatLocationSummary([])).toBe("")
  })
})
