import { test, expect, type APIRequestContext } from "@playwright/test"

/**
 * Contract tests for POST /api/timetable/search.
 *
 * These hit QUT Virtual 4 through our own route, so they are integration tests:
 * the upstream can be slow, hence the generous timeout and the single retry
 * configured in playwright.config.ts.
 */

const ENDPOINT = "/api/timetable/search"
const UNIT_CODE = "CAB201"
const SEMESTER_2_2026 = "4381474"

const TIMETABLE_ENTRY_KEYS = [
  "class",
  "activityType",
  "classTitle",
  "dayFormatted",
  "day",
  "startTime",
  "endTime",
  "location",
  "locationBuilding",
  "locationRoom",
  "teachingStaff",
  "unitCode",
  "teachingPeriodId",
] as const

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

/** Retries once if the upstream returned a transport/upstream error rather than a contract break. */
async function fetchTimetable(request: APIRequestContext, unitCode: string, teachingPeriodId?: string) {
  const data = teachingPeriodId ? { unitCode, teachingPeriodId } : { unitCode }
  let response = await request.post(ENDPOINT, { data })
  let body = await response.json()

  if (response.status() >= 500) {
    // Upstream QUT slowness surfaces as our own 500 - worth one more attempt.
    response = await request.post(ENDPOINT, { data })
    body = await response.json()
  }

  return { response, body }
}

test.describe("POST /api/timetable/search", () => {
  test("returns real classes for CAB201 in Semester 2 2026", async ({ request }) => {
    const { response, body } = await fetchTimetable(request, UNIT_CODE, SEMESTER_2_2026)

    expect(response.status()).toBe(200)
    expect(body.error).toBe(false)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)

    for (const entry of body.data) {
      for (const key of TIMETABLE_ENTRY_KEYS) {
        expect(entry, `entry missing key "${key}"`).toHaveProperty(key)
        expect(entry[key], `entry has null/undefined "${key}": ${JSON.stringify(entry)}`).not.toBeNull()
        expect(entry[key], `entry has null/undefined "${key}": ${JSON.stringify(entry)}`).not.toBeUndefined()
      }

      // Fields the UI actually renders must have content; locationBuilding /
      // locationRoom are legitimately empty for Online and Virtual classes.
      for (const key of ["class", "activityType", "dayFormatted", "startTime", "endTime", "unitCode"]) {
        expect(String(entry[key]).trim(), `empty "${key}" in ${JSON.stringify(entry)}`).not.toBe("")
      }

      expect(entry.startTime).toMatch(/\d(:\d\d)?[ap]m$/i)
      expect(entry.endTime).toMatch(/\d(:\d\d)?[ap]m$/i)
      expect(DAYS).toContain(entry.dayFormatted)
      expect(entry.unitCode).toBe(UNIT_CODE)
    }
  })

  test("returns a mix of lectures and practicals for CAB201", async ({ request }) => {
    const { body } = await fetchTimetable(request, UNIT_CODE, SEMESTER_2_2026)

    expect(body.error).toBe(false)

    const activityTypes = new Set<string>(body.data.map((entry: { activityType: string }) => entry.activityType))
    expect(activityTypes.has("Lecture"), `no Lecture in ${[...activityTypes].join(", ")}`).toBe(true)
    expect(activityTypes.has("Practical"), `no Practical in ${[...activityTypes].join(", ")}`).toBe(true)
  })

  test("rejects an empty JSON body with 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, { data: {} })

    expect(response.status()).toBe(400)
    expect((await response.json()).error).toBe(true)
  })

  test("rejects a missing teachingPeriodId with 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, { data: { unitCode: UNIT_CODE } })

    expect(response.status()).toBe(400)
    expect((await response.json()).error).toBe(true)
  })

  test("returns an error payload (not a 500) for an unknown unit", async ({ request }) => {
    const { response, body } = await fetchTimetable(request, "ZZZ999", SEMESTER_2_2026)

    expect(response.status()).toBeLessThan(500)
    expect(body.error).toBe(true)
    expect(typeof body.message).toBe("string")
    expect(body.message.length).toBeGreaterThan(0)
  })

  /**
   * CAB202 is the worked example of a code QUT will not talk about: its search
   * page lists only EGH449, so there is no class link for CAB202 at all. But
   * QUT answers CAB202 and ZZZ999 with the same "Page not found" page, and
   * CAB202 is not in our own unit index either, so we cannot claim it was
   * retired. The honest answer points at the code.
   */
  test("a code we have no record of is reported as not found, not as retired", async ({ request }) => {
    const { body } = await fetchTimetable(request, "CAB202", SEMESTER_2_2026)

    expect(body.error).toBe(true)
    expect(body.message).toMatch(/could not find CAB202/i)
    expect(body.message).not.toMatch(/no longer offered/i)
    expect(body.message).not.toMatch(/different semester/i)
    expect(body.message).not.toMatch(/no classes/i)
  })

  /**
   * SEB202 is the mirror case: it is in data/known-units.json but QUT's search
   * page carries no class link for it, so "no longer offered" is a claim the
   * index actually supports.
   */
  test("a unit we do have a record of and QUT no longer runs says it is no longer offered", async ({
    request,
  }) => {
    const { body } = await fetchTimetable(request, "SEB202", SEMESTER_2_2026)

    expect(body.error).toBe(true)
    expect(body.message).toMatch(/SEB202 is no longer offered by QUT/i)
    expect(body.message).not.toMatch(/could not find/i)
    expect(body.message).not.toMatch(/no classes/i)
  })

  /**
   * EUB111 runs in Semester 1 only. The page carries a class link for it, just
   * not for the period being asked about, so this must not collapse into the
   * retired case above.
   */
  test("a unit not offered in the requested period names a period it does run in", async ({ request }) => {
    const { body } = await fetchTimetable(request, "EUB111", SEMESTER_2_2026)

    expect(body.error).toBe(true)
    expect(body.message).toMatch(/not offered in that semester/i)
    expect(body.message).not.toMatch(/no longer offered/i)
    // The sentence names a semester when the page tells us one.
    expect(body.message).toMatch(/Semester \d, \d{4}/)
  })

  test("still returns all 14 CAB201 classes in Semester 2 2026", async ({ request }) => {
    const { body } = await fetchTimetable(request, UNIT_CODE, SEMESTER_2_2026)

    expect(body.error).toBe(false)
    expect(body.data).toHaveLength(14)
  })

  // A bodyless request used to reach `await req.json()` inside the route's main
  // try/catch and come back as a 500 "Unable to fetch timetable data". The route
  // now parses the body separately and returns 400 for malformed input.
  test("a bodyless request is a 400, not a 500", async ({ request }) => {
    const response = await request.post(ENDPOINT)

    expect(response.status()).toBe(400)
  })

  test("a malformed JSON body is a 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: "{not json",
    })

    expect(response.status()).toBe(400)
  })
})
