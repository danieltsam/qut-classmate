#!/usr/bin/env node
/**
 * Turns the raw scraped degree-structure dump into the compact shape the Course
 * Planner imports.
 *
 * The raw file (`qut-degree-structures.json`) is ~15 MB because every unit carries
 * a full synopsis. The planner only needs structure — which unit sits in which
 * year/semester of which pathway — so synopses are dropped here. They already
 * live in `data/unit-meta.json`, which Campus Explorer and the planner both read.
 *
 * Usage:
 *   node scripts/build-course-planner-data.js                 # trim .scratch/degree-structures.json
 *   node scripts/build-course-planner-data.js path/to/raw.json
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_RAW = path.join(__dirname, '../.scratch/degree-structures.json');
const OUTPUT_PATH = path.join(__dirname, '../data/course-structures.json');

function trimUnit(unit) {
  if (!unit || !unit.code) return null;
  return {
    code: unit.code,
    title: unit.title || '',
    creditPoints: unit.creditPoints ?? null,
    campus: unit.campus || null,
  };
}

function trimSemester(semester) {
  const units = (semester.units || []).map(trimUnit).filter(Boolean);
  return {
    name: (semester.name || '').trim(),
    units,
    notes: (semester.textItems || []).map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean),
  };
}

/**
 * QUT lists two very different things in the same "structures" array:
 *   - progression plans: the actual full-time / part-time study sequence
 *   - option lists: pools of units ("Minor Options List", "QUT You",
 *     "Accountancy Extension Options", "Civil Engineering Breadth")
 * Option lists are not something a student "selects" as a study plan — they are
 * the source of units that get slotted into the progression's option notes. The
 * planner must only offer progressions in the plan dropdown, but it still needs
 * the option lists in the data so those slots can become actionable later.
 */
const OPTION_LIST_TITLE = /option|elective|minor|breadth|extension|list\b|qut you|capstone|second major|specialisation & advanced/i;

function structureKind(structure) {
  const title = String(structure.title || '');
  if (OPTION_LIST_TITLE.test(title)) return 'options';
  // Option pools are nearly always a single semester of many units.
  const semesters = (structure.semesters || []).filter((s) => (s.units || []).length > 0);
  if (semesters.length < 3) return 'options';
  return 'progression';
}

function trimStructure(structure) {
  // NOTE: do NOT merge semesters that share a name. A structure holds one
  // progression per entry point — "February entry" and "July entry" both have a
  // "Year 1, Semester 2" with different units in it. Merging them by name mixes
  // two alternative degree paths into one impossible plan.
  const semesters = (structure.semesters || []).map(trimSemester);
  const unitCount = semesters.reduce((n, s) => n + s.units.length, 0);
  const creditPoints = semesters.reduce(
    (n, s) => n + s.units.reduce((m, u) => m + (u.creditPoints || 0), 0),
    0,
  );
  return {
    id: structure.id,
    title: (structure.title || '').trim(),
    kind: structureKind(structure),
    unitCount,
    creditPoints,
    semesters,
  };
}

function main() {
  // Accept several raw files and merge them. The scraper can re-scrape a course
  // code under a different title (QUT reuses codes across titled variants), which
  // would otherwise drop the pathways recorded by an earlier run.
  const rawPaths = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const sources = rawPaths.length ? rawPaths.map((p) => path.resolve(p)) : [DEFAULT_RAW];

  const missing = sources.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.error(`Raw degree structures not found at ${missing.join(', ')}`);
    console.error('Regenerate with: node scripts/scrape-course-structures.js');
    process.exit(1);
  }

  const raw = { data: [], source: null, scrapedAt: null };
  for (const source of sources) {
    const parsed = JSON.parse(fs.readFileSync(source, 'utf8'));
    raw.data.push(...(parsed.data || []));
    raw.source = raw.source || parsed.source;
    raw.scrapedAt = raw.scrapedAt || parsed.scrapedAt;
  }

  const courses = {};

  for (const course of raw.data) {
    const specializations = (course.specializations || []).map((spec) => ({
      name: spec.specialization || 'default',
      url: spec.url || null,
      structures: (spec.structures || []).map(trimStructure),
    }));

    // A pathway with zero units is a scrape failure, not an empty plan — drop it
    // so the UI never offers "Accounting major" with nothing inside.
    for (const spec of specializations) {
      spec.structures = spec.structures.filter((s) => s.unitCount > 0);
    }

    const kept = specializations.filter((s) => s.structures.length > 0);

    // A course code can cover several titled degrees (DE43 is Bachelor of Design
    // plus seven named majors), and the scraper emits one raw entry per title.
    // Merge them so the planner shows every pathway under one course.
    const existing = courses[course.courseCode];
    if (!existing) {
      courses[course.courseCode] = {
        courseCode: course.courseCode,
        courseTitle: course.courseTitle || '',
        creditPoints: course.creditPoints ?? null,
        aqfLevel: course.aqfLevel || null,
        approvedMajors: course.approvedMajors || [],
        titles: course.courseTitle ? [course.courseTitle] : [],
        specializations: kept,
      };
      continue;
    }

    if (course.courseTitle && !existing.titles.includes(course.courseTitle)) {
      existing.titles.push(course.courseTitle);
    }
    for (const spec of kept) {
      if (!existing.specializations.some((s) => s.name === spec.name)) {
        existing.specializations.push(spec);
      }
    }
  }

  // A code can span many titled variants (BS05 is "Bachelor of Business" plus a
  // dozen named majors). Display the plainest title available rather than whichever
  // variant happened to scrape first.
  for (const course of Object.values(courses)) {
    const titles = course.titles || [];
    if (titles.length === 0) continue;
    const plain = titles.filter((t) => !/[()]/.test(t)).sort((a, b) => a.length - b.length);
    course.courseTitle = plain[0] || titles.slice().sort((a, b) => a.length - b.length)[0];
  }

  const kept = Object.values(courses).filter((c) => c.specializations.length > 0);
  if (kept.length === 0) {
    console.error('No usable course structures found — nothing written.');
    process.exit(1);
  }

  const payload = {
    builtAt: new Date().toISOString(),
    source: raw.source || 'qut.edu.au course pages',
    scrapedAt: raw.scrapedAt || null,
    courseCount: kept.length,
    courses,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const bytes = fs.statSync(OUTPUT_PATH).size;
  const structureCount = kept.reduce(
    (n, c) => n + c.specializations.reduce((m, s) => m + s.structures.length, 0),
    0,
  );
  console.log(`Wrote data/course-structures.json (${(bytes / 1024).toFixed(0)} KB) from ${sources.length} raw file(s)`);
  console.log(`  ${kept.length} courses, ${structureCount} pathways`);
  for (const c of kept) {
    const units = c.specializations.reduce(
      (n, s) => n + s.structures.reduce((m, st) => m + st.unitCount, 0),
      0,
    );
    console.log(`  ${c.courseCode.padEnd(6)} ${c.courseTitle.slice(0, 46).padEnd(48)} pathways=${c.specializations.length} units=${units}`);
  }
}

main();
