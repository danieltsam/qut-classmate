#!/usr/bin/env node
/**
 * Builds an exact map of course code to QUT course URL.
 *
 * Two things make this necessary and possible.
 *
 * Necessary: slugs cannot be derived from titles. QUT publishes "Bachelor of
 * Engineering (Honours)/Bachelor of Business" at
 * /courses/bachelor-of-business-bachelor-of-engineering-honours, and the ordering
 * varies per course. Title matching was tried first and produced confident nonsense
 * (Bachelor of Communication/Bachelor of Science landing on a behavioural-science
 * and design page), so it is not used here.
 *
 * Possible: every course page carries a schema.org Course block whose courseCode is
 * the real code. QUT does not print the code in the visible text, which is why this
 * is not obvious.
 *
 * Discovery works because each course page links to roughly 60 others, so a handful
 * of hub degrees reveals most of the catalogue's URLs.
 *
 * Writes data/course-urls.json: { builtAt, slugCount, byCode: { CODE: { slug, name } } }
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

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Hub degrees whose pages link to most of their doubles and siblings.
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
  "bachelor-of-games-and-interactive-environments",
  "bachelor-of-justice",
  "bachelor-of-health-science",
  "bachelor-of-urban-development-honours",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser = null;
let page = null;

async function getPage() {
  if (page) return page;
  browser = await chromium.launch();
  page = await browser.newPage({ userAgent: USER_AGENT });
  return page;
}

async function closeBrowser() {
  if (browser) await browser.close();
  browser = null;
  page = null;
}

async function goto(slug) {
  const p = await getPage();
  try {
    await p.goto(`${BASE}/courses/${slug}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(900);
    return p;
  } catch {
    return null;
  }
}

async function linksFrom(slug) {
  const p = await goto(slug);
  if (!p) return [];
  return p.evaluate(() => {
    const slugs = [];
    for (const anchor of document.querySelectorAll('a[href*="/courses/"]')) {
      const raw = anchor.getAttribute("href") || "";
      const match = raw.match(/\/courses\/([a-z0-9-]+)/);
      if (match) slugs.push(match[1]);
    }
    return slugs;
  });
}

async function courseCodeFrom(slug) {
  const p = await goto(slug);
  if (!p) return null;
  return p.evaluate(() => {
    for (const block of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(block.textContent || "");
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          if (entry && entry["@type"] === "Course" && entry.courseCode) {
            return { code: String(entry.courseCode).toUpperCase(), name: entry.name || null };
          }
        }
      } catch {
        // A malformed block is not a reason to fail the whole crawl.
      }
    }
    return null;
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const slugs = new Set();
  console.log("Crawling hub pages for course links");
  for (const seed of SEEDS) {
    const found = await linksFrom(seed);
    for (const slug of found) slugs.add(slug);
    console.log(`  ${seed}: ${found.length} links, ${slugs.size} unique so far`);
    await sleep(150);
  }

  console.log(`\nHarvested ${slugs.size} slugs. Reading course codes from JSON-LD`);

  const byCode = {};
  let done = 0;
  for (const slug of [...slugs].sort()) {
    const found = await courseCodeFrom(slug);
    if (found) byCode[found.code] = { slug, name: found.name };
    done += 1;
    if (done % 20 === 0) {
      console.log(`  ${done}/${slugs.size} read, ${Object.keys(byCode).length} codes resolved`);
    }
  }

  await closeBrowser();

  let alreadyHave = 0;
  let missing = [];
  try {
    const structures = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/course-structures.json"), "utf8"),
    );
    for (const code of Object.keys(byCode)) {
      if (structures.courses[code]) alreadyHave += 1;
      else missing.push(code);
    }
  } catch {
    // Without the structures file we cannot tell which are new, which is fine.
  }

  console.log(
    `\nResolved ${Object.keys(byCode).length} codes. ${alreadyHave} already have a plan, ${missing.length} do not.`,
  );
  for (const code of missing.slice(0, 25)) {
    console.log(`  ${code} -> ${byCode[code].slug}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      { builtAt: new Date().toISOString(), slugCount: slugs.size, byCode },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}`);
}

main()
  .catch(async (err) => {
    console.error("build-course-url-index failed:", err);
    await closeBrowser();
    process.exit(1);
  });
