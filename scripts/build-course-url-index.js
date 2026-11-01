#!/usr/bin/env node
/**
 * Builds a map of course code to QUT URL by crawling the course graph.
 *
 * Guessing slugs from titles does not work for double degrees. QUT publishes
 * "Bachelor of Engineering (Honours)/Bachelor of Business" at
 * /courses/bachelor-of-business-bachelor-of-engineering-honours, and the ordering
 * is not consistent enough to derive: other doubles reverse, drop qualifiers, or
 * carry a major in the slug.
 *
 * Every course page links to around 60 other course pages, so the URLs can be
 * collected rather than guessed. Crawl a handful of hub degrees, harvest the
 * /courses/ links, then match each unsupported course to the slug whose words best
 * cover its title.
 *
 * Writes data/course-urls.json: { builtAt, slugs, byCode }.
 *
 * Usage:
 *   node scripts/build-course-url-index.js
 *   node scripts/build-course-url-index.js --dry-run
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const OUT = path.join(__dirname, "../data/course-urls.json");
const BASE = "https://www.qut.edu.au";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
};

// Hub degrees whose pages link to most of their doubles.
const SEEDS = [
  "bachelor-of-business",
  "bachelor-of-engineering-honours",
  "bachelor-of-information-technology",
  "bachelor-of-science",
  "bachelor-of-education-secondary",
  "bachelor-of-mathematics",
  "bachelor-of-design",
  "bachelor-of-laws-honours",
  "bachelor-of-nursing",
  "bachelor-of-creative-industries",
  "bachelor-of-fine-arts",
  "bachelor-of-communication",
  "bachelor-of-data-science",
  "bachelor-of-property-economics",
  "bachelor-of-architectural-design",
  "bachelor-of-built-environment-honours",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set([
  "bachelor", "of", "master", "the", "and", "in", "with", "for", "a", "an",
  "honours", "honour", "degree", "science", "studies",
]);

function tokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t && !STOP.has(t));
}

/**
 * QUT returns 403 to plain HTTP clients, so this needs a real browser. The whole
 * crawl shares one page to keep it to a single browser launch.
 */
let sharedPage = null;

async function getPage() {
  if (sharedPage) return sharedPage;
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: HEADERS["User-Agent"] });
  sharedPage = page;
  sharedPage.__browser = browser;
  return page;
}

async function fetchSlugs(slug) {
  const page = await getPage();
  try {
    await page.goto(`${BASE}/courses/${slug}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1200);
  } catch {
    return [];
  }
  return page.evaluate(() => {
    const slugs = [];
    for (const anchor of document.querySelectorAll('a[href*="/courses/"]')) {
      const raw = anchor.getAttribute("href") || "";
      // Hrefs are absolute on these pages, so match past the /courses/ segment
      // rather than assuming a leading slash.
      const match = raw.match(/\/courses\/([a-z0-9-]+)/);
      if (match) slugs.push(match[1]);
    }
    return slugs;
  });
}

async function closeBrowser() {
  if (sharedPage && sharedPage.__browser) await sharedPage.__browser.close();
}

/** Best slug for a title, by how much of the title's words the slug covers. */
function bestSlug(title, slugs) {
  const wanted = tokens(title);
  if (wanted.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const slug of slugs) {
    const have = new Set(tokens(slug));
    const covered = wanted.filter((word) => have.has(word)).length;
    const score = covered / wanted.length;
    // A double degree must appear in the slug as two "bachelor-of" runs, and a
    // single degree must not, or a double would be picked for a single course.
    const isDouble = (slug.match(/bachelor-of/g) || []).length >= 2;
    const titleIsDouble = String(title).includes("/");
    if (isDouble !== titleIsDouble) continue;
    if (score > bestScore) {
      best = slug;
      bestScore = score;
    }
  }

  // Anything below this is a coincidence rather than a match.
  return bestScore >= 0.7 ? best : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const structures = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/course-structures.json"), "utf8"),
  );
  const catalogue = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/qut-virtual-courses.json"), "utf8"),
  );

  const byCodeTitle = new Map();
  for (const course of catalogue.courses || []) {
    if (course.code && course.title && !byCodeTitle.has(course.code)) {
      byCodeTitle.set(course.code, course.title);
    }
  }

  const allSlugs = new Set();
  for (const seed of SEEDS) {
    const found = await fetchSlugs(seed);
    for (const slug of found) allSlugs.add(slug);
    console.log(`  ${seed}: ${found.length} links, ${allSlugs.size} unique so far`);
    await sleep(200);
  }

  console.log(`\nHarvested ${allSlugs.size} course slugs`);

  const byCode = {};
  for (const [code, title] of byCodeTitle) {
    if (structures.courses[code]) continue;
    const slug = bestSlug(title, allSlugs);
    if (slug) byCode[code] = slug;
  }

  // Heads up before using byCode: title matching is not trustworthy. Two titles can
  // normalise to the same words and land on the wrong slug (Bachelor of
  // Communication/Bachelor of Science matches a behavioural-science/design page),
  // and QUT's pages do not expose their course code, so there is nothing exact to
  // match on. Treat byCode as a starting point for a hand check, and scrape only
  // pairs a person has confirmed.
  console.log(`Matched ${Object.keys(byCode).length} unsupported courses to a URL (UNVERIFIED, see comment)`);
  for (const [code, slug] of Object.entries(byCode).slice(0, 12)) {
    console.log(`  ${code} -> ${slug}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    await closeBrowser();
    return;
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        slugCount: allSlugs.size,
        slugs: [...allSlugs].sort(),
        byCode,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}`);
  await closeBrowser();
}

main().catch((err) => {
  console.error("build-course-url-index failed:", err);
  process.exit(1);
});
