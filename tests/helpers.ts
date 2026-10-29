import { test as base, expect, type Page } from "@playwright/test"

/**
 * Console noise that is not a defect in the app. Everything else of type
 * "error" (console.error / uncaught exceptions reported to console) fails the
 * test that produced it.
 */
const BENIGN_CONSOLE_ERRORS: RegExp[] = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /Failed to load resource: the server responded with a status of 404 \(Not Found\).*favicon/i,
  /net::ERR_ABORTED.*favicon/i,
]

export function isBenignConsoleError(text: string): boolean {
  return BENIGN_CONSOLE_ERRORS.some((pattern) => pattern.test(text))
}

export interface ConsoleGuard {
  /** console.error output collected for the page. */
  consoleErrors: string[]
  /** Uncaught exceptions (pageerror events). */
  pageErrors: string[]
}

/**
 * Attaches listeners that record console errors and uncaught exceptions.
 * `attachConsoleGuard` is the escape hatch for plain `test` suites; the
 * exported `test` fixture below does this automatically.
 */
export function attachConsoleGuard(page: Page): ConsoleGuard {
  const guard: ConsoleGuard = { consoleErrors: [], pageErrors: [] }

  page.on("console", (message) => {
    if (message.type() !== "error") return
    const text = message.text()
    if (isBenignConsoleError(text)) return
    guard.consoleErrors.push(text)
  })

  page.on("pageerror", (error) => {
    const text = error.message || String(error)
    if (isBenignConsoleError(text)) return
    guard.pageErrors.push(text)
  })

  return guard
}

/**
 * Test fixture used by every e2e spec: collects console errors and pageerrors,
 * attaches them to the report, and fails the test if any occurred.
 */
export const test = base.extend<{ consoleGuard: ConsoleGuard }>({
  consoleGuard: [
    async ({ page }, use, testInfo) => {
      const guard = attachConsoleGuard(page)
      await use(guard)

      const problems: string[] = []
      if (guard.pageErrors.length > 0) {
        problems.push(`Uncaught page errors:\n- ${guard.pageErrors.join("\n- ")}`)
      }
      if (guard.consoleErrors.length > 0) {
        problems.push(`console.error output:\n- ${guard.consoleErrors.join("\n- ")}`)
      }

      if (problems.length > 0) {
        await testInfo.attach("console-and-page-errors", {
          body: problems.join("\n\n"),
          contentType: "text/plain",
        })
      }

      // Only fail on noise when the test itself passed - otherwise the original
      // failure is the useful signal.
      if (problems.length > 0 && testInfo.status === "passed") {
        expect.soft(problems, "page produced console errors or uncaught exceptions").toEqual([])
      }
    },
    { auto: true },
  ],
})

export { expect }

/**
 * Loads the app and waits until React has hydrated.
 *
 * The UI is server-rendered and interactive-looking before React attaches, so a
 * click that lands too early is swallowed: the tab takes focus, the panel never
 * changes, and the test hangs on the next locator. `home-page.tsx` sets
 * `data-hydrated="true"` on <main> from a client effect, which is the signal
 * this gate waits on. (It used to wait for the tab bar's fade-in to finish, but
 * that fade was a 100ms timer that rendered the whole app invisible first.)
 *
 * The timeout is deliberately long: in dev, a recompile triggered by any file
 * change (including the data/*.json this app imports) can leave the page
 * rendered-but-unhydrated for many seconds.
 */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "QUT Classmate" })).toBeVisible()
  // The app sets data-hydrated on <main> from a client effect. Waiting on this
  // is the only reliable way to know React has attached: the UI is server
  // rendered, so a click that lands before hydration is swallowed silently
  // (the tab takes focus but never changes state).
  await expect(
    page.locator("main[data-hydrated='true']"),
    "the app never finished hydrating (React did not attach)",
  ).toBeVisible({ timeout: 45_000 })
}

/** "1:00pm" -> 780. Mirrors lib/format-utils timeToMinutes without importing app code. */
export function parseClock(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i)
  if (!match) throw new Error(`Unparseable clock time: "${time}"`)
  let hour = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const isPM = match[3].toLowerCase() === "pm"
  if (isPM && hour < 12) hour += 12
  if (!isPM && hour === 12) hour = 0
  return hour * 60 + minutes
}

export interface ParsedClass {
  unitCode: string
  activityType: string
  day: string
  startTime: string
  endTime: string
}

/**
 * Returns every pair of parsed classes that overlap in time on the same day.
 * Two classes are back-to-back (end == start) are not overlaps.
 */
export function findOverlaps(classes: ParsedClass[]): Array<{ a: ParsedClass; b: ParsedClass }> {
  const overlaps: Array<{ a: ParsedClass; b: ParsedClass }> = []

  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = classes[i]
      const b = classes[j]
      if (a.day !== b.day) continue

      const aStart = parseClock(a.startTime)
      const aEnd = parseClock(a.endTime)
      const bStart = parseClock(b.startTime)
      const bEnd = parseClock(b.endTime)

      if (aStart < bEnd && bStart < aEnd) {
        overlaps.push({ a, b })
      }
    }
  }

  return overlaps
}

/** Pulls "UNIT - Activity / Day 1:00pm - 3:00pm" cards out of the generator preview. */
export async function readGeneratedCards(dialog: ReturnType<Page["locator"]>): Promise<ParsedClass[]> {
  const raw = await dialog.evaluate((root: Element) => {
    const heading = Array.from(root.querySelectorAll("h3")).find((node) =>
      (node.textContent || "").includes("Selected Classes"),
    )
    if (!heading) return null

    const list = heading.parentElement?.querySelector(".space-y-2")
    if (!list) return null

    return Array.from(list.children).map((card) => {
      const lines = Array.from(card.children).map((child) => (child.textContent || "").trim())
      return { header: lines[0] || "", time: lines[1] || "", full: card.textContent || "" }
    })
  })

  if (!raw) return []

  return raw.map((entry) => {
    const header = entry.header.match(/^(\S+)\s*-\s*(.+)$/)
    const time = entry.time.match(/^(\w+)\s+(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)$/i)
    if (!header || !time) {
      throw new Error(`Could not parse generated class card: ${JSON.stringify(entry)}`)
    }
    return {
      unitCode: header[1],
      activityType: header[2],
      day: time[1],
      startTime: time[2].replace(/\s+/g, ""),
      endTime: time[3].replace(/\s+/g, ""),
    }
  })
}
