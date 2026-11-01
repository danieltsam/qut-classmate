import { test, expect, gotoApp } from "../helpers"

/**
 * Smoke test: every top-level tab renders and switches, with no console errors
 * or uncaught exceptions (the shared fixture fails the test if any occur).
 *
 * The tab list is read from the DOM rather than hardcoded, so extra product tabs
 * (Campus Explorer arrived after this suite) do not silently go untested.
 */

test.describe("top-level navigation", () => {
  test("all tabs render and switch cleanly", async ({ page }) => {
    await gotoApp(page)

    await expect(page.getByRole("heading", { level: 1, name: "QUT Classmate" })).toBeVisible()

    const tabList = page.locator('[role="tablist"]').first()
    const topLevelTabs = tabList.getByRole("tab")

    // Unit Reviews was removed with the Supabase dependency; Campus Explorer and
    // Course Planner replaced it.
    await expect(page.getByRole("tab", { name: "Unit Search" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Timetable Creator" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Campus Explorer" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Course Planner" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Unit Reviews" })).toHaveCount(0)

    const tabNames = (await topLevelTabs.allInnerTexts()).map((name) => name.trim())
    expect(tabNames).toEqual(["Timetable Creator", "Campus Explorer", "Course Planner", "Unit Search"])

    // Timetable Creator leads, because Unit Search is the narrowest of the four.
    await expect(page.getByRole("tab", { name: "Timetable Creator" })).toHaveAttribute("data-state", "active")

    for (const name of tabNames) {
      await page.getByRole("tab", { name, exact: true }).click()
      await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("data-state", "active")

      if (name === "Timetable Creator") {
        await expect(page.getByRole("heading", { level: 2, name: "Timetable Creator" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Auto Generate Timetable" })).toBeVisible()
      }
      if (name === "Campus Explorer") {
        await expect(page.getByText("My Day")).toBeVisible()
        await expect(page.getByPlaceholder("Search unit, staff…")).toBeVisible()
      }
      if (name === "Unit Search") {
        await expect(page.getByText("Search Unit Schedule")).toBeVisible()
      }
      if (name === "Course Planner") {
        await expect(page.getByText("Pick a course, then a pathway, then a study plan", { exact: false })).toBeVisible()
      }
    }
  })
})
