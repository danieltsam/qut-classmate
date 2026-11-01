# QUT Classmate

Four tools for QUT students in one page. Live at [qut.vercel.app](https://qut.vercel.app).

https://github.com/user-attachments/assets/eb6b6a82-7f3d-4f40-9c06-48631e5bf17a

## What it does

### Unit search

Type a code and a semester, get every class with staff, room and weeks, pulled from
QUT Virtual 4 as you search. My use is a bit unusual. I never planned my week around
tutorials: I turned up on the days I already had work in the city, so the question
was usually whether there was a tute worth sitting in that day. It works just as
well for the ordinary case of finding out when a unit runs and who teaches it.

### Timetable creator

Once I have my classes chosen for the semester, this is where I build a rough
timetable around work and everything else I have on. Block out the times you are
unavailable, say how clumped you want your classes, and the generator picks a
combination for you.

QUT runs each activity several times, and those alternatives are called streams. A
unit might have one lecture in the morning and one in the afternoon, and four
practical groups across the week. Picking a stream decides which column of your week
that class lands in. Click a class to remove it, or drag it onto another stream of
the same activity if the first suggestion is awkward. I use this once a semester and
then forget about it.

### Campus explorer

You are paying to be at uni, and some of the lecturers outside the course you are
enrolled in are genuinely interesting. When I have an hour or more between classes I
will look at what is running nearby and sit in on whatever catches my attention. I am
a fan of a lot of the business school lectures, which often have pretty interesting
ideas, supply chain management being the one that got me started on this.

### Course planner

I use this to plan my degree properly, especially when I want to underload or
overload a semester. Sometimes it is pure fantasising about how quickly I could get
it all done at six units a semester, which I have never actually done.

The useful part is reading a unit's real information and assignment structure from
the same page I am planning on, rather than opening QUT's unit pages one at a time.
The thing I am happiest with is the requisite checking. It knows each unit's
prerequisites and which semesters it runs in, so a plan that is out of order, or that
puts a Semester 1 only unit in Semester 2, gets flagged with a button that moves it
rather than just a warning. Set a semester to 36 credit points and units move along
to the next one. Set 60 and it compresses.

## Data

Scraped from QUT and committed, so the app does not hit their servers on every
request.

| File | What it is | Size |
|---|---|---|
| `qut-unit-codes.json` | 2130 units with titles | 209 KB |
| `unit-prereqs.json` | 1345 units, 1034 with prerequisite rules | 576 KB |
| `course-structures.json` | 199 courses with semester plans | 19 MB |
| `qut-unit-classes.json` | one semester of classes, 823 units | 846 KB |

### Courses currently supported

213 courses have a study plan scraped and available in QUT Classmate, of the 329
that QUT lists. That covers 124 bachelors and 39 masters, including IT, engineering,
business, law, science and nursing, plus masters coursework in IT, engineering
management, robotics, renewable energy and advanced manufacturing.

Double degrees are mostly covered now: 48 of the 55 that QUT publishes, including
the Business, Engineering, IT, Education and Science combinations. They were the
awkward ones because QUT lists them under a slug that is often the reverse of the
course title, so `scripts/build-course-url-index.js` reads the course code out of the
schema.org block on each page instead of guessing from the name.

Not yet supported: 116 courses. That is mostly graduate certificates and research
degrees, plus a handful of doubles whose pages publish no unit structure at all. If
your course is in that group the planner says so rather than showing something
wrong.

Teaching period IDs change every year, so a monthly workflow reads them from QUT's
search pages and opens a PR when they move.

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

The catalogue holds 2130 units, which covers 96.5% of the ones the planner
references. QUT has several thousand in total, so it is a partial snapshot, and a
gap shows up as "we could not find that code" instead of a wrong answer.

The class snapshot is from one semester. Campus explorer needs re-scraping when a
new one starts or it shows last semester. Course structures go stale the same way
when QUT changes a degree.

## Contributing

If you think something could make this better, please open a PR.

Not affiliated with QUT. Always check the official timetable.
