/**
 * Prerequisite / anti-requisite evaluation for the Course Planner.
 *
 * Input is QUT's own prerequisite wording (scraped verbatim into
 * `data/unit-prereqs.json`), e.g.
 *
 *   "DSB100 or DSB102 or CAB201 or IFB220"
 *   "[( IAB251 or CAB302 or IAB320 ) and completion of 120cp of (IFB% or ITD%)] or [192cp of DS01]"
 *
 * This module is dependency-free and side-effect-free so the same code can be
 * imported by a server route and by a client component.
 *
 * Design rule: a wrong "unmet" (telling a student they can't take a unit they
 * actually can) is worse than silence. Anything we cannot interpret becomes
 * `unknown`, and any unknown fragment in an expression downgrades the whole
 * result to `unknown`. Tokens are never trusted to be well-formed and no input
 * makes this module throw.
 */

// QUT's standard unit weight. Used only when a caller omits creditPoints.
export const DEFAULT_CREDIT_POINTS = 12

/* ------------------------------------------------------------------ *
 * AST
 * ------------------------------------------------------------------ */

export type PrereqNode =
  | { type: "or"; children: PrereqNode[] }
  | { type: "and"; children: PrereqNode[] }
  | { type: "unit"; code: string }
  /** "completion of 120cp of (IFB% or ITD%)" */
  | { type: "prefixCredits"; creditPoints: number; prefixes: string[] }
  /** "192cp of DS01" - credit points earned inside one course */
  | { type: "courseCredits"; creditPoints: number; courseCode: string }
  /** "Completion of 96cp" - a bare credit total with no unit list attached */
  | { type: "totalCredits"; creditPoints: number }
  /** Anything we refused to guess at. Carries the raw text. */
  | { type: "unknown"; raw: string }

/* ------------------------------------------------------------------ *
 * Public result + input shapes
 * ------------------------------------------------------------------ */

export type PrereqStatus = "met" | "unmet" | "unknown"

export interface PrereqResult {
  status: PrereqStatus
  /** Codes that would satisfy the expression. Only populated when "unmet". */
  missingUnits: string[]
  /** Human-readable credit rules that are not satisfied. Only when "unmet". */
  unmetCreditRules: string[]
  /** Raw fragments we could not interpret. Populated whenever any exist. */
  unknownRules: string[]
}

export interface CompletedUnit {
  code: string
  /** Defaults to DEFAULT_CREDIT_POINTS when omitted. */
  creditPoints?: number
}

/**
 * Unit code -> codes QUT treats as the same unit, e.g.
 * `{ IFB104: ["INB104", "ITB001", "ITD104"] }`. Build it once with
 * `buildEquivalentsMap` and pass it everywhere.
 */
export type EquivalentsMap = Record<string, string[]>

export interface PrereqInput {
  prerequisites: string | null | undefined
  completedUnits: CompletedUnit[]
  /** The student's course, e.g. "DS01". Needed for "Ncp of COURSECODE" rules. */
  courseCode?: string
  /** Override for QUT's 12cp standard unit weight. */
  defaultCreditPoints?: number
  /**
   * Equivalent units, from buildEquivalentsMap. Omitting it restores the
   * code-for-code behaviour: an equivalent completed unit will not count.
   */
  equivalents?: EquivalentsMap
}

export interface AntiRequisiteInput {
  antiRequisites: string[] | string | null | undefined
  completedUnits: CompletedUnit[]
  /** Completed equivalents of an anti-requisite still block. */
  equivalents?: EquivalentsMap
}

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

type Token =
  | { kind: "unit"; code: string }
  | { kind: "credits"; node: PrereqNode }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "and" }
  | { kind: "or" }
  | { kind: "unknown"; raw: string }
  | { kind: "eof" }

const OPENERS = "([{"
const CLOSERS = ")]}"

// completion of 120cp / 120 credit points / 84 credit point
const CREDIT_HEAD_RE = /^(?:completion\s+of\s+)?(\d+(?:\.\d+)?)\s*(?:cp|credit\s*points?)\b/i
// QUT also writes "84 credit points of completed Architecture study (ABB% or D% units)"
const CREDIT_BRIDGE_RE = /^(?:of\s+)?(?:completed\s+)?(?:[A-Za-z][A-Za-z/&'-]*[ \t]+){0,6}/i
const UNIT_CODE_RE = /^[A-Za-z]{3}\d{3}[A-Za-z]?(?![A-Za-z0-9])/
// Covers "IFB%", single-letter "D%", and year-suffixed "ABB24%".
const PREFIX_WILDCARD_RE = /^[A-Za-z]{1,6}\d{0,4}%/
const COURSE_CODE_RE = /^[A-Za-z]{2,6}\d{2,4}(?![A-Za-z0-9])/
const WORD_OP_RE = /^(and|or)\b/i
const TRAILING_UNITS_RE = /\s+units?$/i

function skipWhitespace(text: string, start: number): number {
  let i = start
  while (i < text.length && /\s/.test(text[i])) i += 1
  return i
}

/** Index of the bracket that closes the one at `open`, or -1 if unbalanced. */
function findMatchingBracket(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]
    if (OPENERS.indexOf(ch) !== -1) depth += 1
    else if (CLOSERS.indexOf(ch) !== -1) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** Split "IFB% or ITD%, CAB%" into bare prefixes, or null if anything else is in there. */
function parsePrefixList(text: string): string[] | null {
  // "(ABB% or D% units)" - the trailing noun is part of QUT's wording.
  const cleaned = text.replace(TRAILING_UNITS_RE, "")

  const parts = cleaned
    .split(/\s*(?:\bor\b|\band\b|,|;|\/|&|\|)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) return null

  const prefixes: string[] = []
  for (const part of parts) {
    const match = PREFIX_WILDCARD_RE.exec(part)
    if (!match || match[0].length !== part.length) return null
    prefixes.push(part.slice(0, -1).toUpperCase())
  }
  return prefixes
}

/**
 * Reads a run of text we do not understand, stopping before anything that
 * looks like a real token so the rest of the expression still parses.
 */
function readUnknownRun(text: string, start: number): number {
  let i = start
  while (i < text.length) {
    const ch = text[i]
    if (OPENERS.indexOf(ch) !== -1 || CLOSERS.indexOf(ch) !== -1) break
    if (ch === "," || ch === ";") break
    if (i > start) {
      const rest = text.slice(i)
      if (UNIT_CODE_RE.test(rest) || PREFIX_WILDCARD_RE.test(rest) || WORD_OP_RE.test(rest)) break
      if (/^\d/.test(rest) && CREDIT_HEAD_RE.test(rest)) break
    }
    i += 1
  }
  return i
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let guard = 0

  while (i < input.length) {
    // Belt and braces: a pathological string must not spin forever.
    guard += 1
    if (guard > 20000) {
      tokens.push({ kind: "unknown", raw: input.slice(i) })
      break
    }

    const ch = input[i]

    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (OPENERS.indexOf(ch) !== -1) {
      tokens.push({ kind: "lparen" })
      i += 1
      continue
    }
    if (CLOSERS.indexOf(ch) !== -1) {
      tokens.push({ kind: "rparen" })
      i += 1
      continue
    }
    if (ch === "," || ch === ";") {
      // QUT writes lists with commas; in these strings a comma separates
      // alternatives, same as "or".
      tokens.push({ kind: "or" })
      i += 1
      continue
    }
    if (ch === "&") {
      tokens.push({ kind: "and" })
      i += 1
      continue
    }
    if (ch === "/") {
      tokens.push({ kind: "or" })
      i += 1
      continue
    }

    const rest = input.slice(i)

    const opMatch = WORD_OP_RE.exec(rest)
    if (opMatch) {
      tokens.push({ kind: opMatch[1].toLowerCase() === "and" ? "and" : "or" })
      i += opMatch[0].length
      continue
    }

    const creditMatch = CREDIT_HEAD_RE.exec(rest)
    if (creditMatch) {
      const creditPoints = Number.parseFloat(creditMatch[1])
      const afterHead = skipWhitespace(input, i + creditMatch[0].length)

      // Step over QUT's decorative wording, e.g. "of completed Architecture
      // study ", so the bracketed prefix list behind it survives. Never bridge
      // across an "and"/"or" - that would swallow the operator.
      let operand = afterHead
      if (!WORD_OP_RE.test(input.slice(afterHead))) {
        const bridge = CREDIT_BRIDGE_RE.exec(input.slice(afterHead))
        if (bridge && !WORD_OP_RE.test(bridge[0].replace(/^\s*(?:of|completed)\s+/i, ""))) {
          operand = afterHead + bridge[0].length
        }
      }

      const operandChar = input[operand]
      if (OPENERS.indexOf(operandChar) !== -1) {
        const close = findMatchingBracket(input, operand)
        if (close === -1) {
          tokens.push({ kind: "unknown", raw: rest })
          i = input.length
          continue
        }
        const inner = input.slice(operand + 1, close)
        const prefixes = parsePrefixList(inner)
        if (prefixes) {
          tokens.push({ kind: "credits", node: { type: "prefixCredits", creditPoints, prefixes } })
        } else {
          // Bracketed operand that is not a prefix list - refuse to guess.
          tokens.push({ kind: "unknown", raw: input.slice(i, close + 1) })
        }
        i = close + 1
        continue
      }

      // Unparenthesised prefix list: "120cp of IFB% or ITD%". Safe to gather
      // because "%" can only appear in a prefix wildcard.
      const prefixes: string[] = []
      let scan = operand
      while (scan < input.length) {
        const tail = input.slice(scan)
        const prefixMatch = PREFIX_WILDCARD_RE.exec(tail)
        if (prefixMatch) {
          prefixes.push(prefixMatch[0].slice(0, -1).toUpperCase())
          scan += prefixMatch[0].length
          const sep = /^\s*(?:or\b|and\b|,|;|\/|&|\|)?\s*/i.exec(input.slice(scan))
          if (sep && sep[0].length > 0) {
            scan += sep[0].length
            continue
          }
          break
        }
        break
      }

      if (prefixes.length > 0) {
        tokens.push({ kind: "credits", node: { type: "prefixCredits", creditPoints, prefixes } })
        i = scan
        continue
      }

      const courseMatch = COURSE_CODE_RE.exec(input.slice(operand))
      if (courseMatch && !UNIT_CODE_RE.test(courseMatch[0])) {
        tokens.push({
          kind: "credits",
          node: { type: "courseCredits", creditPoints, courseCode: courseMatch[0].toUpperCase() },
        })
        i = operand + courseMatch[0].length
        continue
      }

      // "Completion of 96cp or EGB273": a bare credit total with no unit list.
      const nextChar = input[operand]
      const nextIsOperator = WORD_OP_RE.test(input.slice(operand))
      const nextIsSeparator =
        nextChar === undefined || CLOSERS.indexOf(nextChar) !== -1 || nextChar === "," || nextChar === ";"

      if (nextIsOperator || nextIsSeparator) {
        tokens.push({ kind: "credits", node: { type: "totalCredits", creditPoints } })
        i = operand
        continue
      }

      // A credit rule we cannot finish reading.
      const stop = readUnknownRun(input, i)
      tokens.push({ kind: "unknown", raw: input.slice(i, Math.max(stop, i + 1)).trim() })
      i = Math.max(stop, i + 1)
      continue
    }

    if (PREFIX_WILDCARD_RE.test(rest)) {
      // A bare "IFB%" outside a credit rule has no cp threshold attached, so
      // there is nothing safe to evaluate.
      const stop = readUnknownRun(input, i)
      tokens.push({ kind: "unknown", raw: input.slice(i, Math.max(stop, i + 1)).trim() })
      i = Math.max(stop, i + 1)
      continue
    }

    const unitMatch = UNIT_CODE_RE.exec(rest)
    if (unitMatch) {
      tokens.push({ kind: "unit", code: unitMatch[0].toUpperCase() })
      i += unitMatch[0].length
      continue
    }

    const stop = readUnknownRun(input, i)
    const end = Math.max(stop, i + 1)
    tokens.push({ kind: "unknown", raw: input.slice(i, end).trim() })
    i = end
  }

  tokens.push({ kind: "eof" })
  return tokens
}

/* ------------------------------------------------------------------ *
 * Parser (recursive descent: or < and < atom)
 * ------------------------------------------------------------------ */

class ParseFailure extends Error {}

interface Cursor {
  tokens: Token[]
  index: number
}

function peek(cursor: Cursor): Token {
  return cursor.tokens[cursor.index] || { kind: "eof" }
}

function combine(children: PrereqNode[], type: "and" | "or", node: PrereqNode): PrereqNode[] {
  if (node.type === type) return children.concat(node.children)
  return children.concat([node])
}

function parseOr(cursor: Cursor): PrereqNode {
  let node = parseAnd(cursor)
  while (peek(cursor).kind === "or") {
    cursor.index += 1
    const right = parseAnd(cursor)
    node = { type: "or", children: combine(node.type === "or" ? node.children : [node], "or", right) }
  }
  return node
}

function parseAnd(cursor: Cursor): PrereqNode {
  let node = parseAtom(cursor)
  while (peek(cursor).kind === "and") {
    cursor.index += 1
    const right = parseAtom(cursor)
    node = { type: "and", children: combine(node.type === "and" ? node.children : [node], "and", right) }
  }
  return node
}

function parseAtom(cursor: Cursor): PrereqNode {
  const token = peek(cursor)

  if (token.kind === "lparen") {
    cursor.index += 1
    const inner = parseOr(cursor)
    const closing = peek(cursor)
    if (closing.kind !== "rparen") {
      // Unbalanced: refuse to guess what the group meant.
      throw new ParseFailure("unclosed bracket")
    }
    cursor.index += 1
    return inner
  }

  if (token.kind === "unit") {
    cursor.index += 1
    return { type: "unit", code: token.code }
  }

  if (token.kind === "credits") {
    cursor.index += 1
    return token.node
  }

  if (token.kind === "unknown") {
    cursor.index += 1
    return { type: "unknown", raw: token.raw }
  }

  throw new ParseFailure(`unexpected ${token.kind}`)
}

/**
 * Parse a prerequisite string into an AST. Returns null for empty input.
 * Never throws: a string we cannot make sense of becomes a single `unknown`.
 */
export function parsePrerequisites(raw: string | null | undefined): PrereqNode | null {
  if (raw === null || raw === undefined) return null

  let text: string
  try {
    text = String(raw).trim()
  } catch {
    return { type: "unknown", raw: "" }
  }
  if (!text) return null

  try {
    const tokens = tokenize(text)
    const cursor: Cursor = { tokens, index: 0 }
    const node = parseOr(cursor)

    // Tolerate stray closing brackets left over at the top level.
    while (peek(cursor).kind === "rparen") cursor.index += 1

    if (peek(cursor).kind !== "eof") throw new ParseFailure("trailing tokens")
    return node
  } catch {
    return { type: "unknown", raw: text }
  }
}

/* ------------------------------------------------------------------ *
 * Equivalents
 *
 * QUT lists units it treats as interchangeable ("CAB201" vs "ITD104"). A
 * completed equivalent satisfies a prerequisite and also triggers an
 * anti-requisite, so both directions of every declared pair are honoured.
 * ------------------------------------------------------------------ */

// Unit codes as they appear in the equivalents column: INB104, ITD104, MZB125.
const EQUIVALENT_TOKEN_RE = /^[A-Z]{2,4}\d{3,4}[A-Z]?$/

/** "INB104, ITB001, ITD104" and "DAB101 or DLB101" both become ["INB104", ...]. */
function splitEquivalentList(raw: string): string[] {
  const codes: string[] = []
  for (const part of raw.split(/,|\bor\b|\/|;/i)) {
    const token = part.trim().toUpperCase()
    if (!token) continue
    if (!EQUIVALENT_TOKEN_RE.test(token)) continue
    if (codes.indexOf(token) === -1) codes.push(token)
  }
  return codes
}

/**
 * Flatten the equivalents column of `data/unit-prereqs.json` (or a bare
 * code -> entry map) into `{ CODE: [equivalent, ...] }`. Null and empty
 * columns are dropped, so the result only holds real pairs.
 */
export function buildEquivalentsMap(index: PrereqIndex | null | undefined): EquivalentsMap {
  const map: EquivalentsMap = {}
  try {
    const table = resolveIndex(index as PrereqIndex)
    for (const key of Object.keys(table)) {
      const entry = table[key]
      if (!entry || !entry.equivalents) continue
      const code = key.trim().toUpperCase()
      if (!code) continue

      const codes = splitEquivalentList(String(entry.equivalents)).filter(
        (candidate) => candidate !== code,
      )
      if (codes.length > 0) map[code] = codes
    }
  } catch {
    return {}
  }
  return map
}

/**
 * Union-find over the equivalence pairs, so a declaration on either side (and
 * any chain of declarations) makes two codes interchangeable.
 */
interface EquivalenceLookup {
  isEquivalent: (a: string, b: string) => boolean
  /** Every code known to be interchangeable with `code`, including itself. */
  membersOf: (code: string) => string[]
}

function buildEquivalenceLookup(equivalents?: EquivalentsMap | null): EquivalenceLookup {
  const identity: EquivalenceLookup = {
    isEquivalent: (a, b) => a === b,
    membersOf: (code) => [code],
  }
  if (!equivalents) return identity

  const parent = new Map<string, string>()

  const find = (code: string): string => {
    let root = code
    while (parent.has(root)) {
      const next = parent.get(root) as string
      if (next === root) break
      root = next
    }
    // Path compression: keeps repeated lookups cheap.
    let cursor = code
    while (parent.has(cursor) && parent.get(cursor) !== root) {
      const next = parent.get(cursor) as string
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }

  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  for (const key of Object.keys(equivalents)) {
    const code = key.trim().toUpperCase()
    const list = equivalents[key]
    if (!code || !Array.isArray(list)) continue
    for (const other of list) {
      if (typeof other !== "string") continue
      const candidate = other.trim().toUpperCase()
      if (!candidate || candidate === code) continue
      union(code, candidate)
    }
  }

  const groups = new Map<string, string[]>()
  parent.forEach((_root, code) => {
    const root = find(code)
    const group = groups.get(root)
    if (group) group.push(code)
    else groups.set(root, [code])
  })

  return {
    isEquivalent: (a, b) => {
      if (a === b) return true
      if (!parent.has(a) || !parent.has(b)) return false
      return find(a) === find(b)
    },
    membersOf: (code) => {
      if (!parent.has(code)) return [code]
      return groups.get(find(code)) || [code]
    },
  }
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

interface EvalContext {
  /** Completed unit code -> credit points. */
  completed: Map<string, number>
  totalCreditPoints: number
  courseCode?: string
  /** QUT's equivalent-unit declarations, for both unit nodes and credit rules. */
  equivalence: EquivalenceLookup
}

/** Has the student completed `code`, or any unit QUT treats as its equal? */
function isSatisfiedByCompletion(code: string, context: EvalContext): boolean {
  if (context.completed.has(code)) return true
  let satisfied = false
  context.completed.forEach((_creditPoints, completedCode) => {
    if (!satisfied && context.equivalence.isEquivalent(code, completedCode)) satisfied = true
  })
  return satisfied
}

interface NodeResult {
  state: PrereqStatus
  missingUnits: string[]
  unmetCreditRules: string[]
  unknownRules: string[]
}

function emptyResult(state: PrereqStatus): NodeResult {
  return { state, missingUnits: [], unmetCreditRules: [], unknownRules: [] }
}

function mergeResults(results: NodeResult[], state: PrereqStatus): NodeResult {
  const merged = emptyResult(state)
  for (const result of results) {
    merged.missingUnits.push(...result.missingUnits)
    merged.unmetCreditRules.push(...result.unmetCreditRules)
    merged.unknownRules.push(...result.unknownRules)
  }
  return merged
}

function humanCreditRule(
  node:
    | { type: "prefixCredits"; creditPoints: number; prefixes: string[] }
    | { type: "courseCredits"; creditPoints: number; courseCode: string }
    | { type: "totalCredits"; creditPoints: number },
): string {
  if (node.type === "prefixCredits") {
    return `${node.creditPoints} cp from ${node.prefixes.join("/")} units`
  }
  if (node.type === "courseCredits") {
    return `${node.creditPoints} cp from course ${node.courseCode}`
  }
  return `${node.creditPoints} cp of completed study`
}

function evaluateNode(node: PrereqNode, context: EvalContext): NodeResult {
  switch (node.type) {
    case "unit": {
      // A completed equivalent counts as the unit itself, which is why it is
      // never reported in missingUnits.
      if (isSatisfiedByCompletion(node.code, context)) return emptyResult("met")
      const result = emptyResult("unmet")
      result.missingUnits.push(node.code)
      return result
    }

    case "prefixCredits": {
      const matchesPrefix = (candidate: string) =>
        node.prefixes.some((prefix) => candidate.indexOf(prefix) === 0)

      let matched = 0
      context.completed.forEach((creditPoints, code) => {
        // A completed unit counts toward a prefix rule when its own code
        // matches, or when QUT declares it equivalent to a unit whose code
        // matches - a swapped code (ITD104 for IFB104) still belongs to the
        // same subject area, so the credit should not vanish. One-directional
        // and deliberately generous: the worst case is a rule we call
        // satisfied a little early, never a false accusation.
        if (matchesPrefix(code) || context.equivalence.membersOf(code).some(matchesPrefix)) {
          matched += creditPoints
        }
      })
      if (matched >= node.creditPoints) return emptyResult("met")
      const result = emptyResult("unmet")
      result.unmetCreditRules.push(humanCreditRule(node))
      return result
    }

    case "courseCredits": {
      const required = node.creditPoints
      const wanted = node.courseCode.toUpperCase()

      // Equivalents deliberately do not apply here: this rule counts credit
      // points inside the student's *course* (DS01), and our equivalence map
      // only describes units. There is no course-level equivalent data to use,
      // so a wrong course stays a definite "unmet" rather than a guess.
      if (context.courseCode) {
        const matched =
          context.courseCode.toUpperCase() === wanted ? context.totalCreditPoints : 0
        if (matched >= required) return emptyResult("met")
        const result = emptyResult("unmet")
        result.unmetCreditRules.push(humanCreditRule(node))
        return result
      }

      // No course on file. If the student has not even accumulated enough
      // credit points overall, no course could satisfy the rule - that is a
      // sound "unmet". Otherwise we genuinely cannot tell.
      if (context.totalCreditPoints < required) {
        const result = emptyResult("unmet")
        result.unmetCreditRules.push(humanCreditRule(node))
        return result
      }
      const result = emptyResult("unknown")
      result.unknownRules.push(humanCreditRule(node))
      return result
    }

    case "totalCredits": {
      if (context.totalCreditPoints >= node.creditPoints) return emptyResult("met")
      const result = emptyResult("unmet")
      result.unmetCreditRules.push(humanCreditRule(node))
      return result
    }

    case "unknown": {
      const result = emptyResult("unknown")
      result.unknownRules.push(node.raw)
      return result
    }

    case "and": {
      const results = node.children.map((child) => evaluateNode(child, context))
      const failed = results.filter((result) => result.state === "unmet")
      if (failed.length > 0) {
        // Every branch must hold, so one definite failure is enough - but keep
        // the other branches' detail so the UI can show all of it.
        return mergeResults(results, "unmet")
      }
      if (results.some((result) => result.state === "unknown")) {
        return mergeResults(results, "unknown")
      }
      return emptyResult("met")
    }

    case "or": {
      const results = node.children.map((child) => evaluateNode(child, context))
      const unknowns = unique(
        results.reduce<string[]>((all, result) => all.concat(result.unknownRules), []),
      )
      if (results.some((result) => result.state === "met")) {
        // One satisfied alternative proves the rule, but the unknown fragments
        // still have to travel up so the caller sees them.
        return { state: "met", missingUnits: [], unmetCreditRules: [], unknownRules: unknowns }
      }
      if (results.some((result) => result.state === "unknown")) {
        // At least one alternative might be satisfiable - do not accuse.
        return mergeResults(results, "unknown")
      }
      return mergeResults(results, "unmet")
    }

    default: {
      const result = emptyResult("unknown")
      result.unknownRules.push(JSON.stringify(node))
      return result
    }
  }
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      output.push(value)
    }
  }
  return output
}

function buildContext(
  completedUnits: CompletedUnit[],
  courseCode: string | undefined,
  defaultCreditPoints: number,
  equivalents?: EquivalentsMap | null,
): EvalContext {
  const completed = new Map<string, number>()
  let totalCreditPoints = 0

  for (const unit of completedUnits || []) {
    if (!unit || typeof unit.code !== "string") continue
    const code = unit.code.trim().toUpperCase()
    if (!code) continue
    const creditPoints =
      typeof unit.creditPoints === "number" && Number.isFinite(unit.creditPoints) && unit.creditPoints >= 0
        ? unit.creditPoints
        : defaultCreditPoints
    if (completed.has(code)) continue
    completed.set(code, creditPoints)
    totalCreditPoints += creditPoints
  }

  return {
    completed,
    totalCreditPoints,
    courseCode: courseCode ? courseCode.trim().toUpperCase() : undefined,
    equivalence: buildEquivalenceLookup(equivalents),
  }
}

/**
 * Evaluate a unit's prerequisites against what the student has completed.
 * Never throws.
 */
export function evaluatePrerequisites(input: PrereqInput): PrereqResult {
  try {
    const raw = input ? input.prerequisites : null
    const node = parsePrerequisites(raw)

    // Rule 1: no prerequisite text at all means nothing to satisfy.
    if (!node) {
      return { status: "met", missingUnits: [], unmetCreditRules: [], unknownRules: [] }
    }

    const context = buildContext(
      (input && input.completedUnits) || [],
      input ? input.courseCode : undefined,
      input && typeof input.defaultCreditPoints === "number"
        ? input.defaultCreditPoints
        : DEFAULT_CREDIT_POINTS,
      input ? input.equivalents : undefined,
    )

    const result = evaluateNode(node, context)
    const unknownRules = unique(result.unknownRules)

    // Any fragment we could not interpret outranks both "met" and "unmet".
    if (unknownRules.length > 0) {
      return { status: "unknown", missingUnits: [], unmetCreditRules: [], unknownRules }
    }

    if (result.state === "unmet") {
      return {
        status: "unmet",
        missingUnits: unique(result.missingUnits),
        unmetCreditRules: unique(result.unmetCreditRules),
        unknownRules: [],
      }
    }

    return { status: result.state, missingUnits: [], unmetCreditRules: [], unknownRules: [] }
  } catch {
    return {
      status: "unknown",
      missingUnits: [],
      unmetCreditRules: [],
      unknownRules: [input && input.prerequisites ? String(input.prerequisites) : "unreadable prerequisites"],
    }
  }
}

/* ------------------------------------------------------------------ *
 * Anti-requisites
 * ------------------------------------------------------------------ */

/** All unit codes mentioned anywhere in an AST. */
function collectUnitCodes(node: PrereqNode | null, into: string[] = []): string[] {
  if (!node) return into
  if (node.type === "unit") {
    into.push(node.code)
    return into
  }
  if (node.type === "and" || node.type === "or") {
    for (const child of node.children) collectUnitCodes(child, into)
  }
  return into
}

function splitAntiRequisiteInput(raw: string[] | string | null | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((entry) => typeof entry === "string")
  return [raw]
}

/**
 * Which completed units block enrolment. An anti-requisite is a plain list of
 * codes ("CAB201, EGB103"), so any completed code in that list is a blocker
 * regardless of how the list is grouped or joined.
 */
export function evaluateAntiRequisites(input: AntiRequisiteInput): { blocked: string[] } {
  try {
    const context = buildContext(
      (input && input.completedUnits) || [],
      undefined,
      DEFAULT_CREDIT_POINTS,
      input ? input.equivalents : undefined,
    )

    const blocked: string[] = []
    for (const rawText of splitAntiRequisiteInput(input ? input.antiRequisites : null)) {
      const codes = collectUnitCodes(parsePrerequisites(rawText))
      for (const code of codes) {
        // Completing an equivalent of the anti-requisite blocks just as hard.
        if (isSatisfiedByCompletion(code, context) && blocked.indexOf(code) === -1) {
          blocked.push(code)
        }
      }
    }

    return { blocked }
  } catch {
    return { blocked: [] }
  }
}

/* ------------------------------------------------------------------ *
 * Co-requisites
 *
 * A co-requisite is the mirror image of a prerequisite: the unit has to be
 * taken in the same semester as its co-requisite (or already be completed),
 * not strictly before. The free text is identical in shape, so the evaluation
 * is identical too - only which units the caller counts as "available" differs.
 * ------------------------------------------------------------------ */

export interface CoRequisiteInput {
  coRequisites: string | null | undefined
  /**
   * Units already completed, PLUS the units being taken in the same semester.
   * The caller decides what "this semester" means; pass both and the rule
   * evaluates as "completed or concurrent".
   */
  completedUnits: CompletedUnit[]
  courseCode?: string
  defaultCreditPoints?: number
  equivalents?: EquivalentsMap
}

export interface CoRequisiteResult {
  status: PrereqStatus
  missingUnits: string[]
  unknownRules: string[]
  /** Additive, mirroring PrereqResult: a credit-based co-requisite can fail too. */
  unmetCreditRules: string[]
}

/**
 * Evaluate a unit's co-requisites. Never throws, and returns "met" for a unit
 * with no co-requisite at all.
 */
export function evaluateCoRequisites(input: CoRequisiteInput): CoRequisiteResult {
  const result = evaluatePrerequisites({
    prerequisites: input ? input.coRequisites : null,
    completedUnits: (input && input.completedUnits) || [],
    courseCode: input ? input.courseCode : undefined,
    defaultCreditPoints: input ? input.defaultCreditPoints : undefined,
    equivalents: input ? input.equivalents : undefined,
  })

  return {
    status: result.status,
    missingUnits: result.missingUnits,
    unknownRules: result.unknownRules,
    unmetCreditRules: result.unmetCreditRules,
  }
}

/* ------------------------------------------------------------------ *
 * Study-plan checking
 * ------------------------------------------------------------------ */

export interface PlanUnit {
  code: string
  creditPoints?: number
}

export interface PlanSemester {
  units: PlanUnit[]
}

export interface PrereqIndexEntry {
  prerequisites?: string | null
  coRequisites?: string | null
  equivalents?: string | null
}

/**
 * Which column produced an issue.
 * - "prerequisite": a named unit is missing from an earlier semester.
 * - "credit": the prerequisite text is readable but a credit-point rule fails
 *   (e.g. "120cp of IFB% units"), so there is no single unit to point at.
 * - "coRequisite": the unit's co-requisite is not completed and is not in the
 *   same semester.
 */
export type PlanIssueKind = "prerequisite" | "coRequisite" | "credit"

/**
 * Either a bare code -> entry map or the whole `unit-prereqs.json` document.
 */
export type PrereqIndex =
  | Record<string, PrereqIndexEntry | undefined>
  | { units: Record<string, PrereqIndexEntry | undefined> }

export interface PlanIssue {
  semesterIndex: number
  unitCode: string
  status: "unmet" | "unknown"
  missingUnits: string[]
  unknownRules: string[]
  /**
   * The column behind this issue. At most one issue is emitted per unit per
   * semester, so a unit failing both its prerequisite and its co-requisite
   * appears once with `kind` naming the prerequisite and `missingUnits`
   * carrying both sets of codes.
   */
  kind: PlanIssueKind
}

export interface PlanIssueOptions {
  courseCode?: string
  defaultCreditPoints?: number
  /**
   * From buildEquivalentsMap. Optional: if the index itself carries
   * `equivalents` fields they are used automatically, so the UI can pass
   * `data/unit-prereqs.json` through and nothing else. An explicit map wins.
   */
  equivalents?: EquivalentsMap
}

function resolveIndex(index: PrereqIndex): Record<string, PrereqIndexEntry | undefined> {
  if (!index) return {}
  const maybeWrapped = index as { units?: Record<string, PrereqIndexEntry | undefined> }
  if (maybeWrapped.units && typeof maybeWrapped.units === "object") return maybeWrapped.units
  return index as Record<string, PrereqIndexEntry | undefined>
}

/**
 * One issue per offending unit per semester, in plan order.
 *
 * Prerequisites only count a unit as completed when it sits in a strictly
 * earlier semester - QUT wants the unit done before the dependent unit starts.
 * Co-requisites additionally accept units placed in the same semester, because
 * that is what "co-requisite" means. Nothing ever counts a later semester.
 *
 * A unit whose prerequisite and co-requisite both fail produces a single issue
 * (see PlanIssue.kind) rather than two, so callers keying by semester + code
 * cannot silently lose one of them.
 */
export function planIssues(
  plan: PlanSemester[],
  prereqIndex: PrereqIndex,
  options: PlanIssueOptions = {},
): PlanIssue[] {
  const issues: PlanIssue[] = []
  try {
    const index = resolveIndex(prereqIndex)
    const defaultCreditPoints =
      typeof options.defaultCreditPoints === "number"
        ? options.defaultCreditPoints
        : DEFAULT_CREDIT_POINTS
    const equivalents =
      options.equivalents !== undefined ? options.equivalents : buildEquivalentsMap(prereqIndex)

    const completed: CompletedUnit[] = []

    for (let semesterIndex = 0; semesterIndex < (plan || []).length; semesterIndex += 1) {
      const semester = plan[semesterIndex]
      const units = (semester && semester.units) || []

      // The semester's own units, for co-requisite evaluation.
      const alongside: CompletedUnit[] = []
      for (const unit of units) {
        if (!unit || typeof unit.code !== "string") continue
        const code = unit.code.trim().toUpperCase()
        if (!code) continue
        alongside.push({ code, creditPoints: unit.creditPoints })
      }

      for (const unit of units) {
        if (!unit || typeof unit.code !== "string") continue
        const code = unit.code.trim().toUpperCase()
        const entry = index[code] || index[unit.code.trim()]
        const prerequisites = entry ? entry.prerequisites : null
        const coRequisites = entry ? entry.coRequisites : null

        const prerequisiteResult = evaluatePrerequisites({
          prerequisites,
          completedUnits: completed,
          courseCode: options.courseCode,
          defaultCreditPoints,
          equivalents,
        })

        const coRequisiteResult = evaluateCoRequisites({
          coRequisites,
          // Completed units plus this semester's units: "take it alongside".
          completedUnits: completed.concat(alongside),
          courseCode: options.courseCode,
          defaultCreditPoints,
          equivalents,
        })

        const prerequisiteFailed = prerequisiteResult.status !== "met"
        const coRequisiteFailed = coRequisiteResult.status !== "met"
        if (!prerequisiteFailed && !coRequisiteFailed) continue

        // A definite unmet outranks an unknown co-requisite: the prerequisite
        // failure stands on its own evidence, and suppressing it because some
        // other column was unreadable would leave the student with nothing.
        const status: "unmet" | "unknown" =
          prerequisiteResult.status === "unmet" || coRequisiteResult.status === "unmet"
            ? "unmet"
            : "unknown"

        let kind: PlanIssueKind = "coRequisite"
        if (prerequisiteFailed) {
          const creditOnly =
            prerequisiteResult.status === "unmet" &&
            prerequisiteResult.missingUnits.length === 0 &&
            prerequisiteResult.unmetCreditRules.length > 0
          kind = creditOnly ? "credit" : "prerequisite"
        }

        issues.push({
          semesterIndex,
          unitCode: code,
          status,
          missingUnits: unique(
            prerequisiteResult.missingUnits.concat(coRequisiteResult.missingUnits),
          ),
          unknownRules: unique(
            prerequisiteResult.unknownRules.concat(coRequisiteResult.unknownRules),
          ),
          kind,
        })
      }

      // Only after the whole semester has been checked do its units count as
      // available to later semesters.
      for (const unit of alongside) completed.push(unit)
    }
  } catch {
    return issues
  }
  return issues
}
