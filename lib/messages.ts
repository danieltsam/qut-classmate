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

/** Specific causes worth naming, rather than flattening to "QUT is down". */
const KEEP_SPECIFIC = [
  /rate limit/i,
  /searches for today/i,
  /no timetable found/i,
  /no classes/i,
  /couldn't find that unit/i,
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
