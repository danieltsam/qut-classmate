#!/usr/bin/env node
/**
 * Guards the voice rules for anything a student can read on the site.
 *
 * The rules exist because the copy is part of the product: this is a tool for
 * people planning a degree, not a marketing page. The banned list below is
 * deliberately blunt — these are the phrasings that creep in and make writing
 * sound generated rather than written.
 *
 * Usage:
 *   node scripts/check-copy.js          # report and exit 1 on violations
 *   node scripts/check-copy.js --warn   # report but always exit 0
 *
 * Comments are stripped before scanning: a comment explaining why we avoid a
 * word should not itself be flagged.
 */

const fs = require('fs');
const path = require('path');

const ROOTS = ['components', 'app'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.scratch']);

/** Rule 1, 2 and 3: sycophancy openers, stock vocabulary, hedging openers. */
const BANNED_PHRASES = [
  // stock vocabulary
  'delve', 'tapestry', 'testament', 'journey', 'realm', 'pivotal',
  'paramount', 'seamless', 'holistic', 'leverage', 'robust',
  // sycophancy
  'great question', "i'd be happy to", 'i would be happy to', 'certainly!',
  // hedging stacks
  "it's important to note", 'it is important to note', 'generally speaking',
  'in essence', 'at its core',
];

/** Rule 6: textbook metaphors that stand in for saying the actual thing. */
const BANNED_METAPHORS = [
  'acts like a', 'serves as a beacon', 'paints a vivid picture',
  'is a testament to', 'a window into', 'the lifeblood of',
];

/**
 * Rule 5: no em-dashes in copy a student reads. They pile up in generated prose
 * and read as a tic. Use a full stop, a comma or brackets instead.
 *
 * Two exceptions: the bare '—' / "—" literal, which is a null-value placeholder in
 * a table cell rather than punctuation, and anything inside a comment (comments are
 * stripped before this runs).
 */
const EM_DASH = /—/;
const PLACEHOLDER_DASH = /(['"])—\1/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Remove // and /* *\/ comments so a comment about a banned word is not a hit. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

const ROOT = path.join(__dirname, '..');
const files = ROOTS.flatMap((root) => walk(path.join(ROOT, root)));

const hits = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = stripComments(raw).split('\n');

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();

    for (const phrase of [...BANNED_PHRASES, ...BANNED_METAPHORS]) {
      // Word-boundary match so "leveraged" and "optimal" style near-misses are
      // still caught, but a substring inside a longer identifier is not.
      const pattern = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
      if (pattern.test(lower)) {
        hits.push({ file, line: index + 1, kind: 'banned phrase', detail: phrase, text: line.trim().slice(0, 120) });
      }
    }

    if (EM_DASH.test(line) && !PLACEHOLDER_DASH.test(line)) {
      hits.push({ file, line: index + 1, kind: 'em-dash', detail: 'use a full stop, comma or brackets', text: line.trim().slice(0, 120) });
    }
  });
}

if (hits.length === 0) {
  console.log(`Copy check passed: ${files.length} files, no banned phrasing, no em-dashes.`);
  process.exit(0);
}

console.error(`Copy check found ${hits.length} issue(s):\n`);
for (const hit of hits) {
  console.error(`  ${path.relative(ROOT, hit.file)}:${hit.line}  [${hit.kind}: ${hit.detail}]`);
  console.error(`    ${hit.text}`);
}

console.error('\nVoice rules live in AGENTS.md under "Voice and copy".');
process.exit(process.argv.includes('--warn') ? 0 : 1);
