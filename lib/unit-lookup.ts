/**
 * "Have we ever seen this unit code, and what might have replaced it?"
 *
 * The timetable error path used to say a code "is no longer offered by QUT"
 * whenever QUT's search page carried no class link for it. That claim is not
 * supportable. QUT returns the same "Page not found" page for a retired unit
 * (CAB202) as for a code that never existed (ZZZ999), so upstream tells us
 * nothing; and absence from our own datasets proves nothing either, because
 * EUB111 is a live unit that none of them contain.
 *
 * What is supportable is narrower: this project has seen the code before, in a
 * dataset that carries a title. That is what `lookupUnit` reports, and it is the
 * only thing the replacement suggestions are built on.
 *
 * Pure module, no filesystem access, so it can be unit-tested directly.
 */

export interface KnownUnitEntry {
  title: string
  /** Which datasets the code appeared in: "prereqs", "meta", "codes", "classes". */
  seenIn: string[]
}

/**
 * Either the whole `data/known-units.json` document or a bare code -> entry map,
 * matching the shapes `lib/prerequisites.ts` and `lib/unit-availability.ts` accept.
 */
export type KnownUnitsIndex =
  | { units?: Record<string, KnownUnitEntry | undefined> }
  | Record<string, KnownUnitEntry | undefined>

/** One entry of `data/unit-prereqs.json`, narrowed to what suggestions read. */
export interface PrereqEntry {
  title?: string | null
  equivalents?: string | null
}

export type PrereqIndex =
  | { units?: Record<string, PrereqEntry | undefined> }
  | Record<string, PrereqEntry | undefined>

export type UnitLookup = { kind: "known"; title: string } | { kind: "unknown" }

export interface UnitSuggestion {
  code: string
  title: string
  /** Why it is here, so callers and tests can tell the two passes apart. */
  reason: "equivalent" | "similar-title"
}

/** Codes are three letters plus three digits. Anything else is not a unit code. */
const UNIT_CODE_RE = /^[A-Z]{3}\d{3}$/

/** A replacement list longer than this stops being a suggestion and becomes homework. */
const MAX_SUGGESTIONS = 3

/**
 * Words that appear in so many titles they carry no signal about the subject.
 * "Introduction to X" and "Principles of X" are the same title as far as a
 * student looking for the topic is concerned.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "by",
  "at",
  "as",
  "or",
  "its",
  "into",
  "part",
  "unit",
  "units",
  "introduction",
  "principles",
  "fundamentals",
  "foundations",
  "concepts",
  "topics",
  "issues",
  "studies",
  "study",
  "advanced",
])

/** "INB104, ITD104" and "DAB101 or DLB101" both become ["INB104", "ITD104"]. */
function splitEquivalentList(raw: string): string[] {
  const codes: string[] = []
  for (const part of raw.split(/,|\bor\b|\/|;/i)) {
    const token = part.trim().toUpperCase()
    if (!UNIT_CODE_RE.test(token)) continue
    if (!codes.includes(token)) codes.push(token)
  }
  return codes
}

function normaliseCode(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
}

function resolveKnown(index: KnownUnitsIndex | null | undefined): Record<string, KnownUnitEntry | undefined> {
  if (!index) return {}
  const candidate = index as { units?: Record<string, KnownUnitEntry | undefined> }
  if (candidate.units && typeof candidate.units === "object") return candidate.units
  return index as Record<string, KnownUnitEntry | undefined>
}

function resolvePrereqs(index: PrereqIndex | null | undefined): Record<string, PrereqEntry | undefined> {
  if (!index) return {}
  const candidate = index as { units?: Record<string, PrereqEntry | undefined> }
  if (candidate.units && typeof candidate.units === "object") return candidate.units
  return index as Record<string, PrereqEntry | undefined>
}

/**
 * Historical codes in the prerequisite index use the same three-letters-three-digits
 * shape, and the ones with a non-unit key (a stray "builtAt") are filtered out below.
 */
function normaliseIndex(index: KnownUnitsIndex | null | undefined): Record<string, KnownUnitEntry> {
  const table = resolveKnown(index)
  const out: Record<string, KnownUnitEntry> = {}
  for (const key of Object.keys(table)) {
    const code = normaliseCode(key)
    if (!UNIT_CODE_RE.test(code)) continue
    const entry = table[key]
    out[code] = {
      title: typeof entry?.title === "string" ? entry.title.trim() : "",
      seenIn: Array.isArray(entry?.seenIn) ? entry.seenIn : [],
    }
  }
  return out
}

/**
 * The title words worth comparing: lowercased, punctuation-free, at least three
 * characters, minus the words that describe every unit at QUT equally.
 */
export function significantWords(title: string | null | undefined): string[] {
  if (typeof title !== "string") return []
  const words: string[] = []
  for (const token of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 3) continue
    if (/^\d+$/.test(token)) continue
    if (STOPWORDS.has(token)) continue
    if (!words.includes(token)) words.push(token)
  }
  return words
}

/** Codes declared equivalent to `code`, in the index's order, then reverse declarations. */
function declaredEquivalents(code: string, prereqs: Record<string, PrereqEntry | undefined>): string[] {
  const out: string[] = []
  const own = prereqs[code]
  if (own?.equivalents) {
    for (const candidate of splitEquivalentList(String(own.equivalents))) {
      if (candidate !== code && !out.includes(candidate)) out.push(candidate)
    }
  }

  // A declaration is often one-sided: EGH449 lists CAB202 but not the reverse.
  for (const key of Object.keys(prereqs).sort()) {
    const entry = prereqs[key]
    if (!entry?.equivalents) continue
    const owner = normaliseCode(key)
    if (owner === code || out.includes(owner)) continue
    if (splitEquivalentList(String(entry.equivalents)).includes(code)) out.push(owner)
  }

  return out
}

/** Is this code one we hold a title for? */
export function lookupUnit(code: string, knownUnits: KnownUnitsIndex | null | undefined): UnitLookup {
  const normalised = normaliseCode(code)
  const entry = normaliseIndex(knownUnits)[normalised]
  return entry ? { kind: "known", title: entry.title } : { kind: "unknown" }
}

/**
 * Up to three units a student could look at instead, best first.
 *
 * Declared equivalents win, because QUT itself says they stand in for each
 * other. Failing that, units whose titles share distinctive words with this one,
 * with the same three-letter prefix (the same school, usually) breaking ties.
 * Silence is a valid answer, and the preferred one: a wrong suggestion costs
 * more than no suggestion.
 */
export function findReplacements(
  code: string,
  knownUnits: KnownUnitsIndex | null | undefined,
  prereqIndex: PrereqIndex | null | undefined,
): UnitSuggestion[] {
  const normalised = normaliseCode(code)
  const units = normaliseIndex(knownUnits)
  const base = units[normalised]
  if (!base) return []

  const suggestions: UnitSuggestion[] = []
  const taken = new Set<string>([normalised])

  const push = (candidate: string, reason: UnitSuggestion["reason"]) => {
    if (suggestions.length >= MAX_SUGGESTIONS) return
    if (taken.has(candidate)) return
    const entry = units[candidate]
    if (!entry) return
    taken.add(candidate)
    suggestions.push({ code: candidate, title: entry.title, reason })
  }

  const prereqs = resolvePrereqs(prereqIndex)
  for (const candidate of declaredEquivalents(normalised, prereqs)) {
    if (suggestions.length >= MAX_SUGGESTIONS) break
    push(candidate, "equivalent")
  }

  if (suggestions.length >= MAX_SUGGESTIONS) return suggestions

  const baseWords = significantWords(base.title)
  if (baseWords.length === 0) return suggestions

  const prefix = normalised.slice(0, 3)
  const scored: Array<{ code: string; score: number }> = []

  for (const candidate of Object.keys(units)) {
    if (taken.has(candidate)) continue
    const entry = units[candidate]
    if (!entry.title) continue

    const words = significantWords(entry.title)
    if (words.length === 0) continue

    const shared = words.filter((word) => baseWords.includes(word))
    if (shared.length === 0) continue

    const samePrefix = candidate.startsWith(prefix)
    const overlap = shared.length / Math.max(words.length, baseWords.length)

    // One shared word is usually a coincidence. "Mining and Resources Law" would
    // otherwise match "Process Mining" on the word mining alone, which is the
    // kind of suggestion that reads as random. A single word only counts when it
    // is distinctive, the titles are short, and the units come from the same
    // school.
    if (shared.length === 1) {
      const only = shared[0]
      if (!samePrefix || only.length < 5 || overlap < 0.4) continue
    }

    const score = shared.length * 10 + (samePrefix ? 6 : 0) + overlap * 4

    scored.push({ code: candidate, score })
  }

  scored.sort((a, b) => (b.score === a.score ? a.code.localeCompare(b.code) : b.score - a.score))

  for (const { code: candidate } of scored) {
    if (suggestions.length >= MAX_SUGGESTIONS) break
    push(candidate, "similar-title")
  }

  return suggestions
}
