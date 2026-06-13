# QUT Classmate — Agent Context

Use this file when rebuilding or extending QUT Classmate. The current repo is a v0-generated Next.js app with significant cruft; a greenfield rewrite is reasonable. Preserve the **product intent** and **QUT Virtual 4 integration knowledge** below — not the existing file structure.

---

## Product

**QUT Classmate** is a student timetable planner for Queensland University of Technology (QUT). It replaces the painful parts of Allocate+ / QUT Virtual for:

1. **Unit search** — look up a unit code, see all class times
2. **Timetable builder** — pick classes, detect conflicts, weekly view
3. **Auto-generator** (nice-to-have) — Monte Carlo schedule optimizer
4. **Unit reviews** (optional) — community ratings via Supabase
5. **Export** — `.ics` / Google Calendar

**Target users:** QUT students planning semesters.  
**Production URL (historical):** `https://qut-classmate.vercel.app/`  
**Brand colour:** `#003A6E` (QUT blue)

---

## Data sources (verified June 2026)

### ✅ Use: QUT Virtual 4 SolrQuest (guest session, no student login)

Base: `https://qutvirtual4.qut.edu.au`

Legacy endpoints are **dead or authenticated** — do not rely on:

| Endpoint | Status |
|----------|--------|
| `qutvirtual3.qut.edu.au` HTML scrape | Unreliable / deprecated |
| `mytimetable.qut.edu.au/aplus/rest/timetable/subjects` | Requires auth |

### Timetable classes — `getUnitClasses`

```
GET /web/qut/search
  ?p_p_id=SolrQuest_WAR_solrquest
  &p_p_lifecycle=2
  &p_p_state=normal
  &p_p_mode=view
  &p_p_resource_id=getUnitClasses
  &p_p_cacheability=cacheLevelPage
  &_SolrQuest_WAR_solrquest_timePeriodId={periodId}
  &_SolrQuest_WAR_solrquest_unitCode={UNIT}
  &_SolrQuest_WAR_solrquest_versionNumber={version}
```

**Required headers:** `X-CSRF-Token`, `X-Requested-With: XMLHttpRequest`, session cookies, `Referer` to unit search page.

**Two-step flow (mandatory):**

1. **Bootstrap guest session** — GET the unit search page:
   ```
   /web/qut/search?profile=UNIT&params.showOldUnits=false&params.query={UNIT}
   ```
   Extract from HTML:
   - `Liferay.authToken = '...'` → CSRF token
   - `Set-Cookie` headers → cookie jar

2. **Parse `versionNumber` per teaching period** from embedded `getUnitClasses` URLs in that HTML. **Do not hardcode `versionNumber=1`.** Example: `EFB335` uses `1`, `CAB201` uses `3`.

3. **Call `getUnitClasses`** with cookies + CSRF + correct `versionNumber`.

**Response shape (JSON):**

```json
{
  "data": [{
    "ACTIVITY_GROUP_CD": "LEC01",
    "DESCRIPTION": "Lecture - (Week 1-13) (Internal Mode)",
    "CLASS_START_DAY": "THU",
    "CLASS_TIME_DISPLAY": "9:00 AM - 11:00 AM",
    "CLASS_NO": "01",
    "STAFF": "<a ...>Name</a>",
    "LOCATION": "GP Z401" | "Online" | HTML link
  }]
}
```

**Error cases:**

| Situation | Signal |
|-----------|--------|
| Discontinued unit (e.g. CAB202) | Search page has "No results", no `getUnitClasses` URLs |
| Unit exists, wrong semester | Unit found but no URL for that `timePeriodId` |
| Missing CSRF / cookies | `{"errorMessage":"You have not provided a valid session token"}` |

### Unit catalog — search HTML (not JSON)

**Current units** — paginated prefix search:

```
/web/qut/search?profile=UNIT&params.query={PREFIX}&params.showOldUnits=false&params.start={0,10,20...}
```

- Parse only `.search-unit-info h4.content-title` (ignore course results like `IX85 - Bachelor of...`).
- Modern format: `CAB201 - Programming Principles` → code `CAB201`
- **Use 3-letter prefixes** (`CAB`, `EFB`, …) — 1–2 letter searches miss units. Paginate when a page returns 10 results.
- ~17k prefixes (AAA–ZZZ); run as offline script with concurrency (~4–6), dedupe by code.

**Legacy/historical units** — wildcard (optional):

```
/web/qut/search?params.query=*&profile=UNIT&params.showOldUnits=true&params.sortKey=0&params.start={n}
```

Returns old formats like `CH 815-2 - Inorganic Chemistry II`. Paginate until empty page.

**Output:** commit `data/qut-unit-codes.json` with `{ codes, units: [{ code, title, legacy }], scrapedAt, stats }`.

---

## Teaching periods (2026)

| ID | Period |
|----|--------|
| `4381471` | Semester 1, 2026 |
| `4381474` | Semester 2, 2026 (default from ~July) |
| `4734572` | Exchange Semester 1, 2026 |
| `4734574` | Exchange Semester 2, 2026 |

IDs change each year — scrape from unit search page exam-timetable links (`p_time_period_id=…`, `p_teaching_period=SEM-1/2026/U`).

Old 2025 IDs (`621050`, `621051`, `621052`) used legacy APIs; drop unless still needed.

---

## Recommended minimal architecture (greenfield)

```
app/
  page.tsx                    # 3 tabs: Search | Timetable | Reviews
  api/timetable/search/route.ts   # proxy to QUT Virtual 4
  api/units/route.ts          # optional: serve cached catalog
lib/
  qut/
    session.ts                # guest bootstrap (CSRF + cookies)
    timetable.ts              # getUnitClasses + normalize → TimetableEntry
    units.ts                  # parse search HTML + scrape helpers
  types.ts                    # TimetableEntry, SelectedClass, TeachingPeriod
data/
  qut-unit-codes.json         # scraped catalog (committed)
scripts/
  scrape-units.ts             # offline catalog refresh
```

**Stack suggestion:** Next.js App Router, React, Tailwind, shadcn/ui. Skip AWS CDK, duplicate rate-limit contexts, stub files, and 4000-line static unit arrays.

### Normalized `TimetableEntry`

```typescript
interface TimetableEntry {
  class: string           // display label incl. weeks/mode
  activityType: string    // "Lecture", "Tutorial", …
  classTitle: string
  dayFormatted: string    // "Monday"
  startTime: string       // "9:00am"
  endTime: string
  location: string
  locationBuilding: string
  locationRoom: string
  teachingStaff: string
  unitCode?: string
  teachingPeriodId?: string
}
```

Activity type prefix map: `LEC→Lecture`, `TUT→Tutorial`, `PRA/PRC→Practical`, `WOR→Workshop`, `STU→Studio`.

---

## Caching & rate limits

| Layer | Purpose | Notes |
|-------|---------|-------|
| Client `localStorage` | Timetable results, selected classes | 30-day TTL; key `timetable-{UNIT}-{periodId}` |
| Server KV/Redis | Timetable API cache | Optional; 1h TTL; graceful fallback if unset |
| Middleware | 15 req/day/IP for `/api/timetable/search` | Current repo uses in-memory Map (breaks on cold start) — use KV in prod |

QUT Virtual bootstrap = 2 HTTP requests per cache miss; cache aggressively.

---

## Optional: Unit reviews (Supabase)

Separate feature — timetable works without it.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # server only
```

Tables: `reviews`, `review_ratings`, `unit_review_summary`. Lazy-init Supabase in API routes (don't crash build when env missing).

---

## What to discard from current repo

Do **not** port blindly:

- `lib/aws-stack.ts`, `bin/aws-app.ts` — unused AWS CDK experiment
- `lib/timetable-actions.ts` — stub/simulation code
- Duplicate `RateLimitContext` in `lib/` and `context/`
- `lib/unit-codes.ts` 4000-line static array — replace with scraped JSON
- Legacy API paths in `app/api/timetable/search/route.ts` (cheerio old API, mytimetable API)
- `output: 'standalone'` unless deploying Docker
- Full shadcn component library if rebuilding — install only what you use
- `ignoreBuildErrors` / `ignoreDuringBuilds` — fix types in a clean rewrite

---

## Features priority for v2

### P0 — ship this
- Unit search by code + teaching period
- Results table (grouped by activity type)
- Timetable weekly view + conflict detection (week-aware)
- localStorage persistence
- `.ics` export

### P1 — strong differentiators
- Unit autocomplete from `qut-unit-codes.json`
- Auto timetable generator (Monte Carlo — existing algo is ~1300 lines in `auto-timetable-generator.tsx`, worth porting logic not UI verbatim)
- Google Calendar export link

### P2 — later
- Unit reviews (Supabase)
- Server-side KV cache
- SEO / OG images / analytics

---

## Dev & deploy

```bash
npm install
npm run dev          # localhost:3000
npm run scrape:units # refresh data/qut-unit-codes.json
npm run build
```

**Vercel env (optional):** `KV_REST_API_URL`, `KV_REST_API_TOKEN`, Supabase vars above.

**Smoke test after changes:**

```bash
curl -X POST localhost:3000/api/timetable/search \
  -H 'Content-Type: application/json' \
  -d '{"unitCode":"CAB201","teachingPeriodId":"4381471"}'
# expect ~15 classes, source qut_virtual4

curl -X POST ... -d '{"unitCode":"CAB202","teachingPeriodId":"4381471"}'
# expect discontinued error
```

---

## UX conventions (keep)

- Single-page app, 3 tabs: Unit Search | Timetable Creator | Unit Reviews
- Unit code validation: `/^[A-Za-z]{3}[0-9]{3}$/`
- Default teaching period: current semester (Sem 2 from July)
- Dark mode via `next-themes`
- Clear errors: discontinued vs wrong semester vs rate limit

---

## Reference files in this repo (if mining before delete)

| File | Why read it |
|------|-------------|
| `lib/qutvirtual4-client.ts` | Working timetable fetch |
| `lib/qutvirtual4-session.ts` | Guest session bootstrap |
| `lib/qutvirtual4-units.ts` | Unit catalog scrape/parse |
| `lib/format-utils.ts` | Overlap detection, day/time helpers |
| `components/auto-timetable-generator.tsx` | Monte Carlo generator logic |
| `lib/export-utils.ts` | ICS export |
| `data/qut-unit-codes.json` | Scraped catalog (if present) |

---

## Agent guidelines

1. **Prefer QUT Virtual 4 guest session** for all timetable/unit data — no student credentials.
2. **Always parse `versionNumber` from HTML** — never assume `1`.
3. **Scrape units offline** — don't hit QUT on every autocomplete keystroke.
4. **Keep the diff small** — this app is a focused student tool, not a platform.
5. **Don't commit secrets** — `.env*` is gitignored; use `.env.example`.
6. **Teaching period IDs rot yearly** — document how to refresh them from QUT Virtual HTML.
