# QUT Classmate

A timetable and degree planning tool for QUT students. Live at
[qut-classmate.vercel.app](https://qut-classmate.vercel.app).

## Why I built this

Planning a semester at QUT means opening Allocate+, then eStudent, then a unit
search page, then the course structure page, then a second browser tab per unit
because the titles are misleading and you want to read what the thing actually
covers. None of those tools answer the question you are really asking, which is
what your week will look like and whether the plan you are building is even legal.

I built this because I wanted one page that answers that. It is not an enrolment
tool and it will not replace eStudent. It is the thing I wanted open while
deciding.

## What it does

Unit search. Type a code, pick a semester, get every class with staff, room, and
weeks. It runs against QUT Virtual 4 directly, so the data is what QUT is serving
right now rather than a snapshot someone forgot to update.

Timetable creator. Put classes on a week, see clashes before they happen. Click a
class to remove it or drag it onto another stream of the same activity to move it.
The auto generator runs a Monte Carlo search over the streams for the units you
picked, with your work shifts blocked out, and gives you a timetable that fits.

Campus Explorer. You are on campus with an hour between classes. It shows what is
running in that hour, by building, so you can sit in on something.

Course Planner. Pick a course, a major, and a start year, then see the whole degree
as columns. Fill in the open elective slots, drag units between semesters, and set
how heavy each semester should be. Set the plan to 24 CP and it re-packs into twelve
semesters. Set it to 60 and it compresses. Every problem it can find comes with a
button that fixes it, and every fix is undoable.

## Why I think it is worth using

The prerequisite checking is the part that does not exist anywhere else before you
enrol. It reads QUT's own rules, including the messy ones, and tells you when a plan
is out of order:

```
Take AYB150 before AYB204        [Move it later]
EUB111 is not offered in that semester. It runs in Semester 1, 2027.
```

That second line matters more than it looks. It knows which semesters a unit runs
in, so moving a semester-only unit to the wrong column gets caught rather than
discovered in week one.

The planner also knows the difference between a unit that has been retired and one
that was never a real code, because it keeps a record of every unit it has seen.
When a unit has been replaced, it names the replacement from QUT's own equivalence
data.

## What it is built on

QUT Virtual 4's public unit search, with a guest session and CSRF token. No login,
no student credentials, nothing stored about you. Everything you build lives in your
browser's localStorage.

Data is scraped and committed:

| File | What it is | Size |
|---|---|---|
| `qut-unit-codes.json` | unit catalogue, 2130 units | 209 KB |
| `known-units.json` | every code we have ever seen, 2221 units | 301 KB |
| `unit-prereqs.json` | 1345 units, 1034 with prerequisite rules | 576 KB |
| `course-structures.json` | 199 courses with semester plans | 19 MB |
| `qut-unit-classes.json` | class snapshot, 823 units, 1354 classes | 846 KB |

Teaching period IDs are discovered from QUT's own search pages and refreshed by a
monthly workflow, because QUT rotates them every year without warning.

## Running it

```bash
npm install
npm run dev            # localhost:3000
npm test               # 153 tests: API contract, generator, planner, prerequisites
npm run check:copy     # enforces the writing style used everywhere on the site
```

Refreshing the data, in this order:

```bash
npm run periods:refresh    # teaching period IDs
npm run scrape:units       # unit catalogue
node scripts/expand-unit-catalogue.js --codes-from-gap
npm run scrape:classes     # class data for a period
node scripts/scrape-course-structures.js
node scripts/scrape-unit-prereqs.js
node scripts/build-known-units.js
```

Deploys with `npx vercel --prod`.

## What is rough

The unit catalogue is 2130 units and QUT has several thousand, so it is a partial
snapshot rather than a registry. It covers 96.5% of the units the course planner
references, which is the set that matters for planning, and gaps show up as "we
could not find that code" rather than a wrong answer.

The class snapshot is from one semester and is what Campus Explorer reads. When a
new semester starts it needs re-scraping, or that tab shows last semester's
classes.

Course structures come from QUT's published pages, so when QUT changes a degree the
planner keeps showing the old version until the scrape is re-run.

Prerequisite checks are advisory. In practice a waiver is often possible, and a
sensible email explaining your background usually gets one.

## Not affiliated with QUT

Always check the official timetable. Built by [Daniel Sam](https://github.com/danieltsam).
