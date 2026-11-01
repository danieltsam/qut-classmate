// Builds the trimmed unit metadata used by the Campus Explorer UI.
//
// Inputs (large, historical, NOT committed):
//   .scratch/degree-structures.json    <- git show 42d8e53:data/qut-degree-structures.json
//   .scratch/unit-assessments.json     <- git show 42d8e53:data/qut-unit-assessments.json
// Output:
//   data/unit-meta.json  { builtAt, count, units: { CODE: { title, synopsis, hasExam, assessmentCount, items } } }

const fs = require('fs');
const path = require('path');

const DEGREE_PATH = path.join(__dirname, '../.scratch/degree-structures.json');
const ASSESS_PATH = path.join(__dirname, '../.scratch/unit-assessments.json');
const OUTPUT_PATH = path.join(__dirname, '../data/unit-meta.json');

// Keep the emitted bundle small enough to import on every page render.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SYNOPSIS_CHARS = 1200;
const MAX_ITEM_DESCRIPTION_CHARS = 400;

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${label} at ${filePath}`);
    console.error(
      `Regenerate it with:\n  git show 42d8e53:data/${path.basename(filePath)} > ${path.relative(process.cwd(), filePath)}`
    );
    process.exit(1);
  }
  console.log(`Reading ${label} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB)...`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function truncate(value, max) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

// Degree structures: walk courses -> specializations -> structures -> semesters -> units
// and keep the first title/synopsis we see for each unit code.
function collectUnitInfo(degreeData) {
  const courses = Array.isArray(degreeData) ? degreeData : degreeData?.data || [];
  const units = new Map();

  for (const course of courses) {
    for (const spec of course?.specializations || []) {
      for (const structure of spec?.structures || []) {
        for (const semester of structure?.semesters || []) {
          for (const unit of semester?.units || []) {
            if (!unit?.code) continue;
            const code = String(unit.code).toUpperCase();
            const existing = units.get(code);
            const title = unit.title || existing?.title || '';
            const synopsis = unit.synopsis || existing?.synopsis || null;
            // Prefer an entry that actually has a synopsis.
            if (!existing || (!existing.synopsis && synopsis)) {
              units.set(code, { title, synopsis });
            }
          }
        }
      }
    }
  }

  return units;
}

function main() {
  const degreeData = readJson(DEGREE_PATH, 'degree structures');
  const assessmentData = readJson(ASSESS_PATH, 'unit assessments');

  const unitInfo = collectUnitInfo(degreeData);
  const assessments = assessmentData?.data || assessmentData || {};
  console.log(`Found ${unitInfo.size} units across degree structures, ${Object.keys(assessments).length} units with assessments.`);

  const allCodes = new Set([...unitInfo.keys(), ...Object.keys(assessments).map((c) => c.toUpperCase())]);

  const build = (includeItems) => {
    const units = {};
    for (const code of [...allCodes].sort()) {
      const info = unitInfo.get(code);
      const assessment = assessments[code] || assessments[code.toLowerCase()] || null;
      const entry = {
        title: info?.title || '',
        synopsis: info?.synopsis ? truncate(info.synopsis, MAX_SYNOPSIS_CHARS) : null,
        hasExam: !!assessment?.hasExam,
        assessmentCount: assessment?.assessmentCount ?? 0,
      };
      if (includeItems && Array.isArray(assessment?.items) && assessment.items.length) {
        entry.items = assessment.items.map((item) => ({
          name: item.name || '',
          description: truncate(item.description || '', MAX_ITEM_DESCRIPTION_CHARS) || '',
          weight: item.weight ?? null,
          individualGroup: item.individualGroup ?? null,
          dueDate: item.dueDate ?? null,
        }));
      }
      units[code] = entry;
    }
    return {
      builtAt: new Date().toISOString(),
      count: Object.keys(units).length,
      units,
    };
  };

  let output = build(true);
  let serialized = JSON.stringify(output, null, 0);
  let droppedItems = false;

  if (Buffer.byteLength(serialized) > MAX_BYTES) {
    console.warn(
      `Output with assessment items is ${(Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2)} MB (> 4 MB), dropping items.`
    );
    output = build(false);
    serialized = JSON.stringify(output, null, 0);
    droppedItems = true;
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, serialized);

  const sizeMb = (Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`  units: ${output.count}`);
  console.log(`  size:  ${sizeMb} MB`);
  console.log(`  items: ${droppedItems ? 'dropped (size budget)' : 'included'}`);
}

main();
