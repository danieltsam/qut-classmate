import { test, expect } from "@playwright/test"
import { planIssues } from "../../lib/prerequisites"
import { checkAvailability } from "../../lib/unit-availability"
import {
  applyPlanMove,
  describeMove,
  findAvailabilityMove,
  findPrerequisiteMove,
  type FixIndex,
  type PlanMove,
} from "../../lib/plan-fixes"

/**
 * Pure-logic tests for lib/plan-fixes.ts. Playwright transpiles TS, so these import
 * the app module directly. No browser, no Next.js runtime.
 *
 * The fixtures are small on purpose: each one isolates the rule being tested, and
 * the prerequisite strings are QUT's own wording from data/unit-prereqs.json.
 */

const OFFERED = {
  s1: ["Semester 1, 2026 - Gardens Point (Internal)"],
  s2: ["Semester 2, 2026 - Gardens Point (Internal)"],
  both: [
    "Semester 1, 2026 - Gardens Point (Internal)",
    "Semester 2, 2026 - Gardens Point (Internal)",
  ],
} as const

function unit(uid: string, code: string) {
  return { uid, code }
}

/** A semester column with a uid per unit, the way the planner builds them. */
function semester(id: string, name: string, codes: string[]) {
  return { id, name, units: codes.map((code) => unit(`${id}:${code}`, code)) }
}

type TestSemester = ReturnType<typeof semester>

const COLUMNS = [
  ["s0", "Year 1, Semester 1"],
  ["s1", "Year 1, Semester 2"],
  ["s2", "Year 2, Semester 1"],
  ["s3", "Year 2, Semester 2"],
  ["s4", "Year 3, Semester 1"],
] as const

/** The codes in each column, in order, for order assertions. */
function shape(plan: Array<{ id: string; units: Array<{ code: string }> }>) {
  return plan.map((entry) => `${entry.id}:${entry.units.map((u) => u.code).join(",")}`)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

const PREREQ_DOC: FixIndex = {
  units: {
    CAB201: { prerequisites: null, offerings: [...OFFERED.s1] },
    CAB330: { prerequisites: "DSB100 or DSB102 or CAB201 or IFB220", offerings: [...OFFERED.s2] },
    ZZZ999: { prerequisites: null, offerings: [...OFFERED.both] },
    RSB500: { prerequisites: "ZZZ999", offerings: [...OFFERED.s1] },
  },
}

/** The request shape the planner builds from one `planIssues` row. */
function prerequisiteRequests(plan: TestSemester[], doc: FixIndex) {
  return planIssues(plan, doc)
    .filter((issue) => issue.status === "unmet")
    .map((issue) => ({
      issue,
      request: {
        unitUid: plan[issue.semesterIndex].units.find((u) => u.code === issue.unitCode)?.uid ?? "",
        unitCode: issue.unitCode,
        kind: issue.kind,
        missingUnits: issue.missingUnits,
      },
    }))
}

test.describe("findPrerequisiteMove - Move it later", () => {
  test("moves the unit one semester after the latest alternative in the plan", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB330"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["CAB201"]),
      semester(COLUMNS[2][0], COLUMNS[2][1], ["ZZZ999"]),
      semester(COLUMNS[3][0], COLUMNS[3][1], []),
      semester(COLUMNS[4][0], COLUMNS[4][1], []),
    ]

    const [{ issue, request }] = prerequisiteRequests(plan, PREREQ_DOC)
    expect(issue.kind).toBe("prerequisite")
    expect(issue.unitCode).toBe("CAB330")
    expect(issue.semesterIndex).toBe(0)

    const move = findPrerequisiteMove(plan, request, PREREQ_DOC)
    expect(move).not.toBeNull()
    const applied = move as PlanMove

    // CAB201 sits in column 1, so the unit belongs strictly after it, in column 2.
    expect(applied.toSemesterId).toBe("s2")
    expect(applied.fromSemesterId).toBe("s0")
    expect(applied.unitCode).toBe("CAB330")

    const moved = applyPlanMove(plan, applied)
    expect(shape(moved)).toEqual(["s0:", "s1:CAB201", "s2:ZZZ999,CAB330", "s3:", "s4:"])

    // And the move actually clears the problem it was offered for.
    const remaining = planIssues(moved, PREREQ_DOC).filter(
      (candidate) => candidate.unitCode === "CAB330",
    )
    expect(remaining).toEqual([])
  })

  test("no fix when the required unit is nowhere in the plan", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB330"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["ZZZ999"]),
      semester(COLUMNS[2][0], COLUMNS[2][1], []),
    ]

    const [{ issue, request }] = prerequisiteRequests(plan, PREREQ_DOC)
    expect(issue.unitCode).toBe("CAB330")
    // Every alternative is missing, so there is nothing to move the unit after.
    expect(issue.missingUnits).toContain("CAB201")
    expect(findPrerequisiteMove(plan, request, PREREQ_DOC)).toBeNull()
  })

  test("no fix for a credit-rule-only failure", () => {
    const doc: FixIndex = {
      units: {
        IFB201: { prerequisites: null, offerings: [...OFFERED.both] },
        IFB300: {
          prerequisites: "completion of 120cp of (IFB% or ITD%)",
          offerings: [...OFFERED.both],
        },
      },
    }
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["IFB201"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["IFB300"]),
      semester(COLUMNS[2][0], COLUMNS[2][1], []),
    ]

    const [{ issue, request }] = prerequisiteRequests(plan, doc)
    expect(issue.unitCode).toBe("IFB300")
    expect(issue.kind).toBe("credit")
    expect(issue.missingUnits).toEqual([])
    expect(findPrerequisiteMove(plan, request, doc)).toBeNull()
  })

  test("no fix when the unit already sits after every alternative", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB201"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["CAB330"]),
      semester(COLUMNS[2][0], COLUMNS[2][1], []),
    ]
    const move = findPrerequisiteMove(
      plan,
      { unitUid: "s1:CAB330", unitCode: "CAB330", kind: "prerequisite", missingUnits: ["CAB201"] },
      PREREQ_DOC,
    )
    expect(move).toBeNull()
  })

  test("no fix when the plan has no semester late enough", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB330"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["CAB201"]),
    ]
    const move = findPrerequisiteMove(
      plan,
      { unitUid: "s0:CAB330", unitCode: "CAB330", kind: "prerequisite", missingUnits: ["CAB201"] },
      PREREQ_DOC,
    )
    // The target would be a third column. The plan has two and we do not invent one.
    expect(move).toBeNull()
  })
})

test.describe("findAvailabilityMove - Find a slot", () => {
  test("prefers the nearest semester forward the unit is offered in", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB330", "CAB201"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], []),
      semester(COLUMNS[2][0], COLUMNS[2][1], []),
      semester(COLUMNS[3][0], COLUMNS[3][1], []),
    ]

    const move = findAvailabilityMove(
      plan,
      { unitUid: "s0:CAB330", unitCode: "CAB330" },
      PREREQ_DOC,
    )
    expect(move).not.toBeNull()
    const applied = move as PlanMove
    // CAB330 runs in Semester 2 only. Column 1 is the nearest Semester 2 column,
    // and CAB201 is already in column 0, so the rule holds there.
    expect(applied.toSemesterId).toBe("s1")
    expect(shape(applyPlanMove(plan, applied))).toEqual([
      "s0:CAB201",
      "s1:CAB330",
      "s2:",
      "s3:",
    ])
  })

  test("falls back to the nearest semester backward when nothing forward fits", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB201"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], []),
      semester(COLUMNS[2][0], COLUMNS[2][1], []),
      semester(COLUMNS[3][0], COLUMNS[3][1], []),
      semester(COLUMNS[4][0], COLUMNS[4][1], ["CAB330"]),
    ]
    // The last column is Semester 1, which CAB330 is not offered in, and there is
    // nothing after it. Column 3 is the nearest Semester 2 column behind it.
    const move = findAvailabilityMove(
      plan,
      { unitUid: "s4:CAB330", unitCode: "CAB330" },
      PREREQ_DOC,
    )
    expect(move).not.toBeNull()
    expect((move as PlanMove).toSemesterId).toBe("s3")
  })

  test("skips a candidate semester that would break the unit's prerequisites", () => {
    // RSB500 runs in Semester 1 only and sits in a Semester 2 column, so it has to
    // move. Column 2 is the nearest Semester 1 column, but ZZZ999 sits there and RSB500
    // needs ZZZ999 strictly earlier, so that candidate is skipped for column 4.
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], []),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["RSB500"]),
      semester(COLUMNS[2][0], COLUMNS[2][1], ["ZZZ999"]),
      semester(COLUMNS[3][0], COLUMNS[3][1], []),
      semester(COLUMNS[4][0], COLUMNS[4][1], []),
    ]

    const move = findAvailabilityMove(
      plan,
      { unitUid: "s1:RSB500", unitCode: "RSB500" },
      PREREQ_DOC,
    )
    expect(move).not.toBeNull()

    const applied = move as PlanMove
    expect(applied.toSemesterId).toBe("s4")

    const moved = applyPlanMove(plan, applied)
    expect(planIssues(moved, PREREQ_DOC).filter((issue) => issue.unitCode === "RSB500")).toEqual([])
  })

  test("no fix when every offered semester would break a prerequisite", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], []),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["RSB500"]),
      semester(COLUMNS[2][0], COLUMNS[2][1], ["ZZZ999"]),
      semester(COLUMNS[3][0], COLUMNS[3][1], []),
    ]
    // Column 2 is the only later Semester 1 column and it holds ZZZ999; column 0 is
    // the only earlier one and ZZZ999 would not be before it. No move is safe.
    const move = findAvailabilityMove(
      plan,
      { unitUid: "s1:RSB500", unitCode: "RSB500" },
      PREREQ_DOC,
    )
    expect(move).toBeNull()
  })

  test("no fix when the unit is already in a semester it is offered in", () => {
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB201"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], ["CAB330"]),
    ]
    const move = findAvailabilityMove(
      plan,
      { unitUid: "s1:CAB330", unitCode: "CAB330" },
      PREREQ_DOC,
    )
    expect(move).toBeNull()
  })

  test("no fix when the unit has no readable offering", () => {
    const doc: FixIndex = { units: { XXX100: { prerequisites: null, offerings: ["Summer, 2026"] } } }
    const plan = [
      semester(COLUMNS[0][0], COLUMNS[0][1], ["XXX100"]),
      semester(COLUMNS[1][0], COLUMNS[1][1], []),
    ]
    const move = findAvailabilityMove(plan, { unitUid: "s0:XXX100", unitCode: "XXX100" }, doc)
    expect(move).toBeNull()
  })
})

/** Whichever fix the strip would offer first: prerequisites, then availability. */
function findAnyFix(plan: TestSemester[], doc: FixIndex): PlanMove | null {
  for (const issue of planIssues(plan, doc)) {
    if (issue.status !== "unmet") continue
    const uid = plan[issue.semesterIndex].units.find((u) => u.code === issue.unitCode)?.uid
    if (!uid) continue
    const move = findPrerequisiteMove(
      plan,
      {
        unitUid: uid,
        unitCode: issue.unitCode,
        kind: issue.kind,
        missingUnits: issue.missingUnits,
      },
      doc,
    )
    if (move) return move
  }

  for (const column of plan) {
    for (const unit of column.units) {
      const move = findAvailabilityMove(plan, { unitUid: unit.uid, unitCode: unit.code }, doc)
      if (move) return move
    }
  }
  return null
}

test.describe("repeated fixing", () => {
  const start = () => [
    semester(COLUMNS[0][0], COLUMNS[0][1], ["CAB330", "RSB500"]),
    semester(COLUMNS[1][0], COLUMNS[1][1], ["CAB201"]),
    semester(COLUMNS[2][0], COLUMNS[2][1], ["ZZZ999"]),
    semester(COLUMNS[3][0], COLUMNS[3][1], []),
    semester(COLUMNS[4][0], COLUMNS[4][1], []),
  ]

  test("settles instead of looping, and no unit returns to a semester it left", () => {
    let plan = start()
    let steps = 0
    /** unit uid -> the columns it has occupied since the first fix, in order. */
    const visits = new Map<string, string[]>()

    for (; steps < 40; steps += 1) {
      const move = findAnyFix(plan, PREREQ_DOC)
      if (!move) break
      plan = applyPlanMove(plan, move)

      for (const column of plan) {
        for (const unit of column.units) {
          const history = visits.get(unit.uid) ?? []
          if (history[history.length - 1] !== column.id) history.push(column.id)
          visits.set(unit.uid, history)
        }
      }
    }

    // Settled well inside the guard, not because the guard ran out.
    expect(steps).toBeLessThan(40)
    expect(findAnyFix(plan, PREREQ_DOC)).toBeNull()

    for (const [uid, history] of visits) {
      expect(new Set(history).size, `${uid} visited ${history.join(" -> ")}`).toBe(history.length)
    }

    // Everything the fixture was complaining about is gone, not just quiet.
    expect(planIssues(plan, PREREQ_DOC)).toEqual([])
    for (const column of plan) {
      for (const unit of column.units) {
        expect(checkAvailability(unit.code, column.name, PREREQ_DOC).status).not.toBe("unavailable")
      }
    }
  })

  test("never drops or duplicates a unit, and never reorders the ones it leaves alone", () => {
    const before = start()
    let plan = before
    for (let step = 0; step < 40; step += 1) {
      const move = findAnyFix(plan, PREREQ_DOC)
      if (!move) break
      plan = applyPlanMove(plan, move)
    }

    const codes = (value: typeof plan) =>
      value.flatMap((column) => column.units.map((unit) => unit.code)).sort()
    expect(codes(plan)).toEqual(codes(before))
    expect(plan).toHaveLength(before.length)

    // Columns are reused in place, never reordered or invented.
    expect(plan.map((column) => column.id)).toEqual(before.map((column) => column.id))

    // A unit only ever moves as a whole, so the units that were already in a column
    // keep their relative order even when another unit is appended to it.
    for (const column of before) {
      const original = column.units.map((unit) => unit.code)
      const final = plan.find((entry) => entry.id === column.id)?.units.map((unit) => unit.code) ?? []
      const kept = original.filter((code) => final.indexOf(code) !== -1)
      expect(final.filter((code) => original.indexOf(code) !== -1)).toEqual(kept)
    }
  })

  test("the plan passed in is never mutated", () => {
    const plan = start()
    const untouched = clone(plan)
    const before = JSON.stringify(plan)

    const issue = planIssues(plan, PREREQ_DOC).find(
      (candidate) => candidate.unitCode === "CAB330" && candidate.status === "unmet",
    )
    expect(issue).toBeTruthy()
    const move = findPrerequisiteMove(
      plan,
      {
        unitUid: "s0:CAB330",
        unitCode: "CAB330",
        kind: issue?.kind ?? "prerequisite",
        missingUnits: issue?.missingUnits ?? [],
      },
      PREREQ_DOC,
    )
    expect(move).not.toBeNull()
    const moved = applyPlanMove(plan, move as PlanMove)

    expect(moved).not.toBe(plan)

    // Same check on the availability path: it builds candidate plans of its own.
    const beforeAvailability = JSON.stringify(moved)
    const availabilityMove = findAvailabilityMove(
      moved,
      // uids stay with the unit across a move, so this is still the s0 uid.
      { unitUid: "s0:CAB330", unitCode: "CAB330" },
      PREREQ_DOC,
    )
    expect(availabilityMove).not.toBeNull()
    expect(JSON.stringify(moved)).toBe(beforeAvailability)
    expect(plan).toEqual(untouched)
    expect(JSON.stringify(plan)).toBe(before)
  })
})

test.describe("copy", () => {
  test("confirmation names the unit and the semester it went to", () => {
    expect(
      describeMove({
        unitUid: "s3:CAB330",
        unitCode: "CAB330",
        fromSemesterId: "s0",
        fromSemesterName: "Year 1, Semester 1",
        toSemesterId: "s3",
        toSemesterName: "Year 2, Semester 2",
      }),
    ).toBe("Moved CAB330 to Year 2, Semester 2.")
  })

  test("no em-dash in the confirmation", () => {
    const text = describeMove({
      unitUid: "x",
      unitCode: "cab330",
      fromSemesterId: "a",
      fromSemesterName: "Year 1, Semester 1",
      toSemesterId: "b",
      toSemesterName: "Year 2, Semester 2",
    })
    expect(text).not.toContain("\u2014")
    expect(text).toContain("CAB330")
  })
})




