import { test, expect, gotoApp } from "../helpers"

/**
 * Regression net for the Course Planner white-screening the app.
 *
 * A real crash shipped past the other specs:
 *   TypeError: Cannot read properties of undefined (reading 'filter')
 *   at SemesterColumn — components/course-planner.tsx
 * `SemesterColumn` was handed `undefined` where it expected `slots: PlanSlot[]`,
 * and there is no error boundary above the planner, so the whole page died. The
 * existing specs only ever exercised BS05 and IN01 from freshly seeded state, so
 * nothing visited a course/plan shape whose semester had no slot entry.
 *
 * These tests therefore sweep several genuinely different courses, including the
 * ones with no plan data and the double degree whose notes are never fillable.
 */

type Case = { code: string; expectColumns: boolean; note: string }

const CASES: Case[] = [
  { code: "BS05", expectColumns: true, note: "single degree, slot-heavy plan" },
  { code: "IN01", expectColumns: true, note: "single degree, multiple majors" },
  { code: "EN01", expectColumns: true, note: "many pathways, option lists" },
  { code: "IX22", expectColumns: true, note: "double degree, other-degree notes" },
  { code: "AB01", expectColumns: true, note: "small plan, no option slots" },
  { code: "ST01", expectColumns: true, note: "full-time and part-time progressions" },
]

test.describe("course planner robustness", () => {
  for (const { code, expectColumns, note } of CASES) {
    test(`${code} renders without an uncaught error (${note})`, async ({ page }) => {
      // Seed the saved selection before the app loads, the same way a returning
      // visitor arrives: their previously chosen course is restored from storage.
      await page.addInitScript((courseCode) => {
        window.localStorage.setItem(
          "qut-classmate:course-planner:selection",
          JSON.stringify({ courseCode, specIndex: 0 }),
        )
      }, code)

      await gotoApp(page)
      await page.getByRole("tab", { name: "Course Planner" }).click()

      // The heading is rendered by the planner itself, so its appearance proves
      // the component tree mounted rather than being replaced by the error overlay.
      await expect(page.getByText("Pick a course, then a pathway, then a study plan", { exact: false })).toBeVisible({
        timeout: 60_000,
      })

      // Wait for the board rather than counting synchronously: under load the
      // heading paints well before the columns do, and an immediate count reads 0.
      if (expectColumns) {
        await expect(
          page.locator("[data-semester-id]").first(),
          `${code} should render semester columns`,
        ).toBeVisible({ timeout: 45_000 })
      }

      // The shared fixture already fails on pageerror/console.error; assert the
      // Next dev error overlay is absent too, because a render throw produces the
      // overlay without necessarily logging through console.error.
      await expect(page.locator("nextjs-portal")).toHaveCount(0)
    })
  }

  test("a stale saved plan with missing fields does not crash the planner", async ({ page }) => {
    // Older builds persisted a plan without `notes`, and the slot derivation reads
    // that field. A returning visitor carrying that state must not white-screen.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "qut-classmate:course-planner:selection",
        JSON.stringify({ courseCode: "BS05", specIndex: 0 }),
      )
    })

    await gotoApp(page)
    await page.getByRole("tab", { name: "Course Planner" }).click()
    await expect(page.getByText("Pick a course, then a pathway, then a study plan", { exact: false })).toBeVisible({
      timeout: 60_000,
    })

    // Find whichever plan key the app is using, then corrupt it the way an older
    // build would have written it: semesters present, but `notes` and unit arrays
    // partial.
    await page.evaluate(() => {
      const prefix = "qut-classmate:course-planner:plan:"
      const key = Object.keys(window.localStorage).find((k) => k.startsWith(prefix))
      if (!key) return
      const current = JSON.parse(window.localStorage.getItem(key) ?? "[]")
      const stale = current.map((semester: Record<string, unknown>) => {
        const { notes, ...rest } = semester as { notes?: unknown }
        return rest
      })
      window.localStorage.setItem(key, JSON.stringify(stale))
    })

    // A reload returns the app to its default tab, so the planner has to be
    // re-opened before anything about it can be asserted.
    await page.reload()
    await expect(page.locator("main[data-hydrated='true']")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("tab", { name: "Course Planner" }).click()
    await expect(page.getByText("Pick a course, then a pathway, then a study plan", { exact: false })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator("nextjs-portal")).toHaveCount(0)
  })
})
