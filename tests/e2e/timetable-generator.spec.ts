import { test, expect, gotoApp, readGeneratedCards, findOverlaps } from "../helpers"

/**
 * The auto timetable generator is a randomised Monte Carlo optimiser whose
 * functions are closures inside the React component, so it can only be driven
 * through the UI. Nothing here asserts on specific classes or times - only on
 * invariants that must hold for any generated timetable.
 */

const UNITS = ["CAB201", "IFB104"] as const

test.describe("auto timetable generator", () => {
  test("generates a conflict-free timetable for two units and applies it to the grid", async ({ page }) => {
    await gotoApp(page)

    await page.getByRole("tab", { name: "Timetable Creator" }).click()
    await expect(page.getByRole("tab", { name: "Timetable Creator" })).toHaveAttribute("aria-selected", "true", {
      timeout: 5_000,
    })
    await expect(page.getByRole("button", { name: "Auto Generate Timetable" })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: "Auto Generate Timetable" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Auto Timetable Generator")).toBeVisible()

    // Step 1 - add units.
    const unitInput = dialog.getByPlaceholder("Enter unit code (e.g. CAB202)")
    for (const unit of UNITS) {
      await unitInput.fill(unit)
      await unitInput.press("Enter")
      await expect(dialog.getByText(unit, { exact: true })).toBeVisible()
    }

    // Step 2 - skip unavailability (no blocks marked), go straight to generate.
    await dialog.getByRole("button", { name: "Set Unavailability" }).click()
    await expect(dialog.getByText("Select Times When You're Unavailable")).toBeVisible()

    await expect(dialog.getByRole("button", { name: "Generate Timetable" })).toBeEnabled({ timeout: 10_000 })
    await dialog.getByRole("button", { name: "Generate Timetable" }).click()

    // Step 3 - preview. Two upstream fetches plus a 5s Monte Carlo run, so give
    // it room; 60s matches the "upstream is slow" allowance used across specs.
    await expect(dialog.getByText("Generated Timetable Preview")).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByText("Selected Classes:")).toBeVisible()

    // The generator must report that it actually ran.
    const stats = dialog.getByText(/We generated \d+ timetable combinations/)
    await expect(stats).toBeVisible()
    const statsText = await stats.innerText()
    const iterations = Number.parseInt(statsText.match(/We generated (\d+) timetable combinations/)![1], 10)
    expect(iterations, `generator reported ${iterations} iterations`).toBeGreaterThan(0)

    // Every selected unit must appear, and only selected units may appear.
    const cards = await readGeneratedCards(dialog)
    expect(cards.length, "generator produced no classes").toBeGreaterThan(0)

    const generatedUnits = [...new Set(cards.map((card) => card.unitCode))]
    for (const unit of UNITS) {
      expect(
        generatedUnits,
        `${unit} is missing from the generated timetable (got ${generatedUnits.join(", ")})`,
      ).toContain(unit)
    }
    for (const unit of generatedUnits) {
      expect(UNITS as readonly string[], `unexpected unit ${unit} in generated timetable`).toContain(unit)
    }

    // One class per unit + activity type, no duplicates.
    const activityKeys = cards.map((card) => `${card.unitCode}-${card.activityType}`)
    expect(new Set(activityKeys).size, `duplicate activity types generated: ${activityKeys.join(", ")}`).toBe(
      activityKeys.length,
    )

    // No two generated classes may occupy overlapping time on the same day.
    const overlaps = findOverlaps(cards)
    expect(
      overlaps.map(({ a, b }) => `${a.unitCode} ${a.activityType} ${a.day} ${a.startTime}-${a.endTime} vs ${b.unitCode} ${b.activityType} ${b.day} ${b.startTime}-${b.endTime}`),
      "generated timetable contains overlapping classes",
    ).toEqual([])

    // The preview must not flag a time conflict either.
    await expect(dialog.getByText(/Conflicts with /)).toHaveCount(0)

    // Step 4 - apply.
    await expect(dialog.getByRole("button", { name: "Apply to Timetable" })).toBeEnabled({ timeout: 10_000 })
    await dialog.getByRole("button", { name: "Apply to Timetable" }).click()
    await expect(dialog).toBeHidden()

    // The weekly grid now has a block per generated class, and Clear All shows
    // up once the timetable holds classes.
    await expect(page.getByRole("button", { name: "Clear All" })).toBeVisible()

    const blocks = page.locator("div.absolute.rounded-md.border")
    await expect(blocks.first()).toBeVisible()
    expect(await blocks.count(), "weekly grid is missing the generated class blocks").toBe(cards.length)

    for (const unit of UNITS) {
      await expect(blocks.filter({ hasText: unit }).first()).toBeVisible()
    }
  })
})
