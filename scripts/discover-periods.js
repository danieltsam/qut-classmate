#!/usr/bin/env node
/**
 * Discovers the teaching period IDs QUT Virtual 4 is currently advertising.
 *
 * QUT rotates these IDs every year, which used to mean hand-editing
 * lib/teaching-periods.ts before each semester. The IDs are not guessable
 * arithmetic — they are arbitrary Liferay content IDs — but QUT does publish
 * them inside every unit search page, paired with a readable code like
 * SEM-1/2027/U. So we read a handful of unit pages and harvest the pairs.
 *
 * Usage:
 *   node scripts/discover-periods.js            # write data/teaching-periods.json
 *   node scripts/discover-periods.js --dry-run  # print what it found, write nothing
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../data/teaching-periods.json');
const SEARCH_BASE = 'https://qutvirtual4.qut.edu.au/web/qut/search';

// One unit per faculty that we know is long-running, so at least one page will
// list every open semester even if a given unit is discontinued.
const PROBE_UNITS = ['CAB201', 'EFB335', 'MXB103', 'LLB101', 'NSB203'];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The exam-timetable dropdown carries the pairing:
//   p_arg_values=<numericId>&p_arg_names=p_teaching_period&p_arg_values=SEM-1/2027/U
// It appears once per period per unit, so harvesting several units unions them.
const PERIOD_PATTERN =
  /p_arg_values=(\d{6,8})&p_arg_names=p_teaching_period&p_arg_values=([A-Z]{2,4}-\w+\/\d{4}\/[A-Z]+)/g;

function parsePeriodCode(code) {
  // e.g. SEM-1/2027/U  ->  { year: 2027, semester: 1, exchange: false }
  const match = code.match(/^([A-Z]+)-(\w+)\/(\d{4})\/[A-Z]+$/);
  if (!match) return { year: 0, semester: 0, exchange: false };
  const [, prefix, slot, year] = match;
  const semesterNumber = Number.parseInt(slot, 10);
  return {
    year: Number.parseInt(year, 10),
    semester: Number.isNaN(semesterNumber) ? 0 : semesterNumber,
    exchange: /^XCH$/i.test(prefix) || /^EXC/i.test(prefix),
  };
}

function displayName(code) {
  const { year, semester, exchange } = parsePeriodCode(code);
  if (!year) return code;
  const label = semester ? `Semester ${semester}, ${year}` : `${code}, ${year}`;
  return exchange ? `Exchange ${label}` : label;
}

// Rough date range per semester number; QUT's real dates drift a week or so,
// but this only feeds the dropdown subtitle.
function dateRange(semester, year) {
  if (semester === 1) return `Feb ${year} to Jun ${year}`;
  if (semester === 2) return `Jul ${year} to Nov ${year}`;
  return `Nov ${year} to Feb ${year + 1}`;
}

async function fetchPeriodsForUnit(unitCode) {
  const url = `${SEARCH_BASE}?profile=UNIT&params.showOldUnits=false&params.query=${unitCode}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Unit search page for ${unitCode} returned ${res.status}`);
  }
  const html = await res.text();
  const found = new Map();
  for (const match of html.matchAll(PERIOD_PATTERN)) {
    found.set(match[1], match[2]);
  }
  return found;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const collected = new Map();
  const coverage = new Map();

  for (const unitCode of PROBE_UNITS) {
    try {
      const found = await fetchPeriodsForUnit(unitCode);
      if (found.size === 0) {
        console.warn(`  ${unitCode}: no teaching periods on page (discontinued or blocked)`);
      } else {
        console.log(`  ${unitCode}: ${found.size} periods`);
        for (const [id, code] of found) {
          collected.set(id, code);
          coverage.set(id, (coverage.get(id) || 0) + 1);
        }
      }
    } catch (err) {
      console.warn(`  ${unitCode}: ${err.message}`);
    }
    await sleep(400);
  }

  // Exchange periods (XCH-*) are real QUT periods but we do not surface them:
  // they duplicate the same semester with an exchange-specific class list, and
  // picking one instead of the plain semester silently hides most classes.
  const STREAM_CODES = /^SEM-/i;
  const skippedExchange = [...collected.entries()].filter(([, code]) => !STREAM_CODES.test(code));
  for (const [id, code] of skippedExchange) {
    collected.delete(id);
    console.log(`  dropped ${id} ${code} (exchange period, not shown)`);
  }

  if (collected.size === 0) {
    console.error('\nNo teaching periods discovered. QUT markup may have changed — check PERIOD_PATTERN.');
    process.exit(1);
  }

  // Newest first so the default period is the one students actually want.
  const periods = [...collected.entries()]
    .map(([id, code]) => {
      const meta = parsePeriodCode(code);
      return {
        id,
        code,
        seenOnUnits: coverage.get(id) || 0,
        name: displayName(code),
        campus: 'All Campuses',
        dateRange: dateRange(meta.semester, meta.year),
        year: meta.year,
        semester: meta.semester,
      };
    })
    .sort((a, b) => b.year - a.year || b.semester - a.semester);

  console.log(`\nDiscovered ${periods.length} teaching periods:`);
  for (const p of periods) console.log(`  ${p.id}  ${p.code.padEnd(14)} ${p.name}`);

  let previous = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      previous = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')).periods || [];
    } catch {
      console.warn('  (existing teaching-periods.json unreadable, treating as empty)');
    }
  }
  const previousIds = new Set(previous.map((p) => p.id));
  const added = periods.filter((p) => !previousIds.has(p.id));
  const removed = previous.filter((p) => !periods.some((q) => q.id === p.id));
  if (added.length) console.log(`\nNEW: ${added.map((p) => `${p.id} (${p.name})`).join(', ')}`);
  if (removed.length) console.log(`GONE: ${removed.map((p) => `${p.id} (${p.name})`).join(', ')}`);

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      { discoveredAt: new Date().toISOString(), source: 'QUT Virtual 4 unit search', periods },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error('discover-periods failed:', err);
  process.exit(1);
});
