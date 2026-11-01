/**
 * The sentences a student reads when a request fails.
 *
 * These are deliberately plain and never mention a status code, a route path or
 * anything the upstream service said. The technical detail belongs in
 * console.error, where it is useful to us and invisible to them.
 */

export const QUT_UNREACHABLE =
  "Could not reach QUT. The timetable service may be down. Try again in a minute."

export const TIMETABLE_BUILD_FAILED =
  "Could not build a timetable from that unit data. Try again."

interface Replacement {
  code: string
  title?: string
}

function describeUnit(unit: Replacement): string {
  const title = (unit.title ?? "").trim()
  return title ? `${unit.code} ${title}` : unit.code
}

/**
 * The code is one we have seen before, so "no longer offered" is a claim we can
 * stand behind. When we also know what took its place, say that instead of
 * leaving the student to guess.
 */
export function unitNoLongerOfferedMessage(unitCode: string, replacements: Replacement[] = []): string {
  const head = `${unitCode.toUpperCase()} is no longer offered by QUT.`
  const named = replacements.slice(0, 3).map(describeUnit)

  if (named.length === 1) {
    return `${head} It was replaced by ${named[0]}.`
  }

  if (named.length > 1) {
    return `${head} Related units still running: ${named.join(", ")}.`
  }

  return `${head} Check the current course structure, or search for the replacement unit.`
}

/**
 * We have never seen this code. That is all we know: QUT answers a retired code
 * and a typo with the same "Page not found" page, and a live unit can be missing
 * from our datasets too. So point at the code itself rather than claiming the
 * unit is gone.
 */
export function unitNotFoundMessage(unitCode: string): string {
  return `We could not find ${unitCode.toUpperCase()} at QUT. Check the code, or search for the unit by name on QUT Virtual.`
}

/**
 * The unit exists but QUT does not run it in the semester that was picked. When
 * the periods it does run in are known, name them, because that is the useful
 * half of the answer.
 */
export function unitNotOfferedInPeriodMessage(unitCode: string, periodNames: string[]): string {
  const offered = joinWithAnd(periodNames)
  const head = `${unitCode.toUpperCase()} is not offered in that semester.`
  return offered ? `${head} It runs in ${offered}.` : head
}

export function noClassesScheduledMessage(unitCode: string): string {
  return `No classes are scheduled for "${unitCode.toUpperCase()}" in the selected teaching period.`
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** Specific causes worth naming, rather than flattening to "QUT is down". */
const KEEP_SPECIFIC = [
  /rate limit/i,
  /searches for today/i,
  /no timetable found/i,
  /no classes/i,
  /couldn't find that unit/i,
  /could not find/i,
  /no longer offered/i,
  /is not offered in/i,
]

/**
 * Turns an API error payload into something readable. A unit that is genuinely
 * not offered keeps its own wording; an unreachable upstream collapses into one
 * sentence, because the client cannot tell a timeout from a 502.
 */
export function timetableErrorMessage(message?: string | null): string {
  const text = (message ?? "").trim()

  if (!text) return QUT_UNREACHABLE

  if (KEEP_SPECIFIC.some((pattern) => pattern.test(text))) return text

  if (/request body|are required/i.test(text)) {
    return "Enter a unit code and choose a teaching period."
  }

  return QUT_UNREACHABLE
}
