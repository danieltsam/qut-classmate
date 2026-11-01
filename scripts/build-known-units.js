#!/usr/bin/env node
/**
 * Builds data/known-units.json: every unit code this project has ever seen, with
 * the best title we can attach to it.
 *
 * Why this exists. QUT's unit page returns the same "Page not found" page for a
 * retired unit (CAB202) as for a code that never existed (ZZZ999), so the
 * timetable error path could not tell them apart and told students a retired
 * unit "is no longer offered by QUT" even when we had no evidence. Absence from
 * our own datasets does not prove retirement either: EUB111 is a live unit that
 * appears in none of them. All this file claims is "this code is one we have
 * seen before", which is enough to choose honest wording in the error path.
 *
 * Inputs (all committed):
 *   data/unit-prereqs.json    1345 units, titles + equivalents
 *   data/unit-meta.json        719 units, titles + synopses
 *   data/qut-unit-codes.json   823 units, titles
 *   data/qut-unit-classes.json 823 units, no titles
 *
 * Output:
 *   data/known-units.json  { builtAt, count, titledCount, units: { CODE: { title, seenIn } } }
 *
 * Usage:
 *   node scripts/build-known-units.js
 *   node scripts/build-known-units.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const OUTPUT_PATH = path.join(DATA_DIR, 'known-units.json');

/** Sources in the order we prefer their title, because the first is QUT's own wording. */
const SOURCES = [
  { key: 'meta', file: 'unit-meta.json' },
  { key: 'prereqs', file: 'unit-prereqs.json' },
  { key: 'codes', file: 'qut-unit-codes.json' },
  { key: 'classes', file: 'qut-unit-classes.json' },
];

const UNIT_CODE_RE = /^[A-Z]{3}\d{3}$/;

function readJson(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing ${file} at ${full}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function normaliseCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function cleanTitle(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Each dataset stores its units differently: three are maps keyed by code, the
 * catalogue is an array of `{ code, title }`. Returns `code -> title`.
 */
function unitsFrom(source, document) {
  const out = new Map();

  if (source.key === 'codes') {
    for (const unit of document.units ?? []) {
      const code = normaliseCode(unit?.code);
      if (!code) continue;
      out.set(code, cleanTitle(unit.title));
    }
    return out;
  }

  const table = source.key === 'classes' ? document.data ?? {} : document.units ?? {};
  for (const key of Object.keys(table)) {
    const code = normaliseCode(key);
    if (!code) continue;
    out.set(code, cleanTitle(table[key]?.title));
  }

  return out;
}

function main() {
  const units = {};

  for (const source of SOURCES) {
    const document = readJson(source.file);
    const entries = unitsFrom(source, document);

    let added = 0;
    let filledTitle = 0;
    for (const [rawCode, title] of entries) {
      if (!UNIT_CODE_RE.test(rawCode)) continue;
      const existing = units[rawCode];
      if (!existing) {
        units[rawCode] = { title, seenIn: [source.key] };
        added += 1;
        continue;
      }
      existing.seenIn.push(source.key);
      // "Prefer a real title over an empty one" - and, given equal emptiness,
      // the earlier source in SOURCES wins because it is QUT's own page copy.
      if (!existing.title && title) {
        existing.title = title;
        filledTitle += 1;
      }
    }

    console.log(`  ${source.key.padEnd(8)} ${String(entries.size).padStart(5)} units, ${added} new, ${filledTitle} titles filled in`);
  }

  // Sorted keys so the committed file diffs cleanly.
  const sorted = {};
  for (const code of Object.keys(units).sort()) {
    const entry = units[code];
    sorted[code] = { title: entry.title, seenIn: entry.seenIn.sort() };
  }

  const count = Object.keys(sorted).length;
  const titledCount = Object.values(sorted).filter((entry) => entry.title).length;
  const payload = {
    builtAt: new Date().toISOString(),
    count,
    titledCount,
    units: sorted,
  };

  if (process.argv.includes('--dry-run')) {
    console.log(`Dry run: ${count} units, ${titledCount} with a title. Nothing written.`);
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  const kilobytes = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0);
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_PATH)}: ${count} units, ${titledCount} with a title, ${kilobytes} KB.`);
}

main();
