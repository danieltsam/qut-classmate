import { chromium, type FullConfig } from "@playwright/test"

/**
 * Warms the Next.js dev server before the suite runs.
 *
 * In dev, the first browser hit on a route triggers on-demand compilation of the
 * page and its client chunks. That first load can take 30s+, and a chunk that is
 * still compiling can 404 mid-load — React then never attaches and the test hangs
 * on the hydration gate. It always hits whichever test runs first, which is why it
 * looked like one flaky generator test.
 *
 * So: load the app, wait for real hydration, then open every tab so each chunk is
 * compiled before the timed specs start.
 */
const TABS = ["Timetable Creator", "Campus Explorer", "Course Planner", "Unit Search"]

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000"

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const deadline = Date.now() + 180_000
    let lastError: unknown

    while (Date.now() < deadline) {
      try {
        await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 60_000 })

        // home-page.tsx sets data-hydrated from a client effect. This is the only
        // reliable "React has attached" signal — the old opacity check passed
        // instantly once the fade-in was removed, which is why it stopped warming.
        await page.waitForSelector("main[data-hydrated='true']", { timeout: 60_000 })

        for (const tab of TABS) {
          const trigger = page.getByRole("tab", { name: tab, exact: true })
          await trigger.click({ timeout: 30_000 })
          await page.waitForTimeout(600)
        }

        // Return to the default tab so the first test starts from a known state.
        await page.getByRole("tab", { name: "Timetable Creator", exact: true }).click()
        await page.waitForTimeout(300)
        return
      } catch (error) {
        lastError = error
        await page.waitForTimeout(1_000)
      }
    }

    throw new Error(
      `Could not warm ${baseURL} before the test run: ${String(lastError)}\n\n` +
        `This config intentionally does not start a dev server (see the note in ` +
        `playwright.config.ts — spawning one used to corrupt .next). Start it ` +
        `yourself and re-run:\n\n  npm run dev\n\n` +
        `If the server is up but the page never hydrates, .next is probably stale: ` +
        `stop the server, delete .next, and start it again.`,
    )
  } finally {
    await browser.close()
  }
}
