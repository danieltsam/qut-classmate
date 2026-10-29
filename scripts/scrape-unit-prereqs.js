#!/usr/bin/env node
/**
 * scrape-unit-prereqs.js
 *
 * Scrapes "Previous study requirements" (prerequisites, anti-requisites,
 * co-requisites, equivalents, assumed knowledge) and the offering periods for
 * every unit that appears in data/course-structures.json.
 *
 * Source page: https://www.qut.edu.au/study/unit?unit=CAB201&year=2027
 * qut.edu.au returns 403 to plain curl, so this uses Playwright chromium.
 *
 * Usage:
 *   node scripts/scrape-unit-prereqs.js [--limit N] [--out path]
 *                                       [--units path] [--year 2027]
 *                                       [--retry-failed] [--retry-sparse]
 *                                       [--concurrency 2]
 *
 * --retry-failed   re-scrape records previously stored with an error
 * --retry-sparse   re-scrape records with no offerings or no requirements at
 *                  all (used after tightening the render wait)
 *
 * Output shape (raw, resumable):
 *   { scrapedAt, year, count, units: { "CAB201": {...}, "ZZZ999": { code, missing: true } } }
 *
 * The raw file is a cache, not the deliverable. Run
 * scripts/build-unit-prereqs.js to produce data/unit-prereqs.json.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const args = {
    limit: 0,
    out: '.scratch/unit-prereqs-raw.json',
    units: 'data/course-structures.json',
    year: 2027,
    retryFailed: false,
    retrySparse: false,
    concurrency: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case '--limit': args.limit = Number.parseInt(next(), 10) || 0; break;
      case '--out': args.out = next(); break;
      case '--units': args.units = next(); break;
      case '--year': args.year = Number.parseInt(next(), 10) || 2027; break;
      case '--retry-failed': args.retryFailed = true; break;
      case '--retry-sparse': args.retrySparse = true; break;
      case '--concurrency': args.concurrency = Math.max(1, Math.min(2, Number.parseInt(next(), 10) || 2)); break;
      case '--help':
      case '-h':
        console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveFromCwd(p) {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

/** Atomic write: tmp file in the same directory, then rename. */
function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * Union of unit codes from course-structures.json.
 * `courses` is an object keyed by course code in the current dataset, but the
 * array form is accepted too since the shape has changed before.
 */
function collectUnitsFromCourseStructures(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const courses = Array.isArray(raw.courses) ? raw.courses : Object.values(raw.courses || {});
  const codes = new Set();
  const titles = new Map();
  for (const course of courses) {
    for (const spec of course.specializations || []) {
      for (const structure of spec.structures || []) {
        for (const semester of structure.semesters || []) {
          for (const unit of semester.units || []) {
            if (!unit || !unit.code) continue;
            const code = String(unit.code).trim().toUpperCase();
            if (!/^[A-Z]{3}\d{3}$/.test(code)) continue;
            codes.add(code);
            if (unit.title && !titles.has(code)) titles.set(code, unit.title);
          }
        }
      }
    }
  }
  return { codes: [...codes].sort(), titles };
}

function loadUnitsArg(unitsArg) {
  const abs = resolveFromCwd(unitsArg);
  if (!fs.existsSync(abs)) throw new Error(`Unit list not found: ${abs}`);
  if (abs.endsWith('.json')) {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    // Accept: course-structures shape, { codes: [...] }, { units: [{code}] }, or a bare array.
    if (Array.isArray(raw) || (raw.courses && !raw.units)) {
      if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
        return { codes: [...new Set(raw.map((c) => String(c).toUpperCase()))].sort(), titles: new Map() };
      }
      return collectUnitsFromCourseStructures(abs);
    }
    const list = [];
    const titles = new Map();
    for (const entry of raw.codes || []) list.push(String(entry));
    for (const entry of raw.units || []) {
      const code = typeof entry === 'string' ? entry : entry && entry.code;
      if (!code) continue;
      list.push(String(code));
      if (entry && entry.title) titles.set(String(code).toUpperCase(), entry.title);
    }
    for (const course of Object.values(raw.courses || {})) {
      for (const spec of course.specializations || []) {
        for (const structure of spec.structures || []) {
          for (const semester of structure.semesters || []) {
            for (const unit of semester.units || []) {
              if (unit && unit.code) list.push(String(unit.code));
            }
          }
        }
      }
    }
    const codes = [...new Set(list.map((c) => c.trim().toUpperCase()).filter(Boolean))].sort();
    return { codes, titles };
  }
  // Plain text file, one code per line.
  const codes = [...new Set(fs.readFileSync(abs, 'utf8').split(/\r?\n/).map((l) => l.trim().toUpperCase()).filter(Boolean))].sort();
  return { codes, titles: new Map() };
}

// ---------------------------------------------------------------- page extraction

/**
 * Runs inside the browser. Returns either { hasSection: false } or the parsed
 * record. All content is kept verbatim — parsing/normalising the prerequisite
 * expression is the build step's consumer's job, not ours.
 */
function extractFromPage(year) {
  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const normaliseTitle = (h1) => {
    const text = squash(h1);
    return text.replace(/^[A-Z]{3}\d{3}\s+/, '').trim() || null;
  };

  const section = [...document.querySelectorAll('h2')].find((h) =>
    /previous study requirements/i.test(squash(h.textContent))
  );
  if (!section) {
    return { hasSection: false, title: normaliseTitle(document.querySelector('h1')?.textContent) };
  }

  const LABEL_MAP = {
    'prerequisites': 'prerequisites',
    'prerequisite': 'prerequisites',
    'pre-requisites': 'prerequisites',
    'pre-requisite': 'prerequisites',
    'anti-requisites': 'antiRequisites',
    'anti-requisite': 'antiRequisites',
    'antirequisites': 'antiRequisites',
    'anti requisites': 'antiRequisites',
    'co-requisites': 'coRequisites',
    'co-requisite': 'coRequisites',
    'corequisites': 'coRequisites',
    'co requisites': 'coRequisites',
    'equivalents': 'equivalents',
    'equivalent': 'equivalents',
    'assumed knowledge': 'assumedKnowledge',
  };

  const found = {};
  let sawList = false;
  let sawAnyContent = false;

  // Primary path: <dl class="row"><dt>Label</dt><dd>content</dd>...</dl>
  let node = section.nextElementSibling;
  const chainText = [];
  while (node && node.tagName !== 'H2') {
    if (node.tagName === 'DL') {
      sawList = true;
      const children = [...node.children];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.tagName !== 'DT') continue;
        const label = LABEL_MAP[squash(child.textContent).toLowerCase().replace(/[:：]$/, '')];
        const dd = children[i + 1];
        if (!label || !dd || dd.tagName !== 'DD') continue;
        const value = squash(dd.textContent);
        if (!value) continue;
        found[label] = found[label] ? `${found[label]} ${value}` : value;
        sawAnyContent = true;
      }
    } else if (!/^H3$/i.test(node.tagName)) {
      // Fallback text, but never the "Guide to previous study requirements" legend,
      // which lists every label name and would poison naive text splitting.
      const text = squash(node.textContent);
      if (text && !/^guide to previous study requirements/i.test(text)) chainText.push(text);
    }
    node = node.nextElementSibling;
  }

  // Secondary path: no dl, but the chain text contains "Label content Label content".
  if (!sawList && chainText.length) {
    const text = chainText.join(' ');
    const labels = ['Prerequisites', 'Anti-requisites', 'Co-requisites', 'Equivalents', 'Assumed knowledge'];
    const boundary = new RegExp(
      `(${labels.map((l) => l.replace(/[-]/g, '[- ]?')).join('|')})\\s*:?\\s*`,
      'gi'
    );
    const parts = [];
    let match;
    while ((match = boundary.exec(text))) {
      parts.push({ index: match.index, end: boundary.lastIndex, raw: match[1] });
    }
    for (let i = 0; i < parts.length; i++) {
      const value = squash(text.slice(parts[i].end, i + 1 < parts.length ? parts[i + 1].index : text.length));
      const key = LABEL_MAP[squash(parts[i].raw).toLowerCase()];
      if (!key || !value) continue;
      found[key] = found[key] ? `${found[key]} ${value}` : value;
      sawAnyContent = true;
    }
  }

  // Offerings: h3 like "Semester 1, 2027 - Gardens Point (Internal)".
  // Requiring "<something>, <4-digit year> - <campus>" skips the page chrome
  // headings ("Guide to fees", "Single-unit study", "Study abroad and exchange").
  const offerings = [];
  for (const h3 of document.querySelectorAll('h3')) {
    const text = squash(h3.textContent);
    if (!/,\s*20\d{2}\s*-\s*\S/.test(text)) continue;
    if (!offerings.includes(text)) offerings.push(text);
  }

  // Fallback: the "Dates and locations" table always lists the teaching
  // periods, even on pages that never render the per-offering outline h3s.
  // Its rows carry "<Period>" + "<Location(s)>" but no Internal/Online mode.
  // Only used when the page gave us zero h3 offerings, since the h3 form is
  // richer and mixing the two would duplicate periods.
  const datesHeading = [...document.querySelectorAll('h2')].find((h) => /dates and locations/i.test(squash(h.textContent)));
  if (offerings.length === 0 && datesHeading) {
    let sibling = datesHeading.nextElementSibling;
    let table = null;
    while (sibling && sibling.tagName !== 'H2') {
      if (sibling.tagName === 'TABLE') { table = sibling; break; }
      sibling = sibling.nextElementSibling;
    }
    if (table) {
      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = [...row.children];
        if (cells.length < 3) continue;
        const period = squash(cells[0].textContent);
        if (!/,\s*20\d{2}/.test(period)) continue;
        const locationCell = cells[2];
        const locations = [...locationCell.children].length
          ? [...locationCell.children].map((el) => squash(el.textContent)).filter(Boolean)
          : [squash(locationCell.textContent)].filter(Boolean);
        for (const location of locations.length ? locations : ['TBA']) {
          const derived = `${period} - ${location}`;
          if (!offerings.includes(derived)) offerings.push(derived);
        }
      }
    }
  }

  const title =
    normaliseTitle(document.querySelector('h1')?.textContent) ||
    null;

  return {
    hasSection: true,
    sawAnyContent,
    title,
    fields: found,
    offerings,
  };
}

// ---------------------------------------------------------------- scrape loop

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = resolveFromCwd(args.out);
  const { codes, titles } = loadUnitsArg(args.units);

  console.log(`Unit list: ${codes.length} unique units from ${args.units}`);
  console.log(`Year: ${args.year}   output: ${path.relative(ROOT, outPath)}`);

  // Load existing raw output (resumable).
  let db = { scrapedAt: null, year: args.year, count: 0, units: {} };
  if (fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      const units = existing.units && !Array.isArray(existing.units)
        ? existing.units
        : Object.fromEntries((existing.units || []).filter(Boolean).map((u) => [u.code, u]));
      db = { ...db, ...existing, units };
      console.log(`Loaded ${Object.keys(db.units).length} existing records from raw file.`);
    } catch (err) {
      console.error(`Could not parse existing raw file (${err.message}); starting fresh.`);
    }
  }
  db.year = args.year;

  const done = (code) => {
    const entry = db.units[code];
    if (!entry) return false;
    // Hard failures are stored as missing:true + error. They are retried only on request.
    if (args.retryFailed && entry.error) return false;
    if (args.retrySparse && !entry.missing) {
      // Records scraped before the render wait was tightened can be thin:
      // no offerings, or a requirements section that had not painted yet.
      const noRequirements = !entry.prerequisites && !entry.antiRequisites &&
        !entry.coRequisites && !entry.equivalents && !entry.assumedKnowledge;
      if (noRequirements || !(entry.offerings || []).length) return false;
    }
    return true;
  };

  const pending = codes.filter((code) => !done(code));
  const targets = args.limit > 0 ? pending.slice(0, args.limit) : pending;
  console.log(`Already done: ${codes.length - pending.length}. Queued this run: ${targets.length}.`);
  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const NAV_SPACING_MS = 800;
  let stopRequested = false;
  let processed = 0;
  let okCount = 0;
  let missingCount = 0;
  let failCount = 0;

  const browser = await chromium.launch({ headless: true });

  // Serialise writes: two workers finishing at once must not interleave renames.
  let saveChain = Promise.resolve();
  const save = () => {
    saveChain = saveChain.then(() => {
      db.count = Object.keys(db.units).length;
      db.scrapedAt = new Date().toISOString();
      writeJsonAtomic(outPath, db);
    }).catch((err) => console.error(`Save failed: ${err.message}`));
    return saveChain;
  };

  // Global throttle so concurrent workers still leave ~800ms between navigations.
  let nextNavAt = 0;
  const navSlot = async () => {
    const now = Date.now();
    const wait = Math.max(0, nextNavAt - now);
    nextNavAt = Math.max(now, nextNavAt) + NAV_SPACING_MS;
    if (wait > 0) await sleep(wait);
  };

  const shutdown = async (signal) => {
    if (stopRequested) return;
    stopRequested = true;
    console.log(`\n${signal} received — saving ${Object.keys(db.units).length} records and exiting...`);
    await save();
    try { await browser.close(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  let cursor = 0;

  async function worker(workerId) {
    let context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    let page = await context.newPage();
    let myCount = 0;

    while (!stopRequested && cursor < targets.length) {
      const index = cursor++;
      const code = targets[index];

      // Recycle the context periodically to keep memory flat over 1000+ pages.
      if (myCount > 0 && myCount % 50 === 0) {
        try { await context.close(); } catch {}
        context = await browser.newContext({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 900 },
        });
        page = await context.newPage();
      }

      const url = `https://www.qut.edu.au/study/unit?unit=${code}&year=${args.year}`;
      let record = null;
      let lastError = null;

      for (let attempt = 0; attempt <= 2 && !record && !stopRequested; attempt++) {
        if (attempt > 0) {
          const backoff = 2500 * attempt;
          console.log(`  ${code}: retry ${attempt}/2 after ${backoff}ms (${lastError})`);
          await sleep(backoff);
        }
        await navSlot();
        try {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          // networkidle never settles on QUT pages. Instead wait for a stable
          // DOM signal: the "Dates and locations" heading/table, or a soft 404.
          // The offering outline h3s render later than the requirements list,
          // so a bare fixed wait undercounts offerings on some pages.
          await page.waitForFunction(() => {
            const h1 = document.querySelector('h1');
            if (h1 && /page not found/i.test(h1.textContent)) return true;
            if ([...document.querySelectorAll('h2')].some((h) => /dates and locations/i.test(h.textContent))) return true;
            // Requirements-only fallback signal, in case a page has no dates block.
            return !![...document.querySelectorAll('h2')].some((h) => /previous study requirements/i.test(h.textContent));
          }, null, { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(700);
          const status = response ? response.status() : 0;

          if (status >= 400) {
            record = { code, missing: true, reason: `http_${status}` };
            break;
          }

          let data = await page.evaluate(extractFromPage, args.year);

          // If the requirements block is there but the offering list came back
          // empty, give the page one more chance before believing it.
          if (data && data.hasSection && (data.offerings || []).length === 0) {
            await page.waitForTimeout(1800);
            const retryData = await page.evaluate(extractFromPage, args.year);
            if (retryData && (retryData.offerings || []).length > (data.offerings || []).length) data = retryData;
          }

          if (!data || !data.hasSection) {
            // A real unit page with no requirements block is legitimate (QUT
            // omits the section entirely when a unit has none). Keep the
            // offerings so the coverage is not silently lost.
            record = {
              code,
              missing: true,
              reason: 'no_previous_study_section',
              title: data?.title || titles.get(code) || null,
              offerings: data?.offerings || [],
            };
            break;
          }

          record = {
            code,
            title: data.title || titles.get(code) || null,
            year: args.year,
            prerequisites: data.fields.prerequisites ?? null,
            antiRequisites: data.fields.antiRequisites ?? null,
            coRequisites: data.fields.coRequisites ?? null,
            equivalents: data.fields.equivalents ?? null,
            assumedKnowledge: data.fields.assumedKnowledge ?? null,
            offerings: data.offerings || [],
            scrapedAt: new Date().toISOString(),
          };
        } catch (err) {
          lastError = err.message.split('\n')[0].slice(0, 160);
        }
      }

      if (!record) {
        record = { code, missing: true, error: lastError || 'unknown_error', year: args.year };
        failCount++;
      } else if (record.missing) {
        missingCount++;
      } else {
        okCount++;
      }

      db.units[code] = record;
      processed++;
      myCount++;
      await save();

      const prereqFlag = record.missing
        ? `MISSING(${record.reason || record.error})`
        : record.prerequisites
          ? 'prereqs'
          : 'no-prereqs';
      const offeringCount = record.offerings ? record.offerings.length : 0;
      console.log(
        `[w${workerId} ${processed}/${targets.length}] ${code} ${prereqFlag} offerings=${offeringCount} ` +
        `| ok=${okCount} missing=${missingCount} failed=${failCount}`
      );
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(args.concurrency, targets.length); i++) workers.push(worker(i + 1));
  await Promise.all(workers);
  await save();
  await browser.close();

  console.log('\n--- Done ---');
  console.log(`Records with requirements section: ${okCount}`);
  console.log(`Missing/no section: ${missingCount}`);
  console.log(`Failed after retries: ${failCount}`);
  console.log(`Total records in raw file: ${Object.keys(db.units).length}`);
  console.log(`Raw output: ${outPath}`);
  console.log('Next: node scripts/build-unit-prereqs.js ' + path.relative(ROOT, outPath));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
