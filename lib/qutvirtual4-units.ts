import * as cheerio from "cheerio"
import {
  buildUnitSearchUrl,
  fetchVirtual4SearchPage,
  QUT_VIRTUAL4_BASE,
} from "@/lib/qutvirtual4-session"

export interface ParsedUnit {
  code: string
  title: string
  legacy: boolean
}

export interface UnitCatalog {
  scrapedAt: string
  codes: string[]
  units: ParsedUnit[]
  stats: {
    total: number
    modern: number
    legacy: number
  }
}

const MODERN_UNIT_TITLE_PATTERN = /^([A-Z]{3}\d{3}[A-Z]?)\s*-\s*(.+)$/
const LEGACY_UNIT_TITLE_PATTERN = /^([A-Z]{2}\s?\d{3}-\d+)\s*-\s*(.+)$/

function normalizeLegacyCode(code: string): string {
  return code.replace(/\s+/g, "")
}

export function parseUnitsFromSearchHtml(html: string): ParsedUnit[] {
  const $ = cheerio.load(html)
  const units: ParsedUnit[] = []

  $(".search-unit-info h4.content-title").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim()
    if (!text) {
      return
    }

    const modernMatch = text.match(MODERN_UNIT_TITLE_PATTERN)
    if (modernMatch) {
      units.push({
        code: modernMatch[1],
        title: modernMatch[2].trim(),
        legacy: false,
      })
      return
    }

    const legacyMatch = text.match(LEGACY_UNIT_TITLE_PATTERN)
    if (legacyMatch) {
      units.push({
        code: normalizeLegacyCode(legacyMatch[1]),
        title: legacyMatch[2].trim(),
        legacy: true,
      })
    }
  })

  return units
}

function twoLetterPrefixes(): string[] {
  const prefixes: string[] = []
  for (let i = 0; i < 26; i += 1) {
    for (let j = 0; j < 26; j += 1) {
      prefixes.push(`${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}`)
    }
  }
  return prefixes
}

function threeLetterPrefixes(): string[] {
  const prefixes: string[] = []
  for (let i = 0; i < 26; i += 1) {
    for (let j = 0; j < 26; j += 1) {
      for (let k = 0; k < 26; k += 1) {
        prefixes.push(
          `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}${String.fromCharCode(65 + k)}`,
        )
      }
    }
  }
  return prefixes
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function scrapePaginatedSearch(options: {
  query: string
  showOldUnits: boolean
  sortKey?: number
  delayMs?: number
  maxPages?: number
}): Promise<ParsedUnit[]> {
  const units: ParsedUnit[] = []
  const pageSize = 10
  const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize
    const searchUrl = buildUnitSearchUrl({
      query: options.query,
      start,
      showOldUnits: options.showOldUnits,
      sortKey: options.sortKey,
    })

    const { html } = await fetchVirtual4SearchPage(searchUrl)
    const pageUnits = parseUnitsFromSearchHtml(html)

    if (pageUnits.length === 0) {
      break
    }

    units.push(...pageUnits)

    if (pageUnits.length < pageSize) {
      break
    }

    if (options.delayMs) {
      await sleep(options.delayMs)
    }
  }

  return units
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function mergeUnits(target: Map<string, ParsedUnit>, units: ParsedUnit[]): void {
  for (const unit of units) {
    const existing = target.get(unit.code)
    if (!existing || (existing.legacy && !unit.legacy)) {
      target.set(unit.code, unit)
    }
  }
}

export async function scrapeUnitCatalog(options?: {
  includeLegacy?: boolean
  includeCurrent?: boolean
  delayMs?: number
  maxWildcardPages?: number
  prefixLength?: 1 | 2 | 3
  concurrency?: number
}): Promise<UnitCatalog> {
  const includeLegacy = options?.includeLegacy ?? true
  const includeCurrent = options?.includeCurrent ?? true
  const delayMs = options?.delayMs ?? 100
  const prefixLength = options?.prefixLength ?? 3
  const concurrency = options?.concurrency ?? 4
  const byCode = new Map<string, ParsedUnit>()

  if (includeLegacy) {
    console.log("Scraping legacy + historical units via wildcard search...")
    const legacyUnits = await scrapePaginatedSearch({
      query: "*",
      showOldUnits: true,
      sortKey: 0,
      delayMs,
      maxPages: options?.maxWildcardPages,
    })
    mergeUnits(byCode, legacyUnits)
    console.log(`  wildcard collected ${legacyUnits.length} entries (${byCode.size} unique)`)
  }

  if (includeCurrent) {
    const prefixes =
      prefixLength === 3
        ? threeLetterPrefixes()
        : prefixLength === 2
          ? twoLetterPrefixes()
          : "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

    console.log(`Scraping current catalog via ${prefixLength}-letter prefix search (${prefixes.length} queries)...`)

    let completed = 0
    await mapWithConcurrency(prefixes, concurrency, async (prefix) => {
      const prefixUnits = await scrapePaginatedSearch({
        query: prefix,
        showOldUnits: false,
        delayMs,
      })

      mergeUnits(byCode, prefixUnits)
      completed += 1

      if (prefixUnits.length > 0) {
        console.log(`  ${prefix}: +${prefixUnits.length} (total unique ${byCode.size})`)
      } else if (completed % 250 === 0) {
        console.log(`  progress: ${completed}/${prefixes.length} prefixes, ${byCode.size} unique units`)
      }
    })
  }

  const units = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
  const modern = units.filter((unit) => !unit.legacy).length
  const legacy = units.length - modern

  return {
    scrapedAt: new Date().toISOString(),
    codes: units.map((unit) => unit.code),
    units,
    stats: {
      total: units.length,
      modern,
      legacy,
    },
  }
}

export function catalogToJson(catalog: UnitCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`
}

export function getVirtual4UnitSearchUrl(query: string): string {
  return `${QUT_VIRTUAL4_BASE}/web/qut/search?profile=UNIT&params.showOldUnits=false&params.query=${encodeURIComponent(query)}`
}
