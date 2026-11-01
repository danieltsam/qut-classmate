# QUT Classmate

Four small tools for QUT students, in one page. Live at [qut.vercel.app](https://qut.vercel.app).

## What this is

Not one workflow. It is a handful of things I kept wishing existed while I was
actually studying, and they are separate on purpose.

**Unit search.** I never planned my week around tutorials. I turned up on the days
I already had work in the city and did everything else online, so the question I
had was always narrow: is there a tutorial for one of my units today that I would
actually bother sitting in on. This answers that in one search.

**Timetable creator.** This one I use once, at the start of a semester. Put my work
shifts in as unavailable blocks, hit auto generate, take what it gives me. It beats
shuffling classes around by hand for twenty minutes, and you can drag a class onto
another stream of the same activity if the first suggestion is ugly.

**Campus explorer.** For when you are already on campus with an hour to kill. It
shows what is running in that hour, by building. Nobody checks attendance, so you
can just walk in.

**Course planner.** For before enrolment opens. Pick a course, a major, and a start
year, and see the whole degree as columns. This is the tab that does something you
cannot do anywhere else, so it gets its own section below.

## The planner is the interesting part

QUT will tell you what a unit's prerequisites are. It will not tell you that your
plan breaks them. This does, and it offers the fix rather than just the complaint:

```
Take AYB150 before AYB204            [Move it later]
EUB111 is not offered in that semester. It runs in Semester 1, 2027.
```

The second line is the one I did not expect to matter as much as it does. Units
that only run in one semester are easy to misfile, and you usually find out in week
one. It reads the semester a unit actually runs in, from QUT's own offerings.

You can also change how heavy a semester is. Set part-time and the degree re-packs
into twelve semesters. Set 60 credit points and it compresses. Every re-pack tells
you what moved and can be undone, and nothing is ever dropped.

It also knows the difference between a unit that has been retired and a code that
never existed, because it keeps a record of every unit it has seen. When a unit was
replaced, it names the replacement from QUT's equivalence data.

Around 200 courses are covered, including IT, engineering, business, law, science,
nursing, and the masters coursework degrees. If yours is missing, that is a gap
worth reporting.

## Advice I would actually give

If you have a spare elective, spend it on a
[QUT short-term exchange](https://qutvirtual2.qut.edu.au/ismms-core/studentNav/shortTermPrograms).
The unit still counts, so you are technically reattributing the money you would
have spent on it towards going somewhere new, and NCP funding covers a surprising
amount of the rest.

Prerequisite checks here are advisory, not binding. In practice a waiver is often
possible, and a sensible email explaining your background, outside projects or
prior experience usually gets one.

## What it runs on

QUT Virtual 4's public unit search, with a guest session and CSRF token. No login,
no student credentials, and nothing about you leaves the browser. Everything you
build lives in localStorage.

The data behind it is scraped and committed:

| File | What it is | Size |
|---|---|---|
| `qut-unit-codes.json` | unit catalogue, 2130 units | 209 KB |
| `known-units.json` | every code seen so far, 2221 units | 301 KB |
| `unit-prereqs.json` | 1345 units, 1034 with prerequisite rules | 576 KB |
| `course-structures.json` | 199 courses with semester plans | 19 MB |
| `qut-unit-classes.json` | class snapshot, 823 units, 1354 classes | 846 KB |

Teaching period IDs are discovered from QUT's search pages and refreshed monthly,
because QUT rotates them every year without warning.

## Running it

```bash
npm install
npm run dev            # localhost:3000
npm test               # 153 tests: API contract, generator, planner, prerequisites
npm run check:copy     # enforces the writing style used on the site
```

Refreshing the data, in order:

```bash
npm run periods:refresh    # teaching period IDs
npm run scrape:units       # unit catalogue
node scripts/expand-unit-catalogue.js --codes-from-gap
npm run scrape:classes     # class data for a period
node scripts/scrape-course-structures.js
node scripts/scrape-unit-prereqs.js
node scripts/build-known-units.js
```

Pushing to `main` deploys. Nothing else to do.

## What is rough

The unit catalogue is 2130 units and QUT has several thousand, so it is a partial
snapshot rather than a registry. It covers 96.5% of the units the planner
references, which is the set that matters for planning, and a gap shows up as "we
could not find that code" rather than a wrong answer.

The class snapshot is from one semester, so Campus Explorer needs re-scraping when
a new one starts or it shows last semester's classes. Course structures come from
QUT's published pages, so a degree QUT has changed keeps showing the old version
until the scrape runs again.

## Contributing

If something is wrong, missing, or just badly explained, open a PR. The data files
are regenerated by the scripts above, so a fix to a scraper is more useful than a
hand-edited JSON file.

Not affiliated with QUT. Always check the official timetable.
