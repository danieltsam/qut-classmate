import { readFileSync } from "node:fs"
import path from "node:path"
import { test, expect } from "@playwright/test"
import {
  findReplacements,
  lookupUnit,
  significantWords,
  type KnownUnitsIndex,
  type PrereqIndex,
} from "../../lib/unit-lookup"
import { unitNoLongerOfferedMessage, unitNotFoundMessage } from "../../lib/messages"

/**
 * Pure-logic tests for lib/unit-lookup.ts.
 *
 * The rules being checked: a code is only "known" if it is in the index, and a
 * replacement is only suggested when there is real evidence for it (a declared
 * equivalence, or a title that shares more than one generic word). Silence is a
 * valid answer and is asserted as such, because a wrong suggestion about someone's
 * degree costs more than no suggestion.
 *
 * The fixtures are deliberately small. The last describe block runs the same
 * functions against the committed data, so a fixture cannot pass while the real
 * index behaves differently.
 */

const KNOWN: KnownUnitsIndex = {
  units: {
    ABC100: { title: "Introduction to Data Structures", seenIn: ["meta"] },
    ABC200: { title: "Data Structures and Algorithms", seenIn: ["meta"] },
    XYZ200: { title: "Data Structures for Engineers", seenIn: ["meta"] },
    ABC300: { title: "Mining and Resources Law", seenIn: ["meta"] },
    XYZ300: { title: "Process Mining", seenIn: ["meta"] },
    ABC400: { title: "Engineering Mathematics", seenIn: ["meta"] },
    ABC401: { title: "Engineering Mathematics II", seenIn: ["meta"] },
    XYZ401: { title: "Engineering Mathematics for Surveyors", seenIn: ["meta"] },
    OLD100: { title: "Ancient Rhetoric", seenIn: ["meta"] },
    OLD101: { title: "Classical Debate", seenIn: ["meta"] },
    EVB203: { title: "Geospatial Information Science", seenIn: ["meta"] },
    CLB223: { title: "Geospatial Information Systems", seenIn: ["meta"] },
  },
}

const PREREQS: PrereqIndex = {
  units: {
    OLD100: { title: "Ancient Rhetoric", equivalents: "ABC200, XYZ200" },
    ABC200: { title: "Data Structures and Algorithms", equivalents: "OLD101" },
  },
}

test.describe("lookupUnit", () => {
  test("a code in the index is known, with its title", () => {
    expect(lookupUnit("ABC200", KNOWN)).toEqual({
      kind: "known",
      title: "Data Structures and Algorithms",
    })
  })

  test("a code we have never seen is unknown", () => {
    expect(lookupUnit("ZZZ999", KNOWN)).toEqual({ kind: "unknown" })
  })

  test("is case and whitespace insensitive", () => {
    expect(lookupUnit("  abc200 ", KNOWN).kind).toBe("known")
  })

  test("a code that is not three letters plus three digits is unknown", () => {
    for (const code of ["ABC20", "ABCD200", "200ABC", ""]) {
      expect(lookupUnit(code, KNOWN)).toEqual({ kind: "unknown" })
    }
  })

  test("accepts a bare code -> entry map as well as the document", () => {
    const bare = { ABC200: { title: "Data Structures and Algorithms", seenIn: ["meta"] } }
    expect(lookupUnit("ABC200", bare).kind).toBe("known")
  })

  test("a missing or empty index knows nothing, rather than throwing", () => {
    expect(lookupUnit("ABC200", null)).toEqual({ kind: "unknown" })
    expect(lookupUnit("ABC200", {})).toEqual({ kind: "unknown" })
  })
})

test.describe("significantWords", () => {
  test("drops the words that describe every unit equally", () => {
    expect(significantWords("Introduction to Data Structures and Algorithms")).toEqual([
      "data",
      "structures",
      "algorithms",
    ])
  })

  test("ignores punctuation and short tokens", () => {
    expect(significantWords("Design 1: Space & Scale")).toEqual(["design", "space", "scale"])
  })
})

test.describe("findReplacements", () => {
  test("declared equivalents come first", () => {
    const found = findReplacements("OLD100", KNOWN, PREREQS)

    expect(found.map((item) => item.code).slice(0, 2)).toEqual(["ABC200", "XYZ200"])
    expect(found[0].reason).toBe("equivalent")
  })

  test("an equivalence declared on the other unit counts too", () => {
    // ABC200 declares OLD101, never the reverse.
    const found = findReplacements("OLD101", KNOWN, PREREQS)

    expect(found.map((item) => item.code)).toContain("ABC200")
    expect(found[0].reason).toBe("equivalent")
  })

  test("never suggests the code it was asked about", () => {
    const found = findReplacements("ABC200", KNOWN, PREREQS)

    expect(found.map((item) => item.code)).not.toContain("ABC200")
  })

  test("caps the list at three", () => {
    const manyUnits: Record<string, { title: string; seenIn: string[] }> = {
      ABC400: { title: "Engineering Mathematics", seenIn: ["meta"] },
    }
    for (const suffix of ["II", "III", "IV", "V", "VI"]) {
      manyUnits[`XYZ4${suffix.length}${suffix.length}`] = {
        title: `Engineering Mathematics ${suffix}`,
        seenIn: ["meta"],
      }
    }

    expect(findReplacements("ABC400", { units: manyUnits }, {})).toHaveLength(3)
  })

  test("prefers a unit from the same school when the title match is equal", () => {
    const found = findReplacements("ABC400", KNOWN, {})

    // ABC401 shares every title word and the ABC prefix; the XYZ entry does not.
    expect(found[0].code).toBe("ABC401")
  })

  test("a single shared generic word is not a recommendation", () => {
    // "Mining and Resources Law" shares only "mining" with "Process Mining".
    expect(findReplacements("ABC300", KNOWN, {})).toEqual([])
  })

  test("two shared words from different schools are worth showing", () => {
    const found = findReplacements("EVB203", KNOWN, {})

    expect(found.map((item) => item.code)).toEqual(["CLB223"])
  })

  test("an unknown code gets no suggestions at all", () => {
    expect(findReplacements("ZZZ999", KNOWN, PREREQS)).toEqual([])
  })

  test("a known unit with no titles to compare returns nothing rather than guessing", () => {
    const untitled: KnownUnitsIndex = { units: { ABC500: { title: "", seenIn: ["classes"] } } }

    expect(findReplacements("ABC500", untitled, {})).toEqual([])
  })
})

test.describe("the two sentences", () => {
  test("a known code is reported as retired, with replacements named", () => {
    const one = unitNoLongerOfferedMessage("OLD100", [{ code: "ABC200", title: "Data Structures" }])
    expect(one).toBe("OLD100 is no longer offered by QUT. It was replaced by ABC200 Data Structures.")

    const several = unitNoLongerOfferedMessage("OLD100", [
      { code: "ABC200", title: "Data Structures" },
      { code: "XYZ200", title: "Algorithms" },
    ])
    expect(several).toBe(
      "OLD100 is no longer offered by QUT. Related units still running: ABC200 Data Structures, XYZ200 Algorithms.",
    )

    expect(unitNoLongerOfferedMessage("OLD100")).toBe(
      "OLD100 is no longer offered by QUT. Check the current course structure, or search for the replacement unit.",
    )
  })

  test("an unknown code is never called retired", () => {
    const message = unitNotFoundMessage("ZZZ999")

    expect(message).toBe(
      "We could not find ZZZ999 at QUT. Check the code, or search for the unit by name on QUT Virtual.",
    )
    expect(message).not.toMatch(/no longer offered/i)
  })
})

/**
 * The committed index, read exactly as the route reads it. If data/known-units.json
 * is rebuilt and CAB202 starts appearing (or stops), this is where it shows up.
 */
test.describe("against data/known-units.json", () => {
  const known = JSON.parse(
    readFileSync(path.join(process.cwd(), "data/known-units.json"), "utf8"),
  ) as KnownUnitsIndex

  test("CAB202 is not in the index, so it cannot be called retired", () => {
    expect(lookupUnit("CAB202", known)).toEqual({ kind: "unknown" })
  })

  test("ZZZ999 is not in the index either", () => {
    expect(lookupUnit("ZZZ999", known)).toEqual({ kind: "unknown" })
  })

  test("CAB201 is known and carries QUT's title", () => {
    expect(lookupUnit("CAB201", known)).toEqual({
      kind: "known",
      title: "Object-Oriented Programming and Design",
    })
  })

  test("a retired unit that is in the index gets the retirement sentence, not the typo one", () => {
    const lookup = lookupUnit("SEB202", known)

    expect(lookup.kind).toBe("known")
    expect(unitNoLongerOfferedMessage("SEB202")).toMatch(/no longer offered/i)
  })

  test("findReplacements suggests programming units for CAB201", () => {
    const prereqs = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/unit-prereqs.json"), "utf8"),
    ) as PrereqIndex

    const found = findReplacements("CAB201", known, prereqs)

    expect(found.length).toBeGreaterThan(0)
    expect(found.length).toBeLessThanOrEqual(3)
    expect(found.map((item) => item.code)).not.toContain("CAB201")
    // Titles are the reason these are here, so they must have a real one.
    for (const item of found) {
      expect(item.title.trim()).not.toBe("")
    }
  })
})
