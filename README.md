# QUT Classmate

Four tools for QUT students in one page. Live at [qut.vercel.app](https://qut.vercel.app).

https://github.com/user-attachments/assets/eb6b6a82-7f3d-4f40-9c06-48631e5bf17a

## What it does

### Unit search

Type a code and a semester, get every class with staff, room and weeks, pulled from
QUT Virtual 4 as you search. I never planned my week around tutorials. I turned up
on the days I already had work in the city, so the only question I had was whether
there was a tute worth sitting in today. This answers it.

### Timetable creator

Put classes on a week and see clashes before they happen. Click one to remove it,
or drag it onto another stream of the same activity to move it. The auto generator
searches the streams for your units with your work shifts blocked out. I use this
once a semester and then forget about it.

### Campus explorer

For the hour you have to kill between classes. It shows what is running right now,
by building. Nobody checks attendance, so you can walk in.

### Course planner

Pick a course, a major and a start year, and the whole degree opens as columns.
Fill the elective slots, drag units between semesters, and set how heavy each one
should be. Set part-time and the plan re-packs into twelve semesters. Set 60 CP and
it compresses. Nothing is dropped and every change can be undone.

## The reason to use it

QUT tells you a unit's prerequisites. It does not tell you that your plan breaks
them. This does, and it offers the fix instead of just the complaint:

```
Take AYB150 before AYB204            [Move it later]
EUB111 is not offered in that semester. It runs in Semester 1, 2027.
```

That second line is the one I did not expect to matter. A unit that only runs in
one semester is easy to misfile, and you normally find out in week one. It reads the
semester from QUT's own offerings rather than a hardcoded table.

It also separates a retired unit from a code that never existed, because it keeps a
record of every unit it has seen, and names the replacement from QUT's equivalence
data when there is one.

Around 200 courses are covered, including IT, engineering, business, law, science,
nursing and the masters coursework degrees.

## Advice I would give anyone

If you have a spare elective, spend it on a
[QUT short-term exchange](https://qutvirtual2.qut.edu.au/ismms-core/studentNav/shortTermPrograms).
The unit still counts, so you are reattributing the money you would have spent on it
towards going somewhere new, and NCP funding covers a fair amount of the rest.

Prerequisite checks here are advisory. A waiver is often possible, and a sensible
email explaining your background or outside projects usually gets one.

## Data

Scraped from QUT and committed, so the app does not hammer their servers on every
request.

| File | What it is | Size |
|---|---|---|
| `qut-unit-codes.json` | 2130 units with titles | 209 KB |
| `unit-prereqs.json` | 1345 units, 1034 with prerequisite rules | 576 KB |
| `course-structures.json` | 199 courses with semester plans | 19 MB |
| `qut-unit-classes.json` | one semester of classes, 823 units | 846 KB |

Teaching period IDs change every year, so a monthly workflow reads them from QUT's
own search pages and opens a PR when they move.

## Running it

```bash
npm install
npm run dev            # localhost:3000
npm test               # 153 tests
npm run check:copy     # enforces the writing style used on the site
```

Pushing to `main` deploys.

Refreshing the data, in order:

```bash
npm run periods:refresh
npm run scrape:units
node scripts/expand-unit-catalogue.js --codes-from-gap
npm run scrape:classes
node scripts/scrape-course-structures.js
node scripts/scrape-unit-prereqs.js
node scripts/build-known-units.js
```

## What is rough

The catalogue is 2130 units and QUT has several thousand, so it covers 96.5% of the
units the planner references rather than everything. A gap shows up as "we could not
find that code" instead of a wrong answer.

The class snapshot is from one semester. Campus explorer needs re-scraping when a
new one starts or it shows last semester. Course structures go stale the same way
when QUT changes a degree.

## Contributing

If something is wrong or missing, open a PR. Fixing a scraper is more useful than
hand-editing a JSON file, since the files are regenerated.

Not affiliated with QUT. Always check the official timetable.
