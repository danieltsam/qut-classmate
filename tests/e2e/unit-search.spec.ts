import { test, expect, gotoApp } from "../helpers"

/**
 * End-to-end unit search against the live QUT Virtual 4 backend.
 *
 * The shared fixture fails the test on any uncaught exception or console.error,
 * so a clean pass also proves the results table renders without runtime noise.
 */

test.describe("unit search", () => {
  test("CAB201 in Semester 2 2026 renders a results table with location and staff", async ({ page }) => {
    test.setTimeout(120_000)
    await gotoApp(page)

    // The app lands on Timetable Creator; Unit Search is one tab over.
    await page.getByRole("tab", { name: "Unit Search" }).click()

    // Dev-mode Fast Refresh (any file edit during a run) triggers a page reload,
    // and `fill` waits for navigation to settle — which is what the intermittent
    // 90s timeout was. Wait for the panel, then for the page to go quiet.
    const unitCodeInput = page.getByPlaceholder("e.g. CAB202")
    await expect(unitCodeInput).toBeVisible({ timeout: 30_000 })
    await page.waitForLoadState("networkidle").catch(() => {})
    await expect(unitCodeInput).toBeVisible({ timeout: 30_000 })
    await unitCodeInput.fill("CAB201")

    // Pick the teaching period explicitly (Semester 2 2026 is also the default).
    await page.locator("#teachingPeriod").click()
    const semester2 = page.getByRole("option").filter({ hasText: /^Semester 2, 2026/ })
    await expect(semester2).toBeVisible()
    await semester2.click()
    await expect(page.locator("#teachingPeriod")).toContainText("Semester 2, 2026")

    await page.getByRole("button", { name: "Get Unit Schedule" }).click()

    const errorAlert = page.getByRole("alert").filter({ hasText: "Error" })

    // The upstream can be slow or flaky; one inline retry after the client-side
    // 2s throttle window before letting the test fail.
    if (await errorAlert.isVisible().catch(() => false)) {
      await page.waitForTimeout(2100)
      await page.getByRole("button", { name: "Get Unit Schedule" }).click()
    }

    const table = page.getByRole("table")
    await expect(table).toBeVisible({ timeout: 60_000 })
    await expect(errorAlert).toHaveCount(0)

    await expect(page.getByRole("heading", { name: /CAB201/ })).toBeVisible()

    const rows = table.locator("tbody tr")
    await expect(rows.first()).toBeVisible()
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    await expect(page.getByRole("columnheader", { name: /Location/ })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /Staff/ })).toBeVisible()

    const firstRowCells = rows.first().locator("td")
    const location = (await firstRowCells.nth(3).innerText()).trim()
    const staff = (await firstRowCells.nth(4).innerText()).trim()

    expect(location.length, "Location column is empty on the first result").toBeGreaterThan(0)
    expect(staff.length, "Staff column is empty on the first result").toBeGreaterThan(0)

    // Every rendered row should carry a time range that looks like "1:00pm - 3:00pm".
    const timeCells = await rows.locator("td:nth-child(3)").allInnerTexts()
    for (const time of timeCells) {
      expect(time.trim()).toMatch(/^\d{1,2}:\d{2}\s*[ap]m\s*-\s*\d{1,2}:\d{2}\s*[ap]m$/i)
    }
  })
})
