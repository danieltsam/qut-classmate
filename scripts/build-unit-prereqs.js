#!/usr/bin/env node
/**
 * build-unit-prereqs.js
 *
 * Merges one or more raw prerequisite scrape files into the shape the Course
 * Planner consumes: data/unit-prereqs.json
 *
 *   { builtAt, year, count, units: { "CAB201": { title, prerequisites,
 *     antiRequisites, coRequisites, equivalents, assumedKnowledge,
 *     offerings: [...] } } }
 *
 * Usage:
 *   node scripts/build-unit-prereqs.js [raw.json ...] [--out path] [--year 2027]
 *
 * Defaults to .scratch/unit-prereqs-raw.json. Later files win, except that a
 * good record is never replaced by a `missing: true` placeholder — the course
 * scraper's raw file and this one can be merged in either order.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = 'data/unit-prereqs.json';

function parseArgs(argv) {
  const args = { paths: [], out: DEFAULT_OUT, year: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[++i];
    else if (arg === '--year') args.year = Number.parseInt(argv[++i], 10) || null;
    else if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      args.paths.push(arg);
    }
  }
  if (args.paths.length === 0) args.paths.push('.scratch/unit-prereqs-raw.json');
  return args;
}

function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function normaliseUnits(raw) {
  const units = raw.units;
  if (!units) return {};
  if (Array.isArray(units)) {
    return Object.fromEntries(units.filter(Boolean).map((u) => [String(u.code).toUpperCase(), u]));
  }
  return Object.fromEntries(
    Object.entries(units).map(([code, entry]) => [String(code).toUpperCase(), { code, ...entry }])
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const merged = new Map();
  const sources = [];
  let missingTotal = 0;
  let year = args.year;

  for (const rawPath of args.paths) {
    const abs = path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
    if (!fs.existsSync(abs)) {
      console.error(`Skipping missing raw file: ${rawPath}`);
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const units = normaliseUnits(raw);
    const codes = Object.keys(units);
    sources.push({ path: path.relative(ROOT, abs), count: codes.length, year: raw.year ?? null });
    if (!year && raw.year) year = raw.year;

    for (const code of codes) {
      const entry = units[code];
      if (!entry) continue;
      if (entry.missing) {
        missingTotal++;
        // Only record the placeholder if nothing better exists yet.
        if (!merged.has(code)) merged.set(code, { missing: true });
        continue;
      }
      // A real record always replaces a placeholder.
      merged.set(code, entry);
    }
  }

  const units = {};
  const offeringSets = {};
  for (const [code, entry] of merged) {
    if (!entry || entry.missing) continue;
    units[code] = {
      title: entry.title ?? null,
      prerequisites: entry.prerequisites ?? null,
      antiRequisites: entry.antiRequisites ?? null,
      coRequisites: entry.coRequisites ?? null,
      equivalents: entry.equivalents ?? null,
      assumedKnowledge: entry.assumedKnowledge ?? null,
      offerings: Array.isArray(entry.offerings) ? entry.offerings : [],
    };
    offeringSets[code] = units[code].offerings.length;
  }

  // Year: explicit flag, else the most common year in the merged records.
  if (!year) {
    const counts = new Map();
    for (const entry of merged.values()) {
      if (entry && entry.year) counts.set(entry.year, (counts.get(entry.year) || 0) + 1);
    }
    year = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  const payload = {
    builtAt: new Date().toISOString(),
    year,
    count: Object.keys(units).length,
    units,
  };

  const outAbs = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
  writeJsonAtomic(outAbs, payload);

  const dropped = [...merged.values()].filter((e) => e && e.missing).length;
  const stats = fs.statSync(outAbs);

  console.log('Sources:');
  for (const s of sources) console.log(`  ${s.path} -> ${s.count} records (year ${s.year ?? 'n/a'})`);
  console.log(`Merged placeholders (missing:true) across sources: ${missingTotal}`);
  console.log(`Dropped missing/incomplete units: ${dropped}`);
  console.log(`Year: ${year}`);
  console.log(`Units with a record: ${payload.count}`);
  console.log(`Output: ${path.relative(ROOT, outAbs) || outAbs} (${(stats.size / 1024).toFixed(1)} KB)`);

  // A short breakdown so a re-run is easy to eyeball.
  const withPrereqs = Object.values(units).filter((u) => u.prerequisites).length;
  const withOfferings = Object.values(units).filter((u) => u.offerings.length).length;
  console.log(`Units with prerequisites: ${withPrereqs}`);
  console.log(`Units with at least one offering: ${withOfferings}`);
}

try {
  main();
} catch (err) {
  console.error('Fatal:', err);
  process.exit(1);
}
