import catalog from "@/data/qut-unit-codes.json"
import type { ParsedUnit } from "@/lib/qutvirtual4-units"

type UnitCatalogFile = {
  codes: string[]
  units?: ParsedUnit[]
}

const unitCatalog = catalog as UnitCatalogFile

export const QUT_UNIT_CODES: string[] = unitCatalog.codes

const unitsByCode = new Map<string, ParsedUnit>(
  (unitCatalog.units ?? []).map((unit) => [unit.code.toUpperCase(), unit]),
)

/**
 * Filters unit codes based on a search query
 */
export function filterUnitCodes(query: string): string[] {
  if (!query) return []

  const upperQuery = query.toUpperCase()

  const codeMatches = QUT_UNIT_CODES.filter((code) => code.startsWith(upperQuery))
  if (codeMatches.length > 0) {
    return codeMatches.slice(0, 8)
  }

  const containsMatches = QUT_UNIT_CODES.filter((code) => code.includes(upperQuery))
  if (containsMatches.length > 0) {
    return containsMatches.slice(0, 8)
  }

  if (upperQuery.length >= 3) {
    const titleMatches = [...unitsByCode.values()]
      .filter((unit) => unit.title.toUpperCase().includes(upperQuery))
      .map((unit) => unit.code)

    return titleMatches.slice(0, 8)
  }

  return []
}

export function getUnitTitle(code: string): string | undefined {
  return unitsByCode.get(code.toUpperCase())?.title
}
