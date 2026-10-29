import { test, expect } from "@playwright/test"
import {
  DEFAULT_CREDIT_POINTS,
  buildEquivalentsMap,
  evaluateAntiRequisites,
  evaluateCoRequisites,
  evaluatePrerequisites,
  parsePrerequisites,
  planIssues,
  type PrereqNode,
} from "../../lib/prerequisites"

/**
 * Pure-logic tests for lib/prerequisites.ts. Playwright transpiles TS, so these
 * import the app module directly - no browser, no Next.js runtime.
 *
 * The prerequisite strings below are QUT's own wording, captured from
 * data/unit-prereqs.json verbatim. They are the specification: if a real
 * string breaks the parser, the parser is wrong.
 */

const REAL = {
  CAB330: "DSB100 or DSB102 or CAB201 or IFB220",
  IFB398:
    "[( IAB251 or CAB302 or IAB320 or IAB321 or IFB343 or CAB330 or IAB305) and completion of 120cp of (IFB% or ITD% or CAB% or IAB%)] or [192cp of DS01]",
  IFB104: null,
  CAB201:
    "IFB104 or ITD104 or MZB126 or MZB127 or EGD126 or MXB103 or EGB103 or EGD103",
} as const

const IFB104_ANTI = "CAB201, EGB103, EGD103"

/** A completed unit, 12cp unless told otherwise. */
function u(code: string, creditPoints: number = DEFAULT_CREDIT_POINTS) {
  return { code, creditPoints }
}

/** n completed units of the given prefix, 12cp each. */
function cpOf(prefix: string, totalCreditPoints: number) {
  const perUnit = 12
  const count = Math.ceil(totalCreditPoints / perUnit)
  return Array.from({ length: count }, (_, index) => u(`${prefix}${100 + index}`, perUnit))
}

test.describe("parsePrerequisites - AST shape", () => {
  test("bare OR list becomes a flat or node", () => {
    const ast = parsePrerequisites(REAL.CAB201) as PrereqNode
    expect(ast.type).toBe("or")
    if (ast.type !== "or") return
    expect(ast.children).toHaveLength(8)
    expect(ast.children.every((child) => child.type === "unit")).toBe(true)
  })

  test("empty and null input parse to null", () => {
    expect(parsePrerequisites(null)).toBeNull()
    expect(parsePrerequisites(undefined)).toBeNull()
    expect(parsePrerequisites("")).toBeNull()
    expect(parsePrerequisites("   ")).toBeNull()
  })

  test("IFB398 keeps both branches, the and-group and the two credit rules", () => {
    const ast = parsePrerequisites(REAL.IFB398) as PrereqNode
    expect(ast.type).toBe("or")
    if (ast.type !== "or") return
    expect(ast.children).toHaveLength(2)

    const [first, second] = ast.children
    expect(first.type).toBe("and")
    expect(second).toEqual({ type: "courseCredits", creditPoints: 192, courseCode: "DS01" })

    if (first.type !== "and") return
    expect(first.children[0].type).toBe("or")
    expect(first.children[1]).toEqual({
      type: "prefixCredits",
      creditPoints: 120,
      prefixes: ["IFB", "ITD", "CAB", "IAB"],
    })
  })

  test("an unparenthesised prefix list still yields prefixCredits", () => {
    const ast = parsePrerequisites("completion of 60cp of IFB% or ITD%")
    expect(ast).toEqual({
      type: "prefixCredits",
      creditPoints: 60,
      prefixes: ["IFB", "ITD"],
    })
  })

  test("commas read as alternatives, and binds tighter than or", () => {
    expect(parsePrerequisites("CAB201, IFB104")).toEqual({
      type: "or",
      children: [
        { type: "unit", code: "CAB201" },
        { type: "unit", code: "IFB104" },
      ],
    })

    const ast = parsePrerequisites("CAB201 and IFB104 or MZB126") as PrereqNode
    expect(ast.type).toBe("or")
    if (ast.type !== "or") return
    expect(ast.children[0].type).toBe("and")
  })

  test("stray closing brackets are tolerated", () => {
    const ast = parsePrerequisites("CAB201)") as PrereqNode
    expect(ast).toEqual({ type: "unit", code: "CAB201" })
  })

  test("unreadable text becomes a single unknown node, never an exception", () => {
    for (const input of ["see handbook", "))(", "CAB201 or see handbook", "(CAB201 or ITD104", "!"]) {
      expect(() => parsePrerequisites(input)).not.toThrow()
    }
    expect(parsePrerequisites("see handbook")?.type).toBe("unknown")
    expect(parsePrerequisites("(CAB201 or ITD104")?.type).toBe("unknown")
  })
})

test.describe("CAB330 prerequisites (real)", () => {
  test("met when any listed unit is completed", () => {
    for (const code of ["DSB100", "DSB102", "CAB201", "IFB220"]) {
      const result = evaluatePrerequisites({
        prerequisites: REAL.CAB330,
        completedUnits: [u(code)],
      })
      expect(result.status, `completing ${code}`).toBe("met")
      expect(result.missingUnits).toEqual([])
    }
  })

  test("unmet with the alternatives listed when nothing matches", () => {
    const result = evaluatePrerequisites({
      prerequisites: REAL.CAB330,
      completedUnits: [u("EGB101"), u("MXB100")],
    })
    expect(result.status).toBe("unmet")
    expect(result.missingUnits).toEqual(["DSB100", "DSB102", "CAB201", "IFB220"])
    expect(result.unknownRules).toEqual([])
  })

  test("code matching is case-insensitive", () => {
    expect(evaluatePrerequisites({ prerequisites: REAL.CAB330, completedUnits: [u("cab201")] }).status).toBe("met")
  })
})

test.describe("CAB201 prerequisites (real)", () => {
  test("met with IFB104 completed", () => {
    const result = evaluatePrerequisites({
      prerequisites: REAL.CAB201,
      completedUnits: [u("IFB104")],
    })
    expect(result.status).toBe("met")
    expect(result.missingUnits).toEqual([])
  })

  test("completing only CAB201 itself does not satisfy its own prerequisite", () => {
    const result = evaluatePrerequisites({
      prerequisites: REAL.CAB201,
      completedUnits: [u("CAB201")],
    })
    expect(result.status).toBe("unmet")
    expect(result.missingUnits).toEqual(
      expect.arrayContaining(["IFB104", "ITD104", "MZB126", "MZB127", "EGD126", "MXB103", "EGB103", "EGD103"]),
    )
  })

  test("credit points never stand in for a required unit", () => {
    // 120cp of unrelated units: no cp rule exists here, so this stays unmet.
    const result = evaluatePrerequisites({
      prerequisites: REAL.CAB201,
      completedUnits: cpOf("XYZ", 120),
    })
    expect(result.status).toBe("unmet")
    expect(result.unmetCreditRules).toEqual([])
  })
})

test.describe("IFB104 (real) - no prerequisites, but anti-requisites", () => {
  test("null prerequisites are met", () => {
    const result = evaluatePrerequisites({ prerequisites: REAL.IFB104, completedUnits: [] })
    expect(result.status).toBe("met")
    expect(result.missingUnits).toEqual([])
    expect(result.unmetCreditRules).toEqual([])
    expect(result.unknownRules).toEqual([])
  })

  test("a completed anti-requisite blocks the unit", () => {
    const result = evaluateAntiRequisites({
      antiRequisites: IFB104_ANTI,
      completedUnits: [u("CAB201")],
    })
    expect(result.blocked).toEqual(["CAB201"])
  })

  test("every listed anti-requisite blocks, in list order", () => {
    const result = evaluateAntiRequisites({
      antiRequisites: IFB104_ANTI,
      completedUnits: [u("EGD103"), u("CAB201")],
    })
    expect(result.blocked).toEqual(["CAB201", "EGD103"])
  })

  test("unrelated completed units do not block", () => {
    expect(
      evaluateAntiRequisites({ antiRequisites: IFB104_ANTI, completedUnits: [u("ITD104"), u("CAB202")] }).blocked,
    ).toEqual([])
  })
})

test.describe("IFB398 (real) - unit list plus credit points", () => {
  test("CAB330 alone is not enough: the 120cp rule still fails", () => {
    const result = evaluatePrerequisites({
      prerequisites: REAL.IFB398,
      completedUnits: [u("CAB330")],
    })
    expect(result.status).toBe("unmet")
    expect(result.unmetCreditRules).toContain("120 cp from IFB/ITD/CAB/IAB units")
    expect(result.unknownRules).toEqual([])
  })

  test("CAB330 plus 120cp of IFB units is met", () => {
    const result = evaluatePrerequisites({
      prerequisites: REAL.IFB398,
      completedUnits: [u("CAB330"), ...cpOf("IFB", 120)],
    })
    expect(result.status).toBe("met")
  })

  test("prefix credit alone does not stand in for the named units", () => {
    // 240cp of ABC units, but the "and" still needs one of the listed units.
    const result = evaluatePrerequisites({
      prerequisites: REAL.IFB398,
      completedUnits: cpOf("ABC", 240),
      // Pinning the wrong course settles the "192cp of DS01" branch so the
      // verdict is a definite unmet rather than an unknown.
      courseCode: "IX85",
    })
    expect(result.status).toBe("unmet")
    expect(result.missingUnits).toEqual(
      expect.arrayContaining(["IAB251", "CAB302", "CAB330", "IAB305"]),
    )
    expect(result.unmetCreditRules).toContain("120 cp from IFB/ITD/CAB/IAB units")
  })

  test("prefix credit is summed only across matching prefixes", () => {
    // 96cp IFB + 60cp XYZ: only the IFB points count, so 96 < 120.
    const result = evaluatePrerequisites({
      prerequisites: REAL.IFB398,
      completedUnits: [u("CAB330"), ...cpOf("IFB", 96), ...cpOf("XYZ", 60)],
    })
    expect(result.status).toBe("unmet")
    expect(result.unmetCreditRules).toContain("120 cp from IFB/ITD/CAB/IAB units")
  })

  test("an unparseable fragment anywhere makes the whole verdict unknown", () => {
    const result = evaluatePrerequisites({
      prerequisites: `${REAL.IFB398} or see handbook`,
      completedUnits: [u("CAB330")],
    })
    expect(result.status).toBe("unknown")
    expect(result.unknownRules.length).toBeGreaterThan(0)
    expect(result.missingUnits).toEqual([])
    expect(result.unmetCreditRules).toEqual([])
  })

  test("an unparseable fragment never downgrades a provable failure into a pass", () => {
    const result = evaluatePrerequisites({
      prerequisites: "CAB302 and see the handbook",
      completedUnits: [u("CAB330")],
    })
    expect(result.status).not.toBe("met")
  })
})

test.describe("real samples with grouped and / prose credit rules", () => {
  // Also captured from data/unit-prereqs.json on the same day.
  const ABB212 = "( ABB101 or DAB101 or DLB101 or DTB101 or ABD101) and ( ABB102 or DAB102 or DLB102 or DTB102 or ABD102)"
  const ABB202 = "84 credit points of completed Architecture study (ABB% or D% units)"
  const ABB235 = "84 credit point of completed Architecture study (ABB% or D% units)"
  const ABB246 = "36 credit points of completed Landscape Architecture study (ABB24% or DL% units)"
  const ABB224 = "Completion of 96cp or EGB273"

  test("both brackets of an and-group must be satisfied", () => {
    expect(
      evaluatePrerequisites({ prerequisites: ABB212, completedUnits: [u("ABB101")] }).status,
    ).toBe("unmet")

    expect(
      evaluatePrerequisites({ prerequisites: ABB212, completedUnits: [u("ABB101"), u("DTB102")] }).status,
    ).toBe("met")
  })

  test("'84 credit points of completed Architecture study (ABB% or D% units)' is a prefix credit rule", () => {
    expect(parsePrerequisites(ABB202)).toEqual({
      type: "prefixCredits",
      creditPoints: 84,
      prefixes: ["ABB", "D"],
    })
    expect(parsePrerequisites(ABB235)).toEqual(parsePrerequisites(ABB202))

    // 7 x 12cp = 84cp across the ABB/D prefixes.
    expect(
      evaluatePrerequisites({
        prerequisites: ABB202,
        completedUnits: [...cpOf("ABB", 48), ...cpOf("DAB", 36)],
      }).status,
    ).toBe("met")

    const short = evaluatePrerequisites({
      prerequisites: ABB202,
      completedUnits: [...cpOf("ABB", 48), ...cpOf("DLB", 24)],
    })
    expect(short.status).toBe("unmet")
    expect(short.unmetCreditRules).toEqual(["84 cp from ABB/D units"])
  })

  test("prefix wildcards keep their year digits", () => {
    expect(parsePrerequisites(ABB246)).toEqual({
      type: "prefixCredits",
      creditPoints: 36,
      prefixes: ["ABB24", "DL"],
    })
    expect(
      evaluatePrerequisites({
        prerequisites: ABB246,
        completedUnits: [u("ABB241"), u("ABB244"), u("DLB302")],
      }).status,
    ).toBe("met")
  })

  test("'Completion of 96cp or EGB273' accepts either the total or the unit", () => {
    expect(parsePrerequisites(ABB224)).toEqual({
      type: "or",
      children: [
        { type: "totalCredits", creditPoints: 96 },
        { type: "unit", code: "EGB273" },
      ],
    })

    expect(evaluatePrerequisites({ prerequisites: ABB224, completedUnits: [u("EGB273")] }).status).toBe("met")
    expect(evaluatePrerequisites({ prerequisites: ABB224, completedUnits: cpOf("ABC", 96) }).status).toBe("met")

    const short = evaluatePrerequisites({ prerequisites: ABB224, completedUnits: cpOf("ABC", 84) })
    expect(short.status).toBe("unmet")
    expect(short.unmetCreditRules).toEqual(["96 cp of completed study"])
  })
})

test.describe("course credit rules", () => {
  test("no courseCode and too few total cp is a sound unmet", () => {
    const result = evaluatePrerequisites({
      prerequisites: "192cp of DS01",
      completedUnits: [u("CAB330")],
    })
    expect(result.status).toBe("unmet")
    expect(result.unmetCreditRules).toContain("192 cp from course DS01")
  })

  test("no courseCode but enough total cp is unknown, not unmet", () => {
    const result = evaluatePrerequisites({
      prerequisites: "192cp of DS01",
      completedUnits: cpOf("ABC", 192),
    })
    expect(result.status).toBe("unknown")
    expect(result.unknownRules.length).toBe(1)
  })

  test("matching courseCode with enough cp is met", () => {
    const result = evaluatePrerequisites({
      prerequisites: "192cp of DS01",
      completedUnits: cpOf("ABC", 192),
      courseCode: "DS01",
    })
    expect(result.status).toBe("met")
  })

  test("a different courseCode is unmet", () => {
    const result = evaluatePrerequisites({
      prerequisites: "192cp of DS01",
      completedUnits: cpOf("ABC", 240),
      courseCode: "IX85",
    })
    expect(result.status).toBe("unmet")
    expect(result.unmetCreditRules).toEqual(["192 cp from course DS01"])
  })
})

test.describe("garbage input", () => {
  test("never throws", () => {
    const cases: Array<string | null | undefined> = [
      "see handbook",
      "",
      "   ",
      null,
      undefined,
      "((",
      "][][",
      "and or",
      "120cp of",
      "completion of 120cp of ()",
      "CAB201 and",
    ]
    for (const prerequisites of cases) {
      expect(() => evaluatePrerequisites({ prerequisites, completedUnits: [] })).not.toThrow()
    }
  })

  test("null and empty prerequisites are met", () => {
    // Documented rule 1: nothing to satisfy.
    expect(evaluatePrerequisites({ prerequisites: null, completedUnits: [] }).status).toBe("met")
    expect(evaluatePrerequisites({ prerequisites: "", completedUnits: [] }).status).toBe("met")
  })

  test("prose and unbalanced brackets are unknown, not met", () => {
    for (const prerequisites of ["see handbook", "(CAB201 or ITD104", "][]["]) {
      const result = evaluatePrerequisites({
        prerequisites,
        completedUnits: [u("CAB201"), u("ITD104")],
      })
      expect(result.status, prerequisites).not.toBe("met")
      expect(result.unknownRules.length, prerequisites).toBeGreaterThan(0)
    }
  })

  test("even with every listed unit completed, unknown text blocks a met verdict", () => {
    const result = evaluatePrerequisites({
      prerequisites: "CAB201 or see handbook",
      completedUnits: [u("CAB201")],
    })
    expect(result.status).toBe("unknown")
    expect(result.missingUnits).toEqual([])
    expect(result.unknownRules).toEqual(["see handbook"])
  })

  test("a missing anti-requisite string blocks nothing and does not throw", () => {
    expect(evaluateAntiRequisites({ antiRequisites: null, completedUnits: [u("CAB201")] }).blocked).toEqual([])
    expect(evaluateAntiRequisites({ antiRequisites: "", completedUnits: [u("CAB201")] }).blocked).toEqual([])
  })
})

test.describe("planIssues", () => {
  const index = {
    CAB201: { prerequisites: REAL.CAB201 },
    IFB398: { prerequisites: REAL.IFB398 },
    IFB104: { prerequisites: REAL.IFB104 },
    CAB330: { prerequisites: REAL.CAB330 },
  }

  test("a prerequisite in a later semester is flagged", () => {
    const plan = [{ units: [u("CAB201")] }, { units: [u("IFB104")] }]
    const issues = planIssues(plan, index)

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      semesterIndex: 0,
      unitCode: "CAB201",
      status: "unmet",
    })
    expect(issues[0].missingUnits).toContain("IFB104")
  })

  test("a prerequisite in an earlier semester is not flagged", () => {
    const plan = [{ units: [u("IFB104")] }, { units: [u("CAB201")] }]
    expect(planIssues(plan, index)).toEqual([])
  })

  test("a prerequisite in the SAME semester is still flagged", () => {
    const plan = [{ units: [u("IFB104"), u("CAB201")] }]
    const issues = planIssues(plan, index)

    expect(issues).toHaveLength(1)
    expect(issues[0].unitCode).toBe("CAB201")
    expect(issues[0].semesterIndex).toBe(0)
    expect(issues[0].status).toBe("unmet")
  })

  test("units with met or null prerequisites are never flagged", () => {
    const plan = [{ units: [u("IFB104")] }, { units: [u("CAB201"), u("IFB398")] }]
    const issues = planIssues(plan, { CAB201: { prerequisites: "IFB104" }, IFB104: { prerequisites: null } })
    // IFB398 is not in this index, so it has no recorded prerequisite.
    expect(issues).toEqual([])
  })

  test("unknown prerequisites surface with status unknown, not unmet", () => {
    const plan = [{ units: [u("CAB201")] }]
    const issues = planIssues(plan, { CAB201: { prerequisites: "see handbook" } })

    expect(issues).toHaveLength(1)
    expect(issues[0].status).toBe("unknown")
    expect(issues[0].missingUnits).toEqual([])
    expect(issues[0].unknownRules).toEqual(["see handbook"])
  })

  test("one issue per offending unit, in plan order", () => {
    const plan = [{ units: [u("IFB398"), u("CAB201")] }, { units: [u("CAB330")] }]
    const issues = planIssues(plan, index, { courseCode: "DS01" })

    expect(issues.map((issue) => issue.unitCode)).toEqual(["IFB398", "CAB201"])
    expect(issues.map((issue) => issue.semesterIndex)).toEqual([0, 0])
    // CAB330 sits in semester 1 and is satisfied by CAB201 from semester 0.
    expect(issues.map((issue) => issue.unitCode)).not.toContain("CAB330")
    // IFB398 is in semester 0, so CAB330 - planned later - cannot help it.
    expect(issues[0].missingUnits).toContain("CAB330")
    expect(issues[0].missingUnits).toContain("IAB251")
  })

  test("credit-point rules accumulate across semesters", () => {
    const onlyIfb398 = { IFB398: { prerequisites: REAL.IFB398 } }
    const allUnits = [u("CAB330"), ...cpOf("IFB", 120)]
    const plan = [{ units: allUnits.slice(0, 5) }, { units: allUnits.slice(5) }, { units: [u("IFB398")] }]
    expect(planIssues(plan, onlyIfb398, { courseCode: "DS01" })).toEqual([])
  })

  test("accepts the whole unit-prereqs.json document as the index", () => {
    const doc = { units: { CAB201: { title: "X", prerequisites: REAL.CAB201 } } }
    const issues = planIssues([{ units: [u("CAB201")] }], doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].unitCode).toBe("CAB201")
  })
})


test.describe("equivalents", () => {
  // QUT swaps units over time; the equivalents column is how it says "same unit".
  const IFB104_EQUIVALENTS = { IFB104: ["INB104", "ITB001", "ITD104"] }

  test("a completed equivalent satisfies the prerequisite when the map says so", () => {
    const withMap = evaluatePrerequisites({
      prerequisites: "IFB104",
      completedUnits: [u("ITD104")],
      equivalents: IFB104_EQUIVALENTS,
    })
    expect(withMap.status).toBe("met")
    expect(withMap.missingUnits).toEqual([])
  })

  test("without a map an equivalent is still unmet", () => {
    const withoutMap = evaluatePrerequisites({
      prerequisites: "IFB104",
      completedUnits: [u("ITD104")],
    })
    expect(withoutMap.status).toBe("unmet")
    expect(withoutMap.missingUnits).toEqual(["IFB104"])

    // An empty map is the same as no map.
    expect(
      evaluatePrerequisites({ prerequisites: "IFB104", completedUnits: [u("ITD104")], equivalents: {} }).status,
    ).toBe("unmet")
  })

  test("the declaration works from either side of the pair", () => {
    // Declared on the required unit...
    expect(
      evaluatePrerequisites({
        prerequisites: "IFB104",
        completedUnits: [u("ITD104")],
        equivalents: { IFB104: ["ITD104"] },
      }).status,
    ).toBe("met")

    // ...and declared on the completed unit.
    expect(
      evaluatePrerequisites({
        prerequisites: "IFB104",
        completedUnits: [u("ITD104")],
        equivalents: { ITD104: ["IFB104"] },
      }).status,
    ).toBe("met")
  })

  test("chained declarations join up (IFB104 ~ ITD104 ~ INB104)", () => {
    expect(
      evaluatePrerequisites({
        prerequisites: "IFB104",
        completedUnits: [u("INB104")],
        equivalents: { IFB104: ["ITD104"], ITD104: ["INB104"] },
      }).status,
    ).toBe("met")
  })

  test("a real OR-list prerequisite is satisfied through any branch's equivalent", () => {
    const result = evaluatePrerequisites({
      prerequisites: REAL.CAB201,
      completedUnits: [u("ITD104")],
      equivalents: IFB104_EQUIVALENTS,
    })
    expect(result.status).toBe("met")
    expect(result.missingUnits).toEqual([])
  })

  test("an unmet prerequisite still lists the canonical code, never the equivalent", () => {
    const result = evaluatePrerequisites({
      prerequisites: "IFB104 or EGB103",
      completedUnits: [u("MZB126")],
      equivalents: IFB104_EQUIVALENTS,
    })
    expect(result.status).toBe("unmet")
    expect(result.missingUnits).toEqual(["IFB104", "EGB103"])
    expect(result.missingUnits).not.toContain("ITD104")
  })

  test("equivalent lookups ignore case on both sides", () => {
    expect(
      evaluatePrerequisites({
        prerequisites: "ifb104",
        completedUnits: [u("itd104")],
        equivalents: { "ifb104": ["itd104"] },
      }).status,
    ).toBe("met")
  })

  test("completing an equivalent of an anti-requisite still blocks", () => {
    const result = evaluateAntiRequisites({
      antiRequisites: "CAB201, EGB103, EGD103",
      completedUnits: [u("ITD121")],
      equivalents: { CAB201: ["ITD121"] },
    })
    expect(result.blocked).toEqual(["CAB201"])

    // Same, declared from the completed unit's side.
    expect(
      evaluateAntiRequisites({
        antiRequisites: "CAB201",
        completedUnits: [u("ITD121")],
        equivalents: { ITD121: ["CAB201"] },
      }).blocked,
    ).toEqual(["CAB201"])
  })

  test("without a map an equivalent does not block", () => {
    expect(
      evaluateAntiRequisites({ antiRequisites: "CAB201", completedUnits: [u("ITD121")] }).blocked,
    ).toEqual([])
  })

  test("buildEquivalentsMap flattens the real document shape", () => {
    const doc = {
      builtAt: "2026-10-28T15:40:49.417Z",
      year: 2027,
      count: 3,
      units: {
        IFB104: {
          title: "Programming",
          prerequisites: null,
          antiRequisites: "CAB201, EGB103, EGD103",
          equivalents: "INB104, ITB001, ITD104",
          offerings: [],
        },
        // QUT writes some of these with "or" instead of commas.
        ABB101: { title: "Architecture", prerequisites: null, equivalents: "DAB101 or DLB101 or DTB101 or ABD101" },
        // Nulls and ragged whitespace are dropped, not crashed on.
        CAB201: { title: "Programming Principles", prerequisites: REAL.CAB201, equivalents: null },
        ABB102: { title: "Design", prerequisites: null, equivalents: "  DAB102,  DLB102 ,DTB102,ADB102  " },
        ABB103: { title: "Blank", prerequisites: null, equivalents: "   " },
      },
    }

    expect(buildEquivalentsMap(doc)).toEqual({
      IFB104: ["INB104", "ITB001", "ITD104"],
      ABB101: ["DAB101", "DLB101", "DTB101", "ABD101"],
      ABB102: ["DAB102", "DLB102", "DTB102", "ADB102"],
    })
  })

  test("buildEquivalentsMap accepts a bare units map and copes with junk", () => {
    expect(
      buildEquivalentsMap({ IFB104: { equivalents: "INB104,ITD104" }, CAB201: { equivalents: null } }),
    ).toEqual({ IFB104: ["INB104", "ITD104"] })

    expect(buildEquivalentsMap(null)).toEqual({})
    expect(buildEquivalentsMap(undefined)).toEqual({})
    expect(buildEquivalentsMap({} as Record<string, { equivalents?: string | null }>)).toEqual({})
  })

  test("planIssues picks equivalents up from the document automatically", () => {
    const doc = {
      units: {
        CAB201: { prerequisites: "IFB104", equivalents: null },
        IFB104: { prerequisites: null, equivalents: "INB104, ITD104" },
      },
    }
    const plan = [{ units: [u("ITD104")] }, { units: [u("CAB201")] }]

    expect(planIssues(plan, doc)).toEqual([])

    // Same plan, no equivalents column: now it is a real issue.
    const noEquivalents = {
      units: {
        CAB201: { prerequisites: "IFB104", equivalents: null },
        IFB104: { prerequisites: null, equivalents: null },
      },
    }
    const issues = planIssues(plan, noEquivalents)
    expect(issues).toHaveLength(1)
    expect(issues[0].missingUnits).toEqual(["IFB104"])
  })

  test("planIssues honours an explicitly passed map", () => {
    const plan = [{ units: [u("INB104")] }, { units: [u("IFB104") ] }]
    const index = {
      IFB104: { prerequisites: "ITD104", equivalents: null },
      ITD104: { prerequisites: null, equivalents: null },
    }
    // ITD104 is not planned, so this is an issue...
    expect(planIssues(plan, index)).toHaveLength(1)
    // ...unless the caller declares INB104 an equivalent of ITD104.
    expect(planIssues(plan, index, { equivalents: { ITD104: ["INB104"] } })).toEqual([])
  })

  test("no map leaves existing verdicts untouched", () => {
    const cases = [
      { prerequisites: REAL.CAB201, completedUnits: [u("IFB104")] },
      { prerequisites: REAL.CAB201, completedUnits: [u("ITD104")] },
      { prerequisites: REAL.IFB398, completedUnits: [u("CAB330")] },
      { prerequisites: REAL.IFB398, completedUnits: [u("CAB330"), ...cpOf("IFB", 120)] },
      { prerequisites: "see handbook", completedUnits: [u("CAB201")] },
      { prerequisites: null, completedUnits: [] },
    ]

    for (const entry of cases) {
      const implicit = evaluatePrerequisites(entry)
      const explicit = evaluatePrerequisites({ ...entry, equivalents: undefined })
      const empty = evaluatePrerequisites({ ...entry, equivalents: {} })
      expect(explicit).toEqual(implicit)
      expect(empty).toEqual(implicit)
    }
  })
})


test.describe("co-requisites", () => {
  // A co-requisite may be taken alongside, so same-semester counts; a later
  // semester never does.
  const index = {
    CAB202: { coRequisites: "MZB126" },
    MZB126: { prerequisites: null },
  }

  test("satisfied by a unit in the same semester", () => {
    expect(planIssues([{ units: [u("CAB202"), u("MZB126")] }], index)).toEqual([])
  })

  test("already completed in an earlier semester is met", () => {
    expect(planIssues([{ units: [u("MZB126")] }, { units: [u("CAB202")] }], index)).toEqual([])
  })

  test("placed in a later semester is unmet, with the code reported", () => {
    const issues = planIssues([{ units: [u("CAB202")] }, { units: [u("MZB126")] }], index)

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      semesterIndex: 0,
      unitCode: "CAB202",
      status: "unmet",
      kind: "coRequisite",
    })
    expect(issues[0].missingUnits).toEqual(["MZB126"])
  })

  test("evaluateCoRequisites treats same-semester units as available", () => {
    const alongside = evaluateCoRequisites({
      coRequisites: "MZB126",
      completedUnits: [u("CAB202"), u("MZB126")],
    })
    expect(alongside.status).toBe("met")
    expect(alongside.missingUnits).toEqual([])

    // Same call without the concurrent unit is an unmet co-requisite.
    const alone = evaluateCoRequisites({ coRequisites: "MZB126", completedUnits: [u("CAB202")] })
    expect(alone.status).toBe("unmet")
    expect(alone.missingUnits).toEqual(["MZB126"])
  })

  test("a unit with no co-requisite is met", () => {
    expect(evaluateCoRequisites({ coRequisites: null, completedUnits: [] }).status).toBe("met")
    expect(evaluateCoRequisites({ coRequisites: "", completedUnits: [] }).status).toBe("met")
  })

  test("an unparseable co-requisite is unknown, never unmet", () => {
    const result = evaluateCoRequisites({ coRequisites: "see handbook", completedUnits: [] })
    expect(result.status).toBe("unknown")
    expect(result.unknownRules).toEqual(["see handbook"])
    expect(result.missingUnits).toEqual([])
  })

  test("planIssues reports an unreadable co-requisite as unknown, not unmet", () => {
    const issues = planIssues([{ units: [u("CAB202")] }], {
      CAB202: { coRequisites: "see handbook" },
    })

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ unitCode: "CAB202", status: "unknown", kind: "coRequisite" })
    expect(issues[0].unknownRules).toEqual(["see handbook"])
    expect(issues[0].missingUnits).toEqual([])
  })

  test("a co-requisite is satisfied by an equivalent", () => {
    expect(
      evaluateCoRequisites({
        coRequisites: "MZB126",
        completedUnits: [u("MXB103")],
        equivalents: { MZB126: ["MXB103"] },
      }).status,
    ).toBe("met")
  })

  test("one issue per unit even when prerequisite and co-requisite both fail", () => {
    // The planner keys its problem map by semester + code, so a second issue
    // for the same unit would vanish.
    const issues = planIssues([{ units: [u("CAB202")] }], {
      CAB202: { prerequisites: "IFB104", coRequisites: "MZB126" },
    })

    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("prerequisite")
    expect(issues[0].missingUnits).toEqual(["IFB104", "MZB126"])
  })

  test("kind distinguishes a pure credit-point failure", () => {
    const issues = planIssues([{ units: [u("CAB330")] }], {
      CAB330: { prerequisites: "completion of 120cp of (IFB%)" },
    })

    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe("credit")
    expect(issues[0].missingUnits).toEqual([])
    expect(issues[0].status).toBe("unmet")
  })

  test("kind defaults to prerequisite for a missing unit", () => {
    const issues = planIssues([{ units: [u("CAB201")] }], { CAB201: { prerequisites: "IFB104" } })
    expect(issues[0].kind).toBe("prerequisite")
  })
})

test.describe("equivalents are credit-bearing", () => {
  const IFB_IS_ITD = { IFB104: ["ITD104"] }

  test("a swapped code still counts toward a prefix credit rule", () => {
    // 12cp from the equivalent ITD104 + 108cp of real IFB units = 120cp.
    const units = [u("ITD104"), ...cpOf("IFB", 108)]

    const withMap = evaluatePrerequisites({
      prerequisites: "120cp of IFB%",
      completedUnits: units,
      equivalents: IFB_IS_ITD,
    })
    expect(withMap.status).toBe("met")

    // Same units, no map: the swapped code contributes nothing.
    const withoutMap = evaluatePrerequisites({
      prerequisites: "120cp of IFB%",
      completedUnits: units,
    })
    expect(withoutMap.status).toBe("unmet")
    expect(withoutMap.unmetCreditRules).toEqual(["120 cp from IFB units"])
  })

  test("the equivalent is counted once, not twice", () => {
    const units = [u("ITD104"), ...cpOf("IFB", 96)] // 108cp total
    expect(
      evaluatePrerequisites({
        prerequisites: "120cp of IFB%",
        completedUnits: units,
        equivalents: IFB_IS_ITD,
      }).status,
    ).toBe("unmet")
  })

  test("chained equivalents carry credit too", () => {
    // INB104 ~ ITD104 ~ IFB104, so INB104's credit lands in the IFB bucket.
    const units = [u("INB104"), ...cpOf("IFB", 108)]
    expect(
      evaluatePrerequisites({
        prerequisites: "120cp of IFB%",
        completedUnits: units,
        equivalents: { IFB104: ["ITD104"], ITD104: ["INB104"] },
      }).status,
    ).toBe("met")
  })

  test("the IFB398 credit rule accepts an equivalent toward its 120cp", () => {
    // CAB330 satisfies the unit side; 108cp IFB + ITD104 (equivalent of
    // IFB104) reaches the 120cp threshold.
    const result = evaluatePrerequisites({
      prerequisites: REAL.IFB398,
      completedUnits: [u("CAB330"), ...cpOf("IFB", 108), u("ITD104")],
      equivalents: IFB_IS_ITD,
      courseCode: "IX85",
    })
    expect(result.status).toBe("met")
  })
})
