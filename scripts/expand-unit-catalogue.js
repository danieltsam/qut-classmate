/**
 * Expands the unit catalogue by paginating every prefix we already know about.
 *
 * The original catalogue held 823 units across 114 prefixes, which is roughly one
 * page per prefix. QUT's search returns 10 per page, so most prefixes were cut off
 * after their first page and units like EUB111 never made it in.
 *
 * Two details matter:
 *
 * 1. QUT's query param is a search, not a prefix filter. Asking for CAB202 returns
 *    links for EGH449. So every result is checked against the prefix before it is
 *    kept, or the catalogue fills with unrelated units.
 * 2. Writes are merged into the existing file rather than replacing it, so a
 *    partial run never loses what an earlier scrape found.
 *
 * Usage:
 *   node scripts/expand-unit-catalogue.js                  # prefixes already in the data
 *   node scripts/expand-unit-catalogue.js --all            # every A-Z 3-letter prefix
 *   node scripts/expand-unit-catalogue.js --max-prefixes 10
 */

const fs = require("fs");
const path = require("path");

const CODES_PATH = path.join(__dirname, "../data/qut-unit-codes.json");
const PAGE_SIZE = 10;
const MAX_PAGES_PER_PREFIX = 60;
const CONCURRENCY = 3;
const DELAY_MS = 150;

const QUT_BASE = "https://qutvirtual4.qut.edu.au";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function searchUrl(query, start) {
  const url = new URL(`${QUT_BASE}/web/qut/search`);
  url.searchParams.set("profile", "UNIT");
  url.searchParams.set("params.showOldUnits", "false");
  url.searchParams.set("params.query", query);
  url.searchParams.set("params.start", String(start));
  return url.toString();
}

function parseUnits(html) {
  const units = [];
  // Each result block carries the code and title in a heading like
  // "CAB201 - Object-Oriented Programming and Design".
  const pattern = /<h4[^>]*class="[^"]*content-title[^"]*"[^>]*>([\s\S]*?)<\/h4>/g;
  for (const match of html.matchAll(pattern)) {
    const text = match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const found = text.match(/^([A-Z]{3}\d{3})\s*[-–]\s*(.+)$/);
    if (!found) continue;
    units.push({ code: found[1], title: found[2].trim() });
  }
  return units;
}

async function scrapePrefix(prefix) {
  const collected = new Map();
  for (let page = 0; page < MAX_PAGES_PER_PREFIX; page += 1) {
    let html;
    try {
      const res = await fetch(searchUrl(prefix, page * PAGE_SIZE), { headers: HEADERS });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    const pageUnits = parseUnits(html);

    // Keep only units that genuinely start with this prefix. QUT's query is a
    // fuzzy search, so a prefix can return unrelated codes.
    for (const unit of pageUnits) {
      if (unit.code.startsWith(prefix)) collected.set(unit.code, unit);
    }

    if (pageUnits.length < PAGE_SIZE) break;
    await sleep(DELAY_MS);
  }
  return collected;
}

function allPrefixes() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const out = [];
  for (const a of letters) for (const b of letters) for (const c of letters) out.push(a + b + c);
  return out;
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
  const units = new Map((existing.units || []).map((u) => [u.code, u]));
  const before = units.size;

  const argv = process.argv.slice(2);
  const useAll = argv.includes("--all");
  const limitArg = argv.find((a) => a.startsWith("--max-prefixes="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 0;

  let prefixes = useAll
    ? allPrefixes()
    : [...new Set((existing.units || []).map((u) => u.code.slice(0, 3)))].sort();

  if (limit > 0) prefixes = prefixes.slice(0, limit);

  console.log(`Scraping ${prefixes.length} prefixes (${useAll ? "full A-Z sweep" : "known prefixes only"})`);

  let index = 0;
  let added = 0;
  let done = 0;

  async function worker() {
    while (index < prefixes.length) {
      const prefix = prefixes[index++];
      const found = await scrapePrefix(prefix);
      for (const [code, unit] of found) {
        if (!units.has(code)) added += 1;
        units.set(code, unit);
      }
      done += 1;
      if (done % 10 === 0 || done === prefixes.length) {
        console.log(
          `  ${done}/${prefixes.length} prefixes, ${prefix} found ${found.size}, total units ${units.size} (+${added})`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const merged = [...units.values()].sort((a, b) => a.code.localeCompare(b.code));
  const payload = {
    ...existing,
    scrapedAt: new Date().toISOString(),
    codes: merged.map((u) => u.code),
    units: merged,
    stats: {
      total: merged.length,
      modern: merged.length,
      legacy: 0,
      previousTotal: before,
      added: added,
      prefixesScraped: prefixes.length,
    },
  };

  fs.writeFileSync(CODES_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${merged.length} units (was ${before}, added ${added})`);
}

main().catch((err) => {
  console.error("expand-unit-catalogue failed:", err);
  process.exit(1);
});
