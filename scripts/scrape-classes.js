const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const assessmentsPath = path.join(__dirname, '../data/qut-unit-assessments.json');
const outputPath = path.join(__dirname, '../data/qut-unit-classes.json');

const SEMESTER_2_2026_PERIOD_ID = '4381474';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

// Day map to normalize days
const DAY_MAP = {
  'MON': 'Monday',
  'TUE': 'Tuesday',
  'WED': 'Wednesday',
  'THU': 'Thursday',
  'FRI': 'Friday',
  'SAT': 'Saturday',
  'SUN': 'Sunday',
};

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Format cookie header
function buildCookieHeader(setCookies) {
  if (!setCookies) return '';
  return setCookies
    .map(cookie => cookie.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

// Extract Liferay CSRF Token
function extractCsrfToken(html) {
  const match = html.match(/Liferay\.authToken\s*=\s*'([^']+)'/);
  return match ? match[1] : null;
}

// Parse unit search page for getUnitClasses parameters
function parseUnitSearchPage(html, unitCode) {
  const upperUnitCode = unitCode.toUpperCase();
  const versionByPeriod = new Map();

  const classUrlPattern = new RegExp(
    `_SolrQuest_WAR_solrquest_timePeriodId=(\\d+)[^"'\\s]*_SolrQuest_WAR_solrquest_unitCode=${upperUnitCode}[^"'\\s]*_SolrQuest_WAR_solrquest_versionNumber=(\\d+)`,
    'g'
  );

  for (const match of html.matchAll(classUrlPattern)) {
    versionByPeriod.set(match[1], match[2]);
  }

  const availablePeriodIds = [...versionByPeriod.keys()];
  const unitNotFound = availablePeriodIds.length === 0 && /No results/i.test(html);

  return {
    versionByPeriod,
    unitNotFound,
    availablePeriodIds,
  };
}

// Strip HTML tags helper
function stripHtml(htmlStr) {
  if (!htmlStr || !htmlStr.includes('<')) {
    return (htmlStr || '').trim();
  }
  return cheerio.load(htmlStr).text().replace(/\s+/g, ' ').trim();
}

// Parse activity type
function parseActivityType(activityGroupCode) {
  const prefix = activityGroupCode.replace(/\d+$/, '');
  const typeMap = {
    'LEC': 'Lecture',
    'TUT': 'Tutorial',
    'PRA': 'Practical',
    'PRC': 'Practical',
    'WOR': 'Workshop',
    'STU': 'Studio',
    'SEM': 'Seminar',
    'LAB': 'Laboratory',
  };
  return typeMap[prefix] || prefix;
}

// Parse weeks info
function parseWeeksInfo(description) {
  const match = description.match(/\((Week[^)]+)\)/i);
  return match ? match[1] : 'Weeks 1-13';
}

// Parse location into clean campus, building, room
function parseLocation(rawLocation) {
  const location = stripHtml(rawLocation);

  if (!location || location === '-') {
    return { campus: 'Unknown', location: 'TBA', building: '', room: '' };
  }

  if (location.toLowerCase() === 'online') {
    return { campus: 'Online', location: 'Online', building: '', room: '' };
  }

  // Typical formats: "GP Z401" or "KG R302"
  const parts = location.trim().split(/\s+/);
  if (parts.length >= 2) {
    const campusCode = parts[0];
    const roomCode = parts.slice(1).join(' ');
    
    let campus = 'Other';
    if (campusCode === 'GP') campus = 'Gardens Point';
    if (campusCode === 'KG') campus = 'Kelvin Grove';

    // Building is usually first letters of roomCode, e.g., "Z401" -> Building Z, Room 401
    // "O-401" -> Building O, Room 401
    const buildingMatch = roomCode.match(/^([A-Za-z]+[-]?)/);
    const building = buildingMatch ? buildingMatch[1].replace('-', '') : '';
    const room = roomCode;

    return {
      campus,
      location,
      building,
      room,
    };
  }

  return { campus: 'Other', location, building: location, room: '' };
}

// Main scrape process for one unit
async function scrapeUnitClasses(unitCode) {
  const upperUnitCode = unitCode.toUpperCase();
  const searchUrl = `https://qutvirtual4.qut.edu.au/web/qut/search?profile=UNIT&params.showOldUnits=false&params.query=${upperUnitCode}`;

  // 1. Bootstrap guest session
  const res = await fetch(searchUrl, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to bootstrap search page for ${upperUnitCode}: ${res.status}`);
  }

  const html = await res.text();
  const csrfToken = extractCsrfToken(html);
  if (!csrfToken) {
    throw new Error(`Could not extract CSRF token for ${upperUnitCode}`);
  }

  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookieHeader = buildCookieHeader(setCookies);

  // 2. Parse version number for Semester 2, 2026
  const metadata = parseUnitSearchPage(html, upperUnitCode);
  if (metadata.unitNotFound) {
    return { empty: true, reason: 'Unit not found' };
  }

  const versionNumber = metadata.versionByPeriod.get(SEMESTER_2_2026_PERIOD_ID);
  if (!versionNumber) {
    return { empty: true, reason: 'Not offered in Semester 2, 2026' };
  }

  // 3. Query getUnitClasses resource endpoint
  const classesUrl = new URL('https://qutvirtual4.qut.edu.au/web/qut/search');
  classesUrl.searchParams.set('p_p_id', 'SolrQuest_WAR_solrquest');
  classesUrl.searchParams.set('p_p_lifecycle', '2');
  classesUrl.searchParams.set('p_p_state', 'normal');
  classesUrl.searchParams.set('p_p_mode', 'view');
  classesUrl.searchParams.set('p_p_resource_id', 'getUnitClasses');
  classesUrl.searchParams.set('p_p_cacheability', 'cacheLevelPage');
  classesUrl.searchParams.set('_SolrQuest_WAR_solrquest_timePeriodId', SEMESTER_2_2026_PERIOD_ID);
  classesUrl.searchParams.set('_SolrQuest_WAR_solrquest_unitCode', upperUnitCode);
  classesUrl.searchParams.set('_SolrQuest_WAR_solrquest_versionNumber', versionNumber);

  const classesRes = await fetch(classesUrl.toString(), {
    headers: {
      ...HEADERS,
      'Cookie': cookieHeader,
      'Referer': searchUrl,
      'X-CSRF-Token': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
    }
  });

  if (!classesRes.ok) {
    throw new Error(`Failed to fetch classes for ${upperUnitCode}: ${classesRes.status}`);
  }

  const payload = await classesRes.json();
  if (payload.errorMessage) {
    throw new Error(`API error for ${upperUnitCode}: ${payload.errorMessage}`);
  }

  const rawClasses = payload.data || [];
  if (rawClasses.length === 0) {
    return { empty: true, reason: 'No classes scheduled' };
  }

  // 4. Transform and map the classes
  const classes = rawClasses.map(item => {
    const activityType = parseActivityType(item.ACTIVITY_GROUP_CD);
    const weeksInfo = parseWeeksInfo(item.DESCRIPTION);
    const dayFormatted = DAY_MAP[item.CLASS_START_DAY] || item.CLASS_START_DAY;
    const locInfo = parseLocation(item.LOCATION);
    const staff = stripHtml(item.STAFF) || 'TBA';
    const classLabel = `${item.ACTIVITY_GROUP_CD}${item.CLASS_NO} - ${weeksInfo}${item.DESCRIPTION.includes('Online Mode') ? ' - Online' : item.DESCRIPTION.includes('Internal Mode') ? ' - Internal' : ''}`;

    return {
      classLabel,
      activityGroupCode: item.ACTIVITY_GROUP_CD,
      classNumber: item.CLASS_NO,
      activityType,
      day: dayFormatted,
      timeDisplay: item.CLASS_TIME_DISPLAY,
      weeksInfo,
      campus: locInfo.campus,
      building: locInfo.building,
      room: locInfo.room,
      locationDisplay: locInfo.location,
      teachingStaff: staff,
      description: stripHtml(item.DESCRIPTION),
    };
  });

  return { empty: false, classes };
}

// Main execution
async function main() {
  if (!fs.existsSync(assessmentsPath)) {
    console.error(`Error: assessments file not found at ${assessmentsPath}`);
    process.exit(1);
  }

  const assessmentsData = JSON.parse(fs.readFileSync(assessmentsPath, 'utf8'));
  const unitCodes = Object.keys(assessmentsData.data || {}).sort();
  console.log(`Loaded ${unitCodes.length} unit codes from assessments database.`);

  // Load existing classes if present (incremental recovery)
  let classesDb = {};
  if (fs.existsSync(outputPath)) {
    try {
      const content = fs.readFileSync(outputPath, 'utf8');
      classesDb = JSON.parse(content).data || {};
      console.log(`Loaded ${Object.keys(classesDb).length} existing cached unit classes.`);
    } catch (err) {
      console.error('Error reading existing classes file, starting fresh.');
    }
  }

  // Filter out units that we already successfully processed or marked skipped
  const targetUnits = unitCodes.filter(code => !classesDb[code]);
  console.log(`Units remaining to process: ${targetUnits.length}`);

  if (targetUnits.length === 0) {
    console.log('All unit classes are already scraped!');
    return;
  }

  const CONCURRENCY = 6;
  let activeWorkers = 0;
  let index = 0;
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  const saveDatabase = () => {
    fs.writeFileSync(outputPath, JSON.stringify({
      scrapedAt: new Date().toISOString(),
      teachingPeriodId: SEMESTER_2_2026_PERIOD_ID,
      unitsCount: Object.keys(classesDb).length,
      data: classesDb,
    }, null, 2), 'utf8');
  };

  return new Promise((resolve) => {
    async function worker() {
      while (index < targetUnits.length) {
        const code = targetUnits[index++];
        activeWorkers++;
        console.log(`[Worker] [${index}/${targetUnits.length}] Scraping classes for ${code}...`);

        let retries = 3;
        let success = false;

        while (retries > 0 && !success) {
          try {
            const result = await scrapeUnitClasses(code);
            if (result.empty) {
              classesDb[code] = {
                unitCode: code,
                offered: false,
                reason: result.reason,
                classes: [],
              };
              skipCount++;
              console.log(`  -> Skipped ${code}: ${result.reason}`);
            } else {
              classesDb[code] = {
                unitCode: code,
                offered: true,
                classes: result.classes,
              };
              successCount++;
              console.log(`  -> Successfully fetched ${result.classes.length} classes for ${code}`);
            }
            success = true;
            saveDatabase();
          } catch (err) {
            retries--;
            console.error(`  -> Failed scraping ${code} (Retries left: ${retries}): ${err.message}`);
            if (retries === 0) {
              classesDb[code] = {
                unitCode: code,
                offered: false,
                reason: `Scraping failed: ${err.message}`,
                classes: [],
              };
              failCount++;
              saveDatabase();
            } else {
              await sleep(1000); // Wait 1s before retry
            }
          }
        }

        activeWorkers--;
        // Introduce small stagger to prevent hammering QUT Virtual
        await sleep(200);
      }

      if (activeWorkers === 0) {
        console.log('\n--- Scraping complete! ---');
        console.log(`Success: ${successCount}`);
        console.log(`Skipped (not offered/empty): ${skipCount}`);
        console.log(`Failed: ${failCount}`);
        resolve();
      }
    }

    // Launch worker pool
    for (let i = 0; i < Math.min(CONCURRENCY, targetUnits.length); i++) {
      worker();
    }
  });
}

main().catch(err => {
  console.error('Scraper main crash:', err);
  process.exit(1);
});
