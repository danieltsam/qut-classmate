#!/usr/bin/env node
/**
 * Scrapes QUT course structures (study plans) from qut.edu.au course pages.
 *
 * Why Playwright and not fetch/curl: Quantum's public site returns 403 to
 * non-browser requests, and `#structures-content` is filled by an AJAX call that
 * only fires after clicking the "Details and units" tab. So: real Chromium, real
 * click, then poll for the spinner to disappear.
 *
 * Why the major-variant URL: the bare course page (e.g.
 * /courses/bachelor-of-information-technology) has no "Details and units" button
 * and zero structure markup at all. Its major variants
 * (/courses/bachelor-of-information-technology-computer-science) do. Double
 * degrees are the exception — their own page is already a full page.
 *
 * Output shape is consumed by scripts/build-course-planner-data.js. Do not change
 * it without changing that script too.
 *
 * Usage:
 *   node scripts/scrape-course-structures.js
 *   node scripts/scrape-course-structures.js --faculty "Faculty of Science" --limit 3
 *   node scripts/scrape-course-structures.js --out .scratch/course-structures-raw.json
 *
 * Resumable: re-running skips courses already in the output file that have at
 * least one structure with units, and rewrites the file after every course.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const cheerio = require('cheerio');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const COURSES_PATH = path.join(ROOT, 'data/qut-virtual-courses.json');
const ACTIVE_COURSES_PATH = path.join(ROOT, 'data/qut-active-courses.json');
const DEFAULT_OUT = path.join(ROOT, '.scratch/course-structures-raw.json');
// Previous scrape (12 popular courses). Used only to seed a brand-new output file
// so a fresh run never regresses the courses the app already ships.
const LEGACY_SEED = path.join(ROOT, '.scratch/degree-structures.json');

const PRIORITY_FACULTIES = [
  'Faculty of Science',
  'Faculty of Engineering',
  'Faculty of Business and Law',
  'Faculty of Health',
];

// Courses the app already covers. Always in scope even if their faculty is not.
const REQUIRED_CODES = [
  'BS05', 'IN01', 'MS01', 'NS42', 'ST01', 'EN01',
  'LW38', 'IX22', 'IN20', 'IQ20', 'IV04', 'IN05',
];

// Courses missing from data/qut-virtual-courses.json (delisted or renamed) that
// we still need. Title drives the URL slug, so keep it exact.
const EXTRA_COURSES = [
  {
    code: 'IV04',
    title: 'Bachelor of Information Technology / Master of Data Science',
    creditPoints: 384,
    aqfLevel: 'AQF Level 9',
  },
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PAGE_TIMEOUT = 60000;
const STRUCTURE_WAIT_MS = 45000; // first attempt; retry gets 1.5x
const SETTLE_MS = 2500; // after domcontentloaded, before clicking the tab
const POLITE_GAP_MS = 1500; // between page navigations, concurrency is 1

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { faculties: [], limit: Infinity, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--faculty') {
      const value = argv[++i];
      if (!value) throw new Error('--faculty needs a value');
      opts.faculties.push(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error('--limit needs a positive number');
      opts.limit = value;
    } else if (arg === '--out') {
      const value = argv[++i];
      if (!value) throw new Error('--out needs a path');
      opts.out = path.resolve(process.cwd(), value);
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (opts.faculties.length === 0) opts.faculties = [...PRIORITY_FACULTIES];
  return opts;
}

// ---------------------------------------------------------------- slugs

/**
 * QUT course URLs are the title, lowercased, with punctuation flattened:
 *   "Bachelor of Engineering (Honours)"        -> bachelor-of-engineering-honours
 *   "Bachelor of Business/Bachelor of IT"      -> bachelor-of-business-bachelor-of-it
 * Parentheses lose the brackets but keep the words, and "/" becomes a dash.
 */
function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/\((?:until|from|last intake)\s+\d{4}\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[()\/,.]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Candidate URLs, best guess first. */
function slugVariants(title) {
  const variants = [];
  const full = slugify(title);
  if (full) variants.push(full);
  // Second guess: drop trailing parenthetical qualifiers, e.g.
  // "Bachelor of Science (Advanced)" -> the plain "bachelor-of-science" page.
  const bare = slugify(String(title).replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' '));
  if (bare && bare !== full) variants.push(bare);
  return variants;
}

function courseUrlFor(course) {
  return `https://www.qut.edu.au/courses/${slugify(course.title)}`;
}

// ---------------------------------------------------------------- course list

function dedupeCourses(courses) {
  const byCode = new Map();
  for (const course of courses) {
    if (!course || !course.code || !course.title) continue;
    const key = course.code.toUpperCase();
    const candidate = { ...course, code: key };
    const current = byCode.get(key);
    if (!current) {
      byCode.set(key, candidate);
      continue;
    }
    // Prefer the parent award (shortest, non-stale title), then the newer year:
    // BS05 has 14 titles and "Bachelor of Business" is the one whose page links
    // all the majors.
    const score = (c) => {
      const stale = /\((?:until|last intake)\s+\d{4}\)/i.test(c.title) ? 1 : 0;
      const year = Number(c.year) || 0;
      return [stale, String(c.title).length, -year];
    };
    const [cs, cm] = [score(candidate), score(current)];
    if (cs[0] < cm[0] || (cs[0] === cm[0] && (cs[1] < cm[1] || (cs[1] === cm[1] && cs[2] < cm[2])))) {
      byCode.set(key, candidate);
    }
  }
  return [...byCode.values()];
}

function loadMetadata() {
  const virtual = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8'));
  const active = fs.existsSync(ACTIVE_COURSES_PATH)
    ? JSON.parse(fs.readFileSync(ACTIVE_COURSES_PATH, 'utf8'))
    : { courses: [] };

  const activeByCode = new Map(dedupeCourses(active.courses || []).map((c) => [c.code, c]));
  const catalogue = dedupeCourses(virtual.courses || []);

  // QUT reuses one course code across many titled degrees: BS05 alone is
  // Bachelor of Business plus thirteen named majors. dedupeCourses keeps the
  // parent award, and its page links every major variant, so one entry per code
  // is enough — scrapeCourse() walks those links.

  for (const extra of EXTRA_COURSES) {
    if (!catalogue.some((c) => c.code === extra.code)) {
      catalogue.push({ ...extra, faculties: 'University Wide' });
    }
  }

  const byCode = new Map();
  for (const course of catalogue) {
    const activeEntry = activeByCode.get(course.code);
    byCode.set(course.code, {
      code: course.code,
      title: course.title,
      faculties: course.faculties || activeEntry?.faculties || '',
      creditPoints: activeEntry?.creditPoints ?? course.creditPoints ?? null,
      aqfLevel: activeEntry?.aqfLevel ?? course.aqfLevel ?? null,
      approvedMajors: activeEntry?.approvedMajors ?? course.approvedMajors ?? [],
    });
  }
  // Required codes that exist only in the active-course dump.
  for (const code of REQUIRED_CODES) {
    if (byCode.has(code)) continue;
    const activeEntry = activeByCode.get(code);
    if (activeEntry) byCode.set(code, { ...activeEntry, faculties: activeEntry.faculties || '' });
  }
  return byCode;
}

function selectCourses(byCode, faculties) {
  const wanted = faculties.map((f) => f.trim().toLowerCase()).filter(Boolean);
  const matches = (course) =>
    String(course.faculties || '')
      .split(',')
      .map((f) => f.trim().toLowerCase())
      .some((f) => wanted.includes(f) || wanted.some((w) => f.includes(w)));

  const selected = [];
  const seen = new Set();

  for (const course of byCode.values()) {
    if (!matches(course)) continue;
    if (seen.has(course.code)) continue;
    seen.add(course.code);
    selected.push({ ...course, title: course.title });
  }

  // The required codes are always included, even when their faculty is outside
  // the requested set, so a --limit smoke test still covers known ground.
  for (const code of REQUIRED_CODES) {
    const course = byCode.get(code);
    if (!course || seen.has(code)) continue;
    seen.add(code);
    selected.push({ ...course, title: course.title });
  }

  // Required codes first, then alphabetically by code.
  return selected.sort((a, b) => {
    const ai = REQUIRED_CODES.indexOf(a.code);
    const bi = REQUIRED_CODES.indexOf(b.code);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.code.localeCompare(b.code);
  });
}

// ---------------------------------------------------------------- parsing

function cleanText($el) {
  return $el.text().replace(/\s+/g, ' ').trim();
}

/**
 * Turn the innerHTML of `#structures-content` into
 * [{ id, title, semesters: [{ name, units: [...], textItems: [...] }] }]
 *
 * Markup notes (verified against IN01/computer-science):
 *  - each plan is a collapsed block: h4#structure-<id>, contents in
 *    #structure-contents-<id>
 *  - semester blocks are .semester-item-content, id ...-<structureId>-<semesterId>
 *  - the visible semester heading is #semester-<semesterId>. It exists TWICE
 *    (desktop + mobile copy), so take the first and ignore the duplicate.
 *  - a unit is <a.unit-item-title href="#unit-item-contents-..."> plus a sibling
 *    .unit-item-contents block whose <dl> carries code / credit points / campus,
 *    and a /study/unit?unit=CODE&year=YYYY link.
 *  - .text-item-contents paragraphs are duplicated the same way as headings.
 *  - info-only plans (option lists that just link elsewhere) have no
 *    .semester-item-content at all; they are dropped here because they carry no
 *    units.
 */
function parseStructureHtml(html) {
  if (!html || !html.trim()) return [];
  const $ = cheerio.load(html);
  const structures = [];

  $('h4[id^="structure-"]').each((_, el) => {
    const heading = $(el);
    const structureId = (heading.attr('id') || '').replace('structure-', '');
    if (!structureId) return;

    const title = cleanText(heading);
    const contents = $(
      `#structure-contents-${structureId}, #default-structure-contents-${structureId}`,
    );
    if (contents.length === 0) return;

    const semesters = [];

    // QUT ships every semester block twice — a desktop copy and a mobile copy with
    // the same DOM id. Iterating both doubles every unit and doubles the credit
    // point total, so key on the block id and take the first.
    const seenSemesterBlocks = new Set();
    contents.find('.semester-item-content').each((__, semEl) => {
      const semBlock = $(semEl);
      const blockId = semBlock.attr('id') || '';
      if (blockId) {
        if (seenSemesterBlocks.has(blockId)) return;
        seenSemesterBlocks.add(blockId);
      }
      const semId = (semBlock.attr('id') || '').split('-').pop();
      const headingEl = contents.find(`#semester-${semId}`).first();
      let semesterName = headingEl.length ? cleanText(headingEl) : `Semester ${semId}`;
      semesterName = semesterName.split('\n')[0].trim();

      const semester = { name: semesterName, units: [], textItems: [] };
      const seenTexts = new Set();
      const seenUnits = new Set();

      semBlock.find('.unit-item-title').each((___, unitEl) => {
        const anchor = $(unitEl);
        const contentsId = (anchor.attr('href') || '').replace('#', '');
        if (!contentsId) return;
        const unitBlock = semBlock.find(`[id="${contentsId}"]`);
        const titleText = cleanText(anchor.find('h6'));

        let code = '';
        let creditPoints = null;
        let campus = '';

        if (unitBlock.length > 0) {
          unitBlock.find('dt').each((____, dtEl) => {
            const dt = $(dtEl);
            const label = cleanText(dt).toLowerCase();
            const value = cleanText(dt.next('dd'));
            if (label.includes('unit code')) code = code || value.toUpperCase();
            else if (label.includes('credit points')) {
              const n = parseInt(value, 10);
              if (Number.isFinite(n)) creditPoints = n;
            } else if (label.includes('campus')) campus = campus || value;
          });
          if (!code) {
            const link = unitBlock.find('a[href*="/study/unit"]').first().attr('href') || '';
            const m = link.match(/[?&]unit=([A-Za-z0-9]+)/);
            if (m) code = m[1].toUpperCase();
          }
        }
        if (!code) {
          // Fall back to the h6 id, e.g. id="unit-IFB102-1".
          const h6Id = anchor.find('h6').attr('id') || '';
          const parts = h6Id.split('-');
          if (parts.length > 1 && /^[A-Za-z]{3}\d{3}$/.test(parts[1])) code = parts[1].toUpperCase();
        }
        if (!code) return;
        if (seenUnits.has(code)) return;
        seenUnits.add(code);

        semester.units.push({ code, title: titleText, creditPoints, campus });
      });

      semBlock.find('.text-item-contents').each((___, textEl) => {
        const text = cleanText($(textEl));
        if (!text || seenTexts.has(text)) return;
        seenTexts.add(text);
        semester.textItems.push(text);
      });

      if (semester.units.length > 0 || semester.textItems.length > 0) semesters.push(semester);
    });

    const unitCount = semesters.reduce((n, s) => n + s.units.length, 0);
    if (unitCount === 0) return; // info-only plan, nothing for the planner
    structures.push({ id: structureId, title, semesters });
  });

  return structures;
}

// ---------------------------------------------------------------- browser

class Session {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.lastNavigation = 0;
    this.pagesServed = 0;
  }

  async ensure() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    this.context = await this.browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
      locale: 'en-AU',
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(PAGE_TIMEOUT);
    this.pagesServed = 0;
    return this.page;
  }

  async recycle() {
    try {
      if (this.context) await this.context.close();
    } catch {
      /* already gone */
    }
    this.context = null;
    this.page = null;
  }

  /** Navigate politely: one request at a time, fixed gap between them. */
  async goto(url) {
    const page = await this.ensure();
    const wait = this.lastNavigation + POLITE_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    let response = null;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    } finally {
      this.lastNavigation = Date.now();
      this.pagesServed += 1;
    }
    return response;
  }

  async close() {
    try {
      if (this.browser) await this.browser.close();
    } catch {
      /* ignore */
    }
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}

async function readPageState(page, baseUrl) {
  return page.evaluate((base) => {
    const links = new Set();
    document.querySelectorAll('a[href]').forEach((a) => {
      // Query strings and fragments both appear (`...-international?international`),
      // and both produce the same page — strip them so a variant is fetched once.
      const href = (a.href || '').split('#')[0].split('?')[0];
      if (href && href.startsWith(`${base}-`) && href !== base) links.add(href);
    });
    const structuresEl = document.querySelector('#structures-content');
    return {
      finalUrl: location.href,
      h1: (document.querySelector('h1') || {}).textContent?.trim() || '',
      hasDetailsButton: !!document.querySelector(
        '#details-and-units-button, button[aria-controls="details-and-units-tab"]',
      ),
      majorLinks: [...links],
      structuresLength: structuresEl ? structuresEl.innerHTML.length : 0,
    };
  }, baseUrl);
}

async function clickDetailsTab(page) {
  return page.evaluate(() => {
    const btn =
      document.querySelector('#details-and-units-button') ||
      document.querySelector('button[aria-controls="details-and-units-tab"]');
    if (btn) {
      btn.click();
      return true;
    }
    const heading = document.querySelector('#details-and-units-tab .content-title');
    if (heading) {
      heading.click();
      return true;
    }
    return false;
  });
}

/**
 * Click the tab and poll until the AJAX content settles. Polling beats a fixed
 * 9s sleep: the payload usually lands in ~3-5s, and a hard sleep either wastes
 * time or silently captures the spinner.
 */
async function loadStructures(page, timeoutMs) {
  const clicked = await clickDetailsTab(page);
  if (!clicked) return { ok: false, reason: 'no details-and-units button' };

  const deadline = Date.now() + timeoutMs;
  let lastLength = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(750);
    const state = await page.evaluate(() => {
      const el = document.querySelector('#structures-content');
      const html = el ? el.innerHTML : '';
      return {
        length: html.length,
        spinning: html.includes('spin.js') || /class="[^"]*\bspin\b/.test(html),
        structureCount: (html.match(/id="structure-/g) || []).length,
      };
    });
    lastLength = state.length;
    if (state.length > 2000 && !state.spinning && state.structureCount > 0) {
      return { ok: true, length: state.length, structureCount: state.structureCount };
    }
  }
  return { ok: false, reason: `structures did not settle (last length ${lastLength})` };
}

async function readStructuresHtml(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#structures-content');
    return el ? el.innerHTML : '';
  });
}

/**
 * Load `url` in the current page and return its parsed structures.
 * Retries once with a longer wait if the spinner never clears.
 */
async function scrapeTarget(session, url) {
  const page = await session.ensure();

  let lastReason = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response;
    try {
      response = await session.goto(url);
    } catch (err) {
      lastReason = `navigation failed: ${err.message.split('\n')[0]}`;
      await sleep(2000 * attempt);
      continue;
    }

    const status = response ? response.status() : 0;
    if (status === 404) return { ok: false, reason: '404' };

    // The AJAX tab needs the page's own JS to have booted.
    await page.waitForTimeout(SETTLE_MS + (attempt - 1) * 1500);

    const state = await readPageState(page, url);
    if (/page not found/i.test(state.h1)) return { ok: false, reason: '404 (page not found)' };
    if (!state.hasDetailsButton) {
      lastReason = 'no details-and-units button';
      await sleep(1500);
      continue;
    }

    const loaded = await loadStructures(page, STRUCTURE_WAIT_MS * (attempt === 1 ? 1 : 1.5));
    if (!loaded.ok) {
      lastReason = loaded.reason;
      await sleep(1500 * attempt);
      continue;
    }

    const html = await readStructuresHtml(page);
    const structures = parseStructureHtml(html);
    if (structures.length === 0) {
      lastReason = 'structures parsed to zero units';
      await sleep(1500 * attempt);
      continue;
    }
    return { ok: true, structures, state };
  }
  return { ok: false, reason: lastReason || 'unknown failure' };
}

function majorName(slug, courseSlug) {
  const suffix = slug.startsWith(`${courseSlug}-`) ? slug.slice(courseSlug.length + 1) : slug;
  return suffix.replace(/-/g, ' ').trim() || 'default';
}

/** Scrape one course. Returns { specializations } or { error }. */
async function scrapeCourse(session, course, log) {
  const baseSlug = slugify(course.title);
  const variants = slugVariants(course.title);

  let page = null;
  let landing = null;
  let usedUrl = '';

  for (const slug of variants) {
    usedUrl = `https://www.qut.edu.au/courses/${slug}`;
    let response;
    try {
      page = await session.ensure();
      response = await session.goto(usedUrl);
    } catch (err) {
      log(`  navigation failed for ${usedUrl}: ${err.message.split('\n')[0]}`);
      continue;
    }
    if (response && response.status() === 404) {
      log(`  404 for ${usedUrl}`);
      continue;
    }
    await page.waitForTimeout(SETTLE_MS);
    landing = await readPageState(page, usedUrl);
    if (/page not found/i.test(landing.h1)) {
      log(`  "Page not found" at ${usedUrl}`);
      continue;
    }
    break;
  }

  if (!landing) return { error: `course page not found (tried ${variants.join(', ')})` };

  const realBase = landing.finalUrl.split('#')[0];
  const effectiveBaseSlug = realBase.split('/').pop();
  const majorLinks = landing.majorLinks;
  const targets = [];

  // A page that already owns the tab is a real course page (typically a double
  // degree) — scrape it as the default pathway before walking its majors.
  if (landing.hasDetailsButton) {
    targets.push({ name: 'default', url: realBase });
  }
  for (const link of majorLinks) {
    const slug = link.split('/').pop();
    if (!slug) continue;
    targets.push({ name: majorName(slug, effectiveBaseSlug), url: link });
  }

  if (targets.length === 0) return { error: 'no scrape-able page (no majors, no tab)' };

  const specializations = [];
  const failures = [];

  for (const target of targets) {
    const isLanding = target.url === realBase && target.name === 'default';
    let result;
    if (isLanding && landing.hasDetailsButton && landing.structuresLength === 0) {
      // Already on the page — click instead of reloading it.
      const loaded = await loadStructures(page, STRUCTURE_WAIT_MS);
      if (loaded.ok) {
        const html = await readStructuresHtml(page);
        const structures = parseStructureHtml(html);
        result = structures.length
          ? { ok: true, structures }
          : { ok: false, reason: 'structures parsed to zero units' };
      } else {
        result = { ok: false, reason: loaded.reason };
      }
      if (!result.ok) result = await scrapeTarget(session, target.url);
    } else {
      result = await scrapeTarget(session, target.url);
    }

    if (!result.ok) {
      failures.push(`${target.name} (${result.reason})`);
      log(`  ✗ ${target.name}: ${result.reason}`);
      continue;
    }

    const semesters = result.structures.reduce((n, s) => n + s.semesters.length, 0);
    const units = result.structures.reduce(
      (n, s) => n + s.semesters.reduce((m, sem) => m + sem.units.length, 0),
      0,
    );
    if (units === 0) {
      failures.push(`${target.name} (zero units)`);
      continue;
    }
    specializations.push({
      specialization: target.name,
      url: target.url,
      structures: result.structures,
    });
    log(`  ✓ ${target.name}: ${result.structures.length} structures, ${semesters} semesters, ${units} units`);
  }

  if (specializations.length === 0) {
    return { error: `no usable pathways${failures.length ? ` (${failures.join('; ')})` : ''}` };
  }
  // Give the landing page a head start on the next course's nav gap.
  await sleep(POLITE_GAP_MS);
  return { specializations, failures };
}

// ---------------------------------------------------------------- storage

function usableCourse(entry) {
  if (!entry || !Array.isArray(entry.specializations)) return false;
  return entry.specializations.some((spec) =>
    (spec.structures || []).some((structure) =>
      (structure.semesters || []).some((semester) => (semester.units || []).length > 0),
    ),
  );
}

function specUnitCount(spec) {
  return (spec?.structures || []).reduce(
    (n, structure) =>
      n + (structure.semesters || []).reduce((m, semester) => m + (semester.units || []).length, 0),
    0,
  );
}

/**
 * Fold a freshly scraped entry into the one already stored for that code.
 *
 * Two pages can legitimately claim the same code: `BS05` is both "Bachelor of
 * Business" (whose page links every major) and "Bachelor of Business
 * (Accounting)". Replacing on code alone threw away the 10 pathways the parent
 * page found, leaving one. So union the pathways by URL and keep whichever
 * version of a shared pathway actually has units in it.
 */
function mergeCourseEntry(courses, entry) {
  const index = courses.findIndex((c) => c.courseCode === entry.courseCode);
  if (index === -1) {
    courses.push(entry);
    return;
  }
  const current = courses[index];
  const byUrl = new Map();
  for (const spec of [...(current.specializations || []), ...(entry.specializations || [])]) {
    if (!spec) continue;
    const key = spec.url || spec.specialization;
    const previous = byUrl.get(key);
    if (!previous || specUnitCount(spec) > specUnitCount(previous)) byUrl.set(key, spec);
  }
  courses[index] = {
    ...current,
    creditPoints: current.creditPoints ?? entry.creditPoints ?? null,
    aqfLevel: current.aqfLevel || entry.aqfLevel || null,
    approvedMajors:
      (current.approvedMajors || []).length >= (entry.approvedMajors || []).length
        ? current.approvedMajors
        : entry.approvedMajors,
    courseTitle:
      (current.courseTitle || '').length <= (entry.courseTitle || '').length
        ? current.courseTitle
        : entry.courseTitle,
    specializations: [...byUrl.values()],
  };
}

function loadExisting(outPath) {
  let data = [];
  if (!fs.existsSync(outPath)) {
    if (fs.existsSync(LEGACY_SEED) && path.resolve(LEGACY_SEED) !== path.resolve(outPath)) {
      try {
        const seed = JSON.parse(fs.readFileSync(LEGACY_SEED, 'utf8'));
        const seeded = (seed.data || []).filter(usableCourse);
        if (seeded.length) {
          console.log(`Seeded ${seeded.length} courses from ${path.relative(ROOT, LEGACY_SEED)}`);
          return seeded;
        }
      } catch (err) {
        console.warn(`Could not read legacy seed: ${err.message}`);
      }
    }
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    data = (raw.data || []).filter(Boolean);
    console.log(`Loaded ${data.length} existing courses from ${path.relative(ROOT, outPath)}`);
  } catch (err) {
    console.warn(`Could not parse ${outPath} (${err.message}); starting fresh`);
    return [];
  }

  // Repair: the hand-verified 12-course dump is the reference for those codes.
  // If a partial re-scrape left a code with fewer pathways than the reference,
  // fold the reference back in.
  if (fs.existsSync(LEGACY_SEED) && path.resolve(LEGACY_SEED) !== path.resolve(outPath)) {
    try {
      const seed = JSON.parse(fs.readFileSync(LEGACY_SEED, 'utf8'));
      let repaired = 0;
      for (const seededCourse of (seed.data || []).filter(usableCourse)) {
        const current = data.find((c) => c.courseCode === seededCourse.courseCode);
        if (!current) continue;
        const currentUnits = (current.specializations || []).reduce((n, s) => n + specUnitCount(s), 0);
        const seedUnits = seededCourse.specializations.reduce((n, s) => n + specUnitCount(s), 0);
        if (seedUnits > currentUnits) {
          mergeCourseEntry(data, seededCourse);
          repaired += 1;
        }
      }
      if (repaired) console.log(`Repaired ${repaired} course(s) from the reference dump`);
    } catch (err) {
      console.warn(`Could not read legacy seed for repair: ${err.message}`);
    }
  }
  return data;
}

function saveDatabase(outPath, courses) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = {
    scrapedAt: new Date().toISOString(),
    source: 'qut.edu.au course pages',
    coursesCount: courses.length,
    data: courses,
  };
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  return payload;
}

function countTotals(courses) {
  let specializations = 0;
  let structures = 0;
  let semesters = 0;
  let units = 0;
  for (const course of courses) {
    for (const spec of course.specializations || []) {
      specializations += 1;
      for (const structure of spec.structures || []) {
        structures += 1;
        for (const semester of structure.semesters || []) {
          semesters += 1;
          units += (semester.units || []).length;
        }
      }
    }
  }
  return { specializations, structures, semesters, units };
}

// ---------------------------------------------------------------- main

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error('Usage: node scripts/scrape-course-structures.js [--faculty "Faculty of Science"] [--limit N] [--out path]');
    process.exit(1);
  }
  if (opts.help) {
    console.log('Usage: node scripts/scrape-course-structures.js [--faculty "Faculty of Science"] [--limit N] [--out path]');
    console.log(`Faculties default to: ${PRIORITY_FACULTIES.join(', ')}`);
    console.log(`Output defaults to: ${path.relative(ROOT, DEFAULT_OUT)}`);
    return;
  }

  const byCode = loadMetadata();
  const selected = selectCourses(byCode, opts.faculties);
  const existing = loadExisting(opts.out);
  // Resume per course code. A code with several titled degrees (BS05 has 14
  // titles) is covered by its parent page's major links, and mergeCourses()
  // unions the results by URL — so re-visiting the code is never required.
  const existingKeys = new Set(existing.filter(usableCourse).map((c) => c.courseCode));

  const todo = selected.filter((c) => !existingKeys.has(c.code));
  const skipped = selected.length - todo.length;
  const queue = Number.isFinite(opts.limit) ? todo.slice(0, opts.limit) : todo;

  console.log(`Faculties: ${opts.faculties.join(' | ')}`);
  console.log(`Selected ${selected.length} courses (${skipped} already scraped, ${queue.length} to fetch${Number.isFinite(opts.limit) ? `, --limit ${opts.limit}` : ''})`);
  console.log(`Output: ${path.relative(ROOT, opts.out)}`);

  if (queue.length === 0) {
    console.log('Nothing to scrape — output already covers the selection.');
    summarise(opts, existing, selected, skipped, []);
    return;
  }

  const session = new Session();
  const failures = [];
  let done = 0;

  const onExit = () => {
    try {
      saveDatabase(opts.out, existing);
      console.log(`\nInterrupted — saved ${existing.length} courses to ${path.relative(ROOT, opts.out)}`);
    } finally {
      process.exit(130);
    }
  };
  process.once('SIGINT', onExit);
  process.once('SIGTERM', onExit);

  for (const course of queue) {
    done += 1;
    const started = Date.now();
    console.log(`\n[${done}/${queue.length}] ${course.code} — ${course.title}`);
    console.log(`  ${courseUrlFor(course)}`);

    let result;
    try {
      result = await scrapeCourse(session, course, (msg) => console.log(msg));
    } catch (err) {
      console.error(`  scrape threw: ${err.message.split('\n')[0]}`);
      result = { error: err.message.split('\n')[0] };
      // Browser may be wedged — drop the context and try again next course.
      await session.recycle();
    }

    if (result.error) {
      failures.push({ code: course.code, title: course.title, reason: result.error });
      console.log(`  ✗ skipped ${course.code}: ${result.error}`);
    } else {
      const entry = {
        courseCode: course.code,
        courseTitle: course.title,
        creditPoints: course.creditPoints ?? null,
        aqfLevel: course.aqfLevel || null,
        approvedMajors: course.approvedMajors || [],
        specializations: result.specializations,
      };
      const index = existing.findIndex((c) => c.courseCode === course.code);
      if (index === -1) existing.push(entry);
      else mergeCourseEntry(existing, entry);

      const totals = countTotals([entry]);
      const running = countTotals(existing);
      console.log(
        `  → ${result.specializations.length} pathways, ${totals.structures} structures, ${totals.semesters} semesters, ${totals.units} units` +
          ` | running: ${existing.length} courses, ${running.units} units (${Math.round((Date.now() - started) / 1000)}s)`,
      );
      if (result.failures?.length) {
        console.log(`  (partial: ${result.failures.length} pathway(s) failed — ${result.failures.join('; ')})`);
      }
    }

    saveDatabase(opts.out, existing);
    if (done % 15 === 0) await session.recycle(); // keep memory flat on long runs
  }

  await session.close();
  process.removeListener('SIGINT', onExit);
  process.removeListener('SIGTERM', onExit);

  const totals = countTotals(existing);
  saveDatabase(opts.out, existing);
  summarise(opts, existing, selected, skipped, failures);
  console.log(`Wrote ${path.relative(ROOT, opts.out)} (${(fs.statSync(opts.out).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(
    `Totals: ${existing.length} courses, ${totals.specializations} pathways, ${totals.structures} structures, ${totals.semesters} semesters, ${totals.units} units`,
  );

  // Regenerate the planner payload straight away.
  console.log('\nRunning scripts/build-course-planner-data.js ...');
  const build = spawnSync('node', [path.join(__dirname, 'build-course-planner-data.js'), opts.out], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (build.status !== 0) console.error(`build-course-planner-data.js exited ${build.status}`);
}

function summarise(opts, courses, selected, skipped, failures) {
  const totals = countTotals(courses);
  const scrapedCodes = new Set(courses.map((c) => c.courseCode));
  console.log('\n================ coverage ================');
  console.log(`Output courses:      ${courses.length}`);
  console.log(`Pathways:            ${totals.specializations}`);
  console.log(`Structures:          ${totals.structures}`);
  console.log(`Semesters:           ${totals.semesters}`);
  console.log(`Units (rows):        ${totals.units}`);
  console.log(`Skipped (cached):    ${skipped}`);
  for (const faculty of opts.faculties) {
    const inFaculty = selected.filter((c) =>
      String(c.faculties || '')
        .toLowerCase()
        .includes(faculty.toLowerCase()),
    );
    const done = inFaculty.filter((c) => scrapedCodes.has(c.code)).length;
    console.log(`  ${faculty}: ${done}/${inFaculty.length} courses (${Math.round((done / Math.max(inFaculty.length, 1)) * 100)}%)`);
  }
  if (failures.length) {
    console.log(`Failures (${failures.length}):`);
    for (const f of failures) console.log(`  ${f.code} ${f.title?.slice(0, 50)} — ${f.reason.slice(0, 120)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
