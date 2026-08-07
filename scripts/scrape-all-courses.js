const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const cookies = 'COOKIE_SUPPORT=true; GUEST_LANGUAGE_ID=en_AU; LFR_SESSION_STATE_31084738=1780973542011; _saml_idp=aHR0cHM6Ly9lc29lLnF1dC5lZHUuYXU=; JSESSIONID=37037231E37ABD534ABF7EE1C6A91C2A.node3; mycampus_session_cookie=2303336108.64288.0000; TS01d33206=0199e5de2cb3d16cc5fefa722e30e360070bae09ac7e17f215460ab50f82a48216bbb3057bdd0dd21330d99704508a96368155bdaa44f87ee8a36c92d5d084c0c0776227de15fe9e4da447368ff34d2195ad213b62; LFR_SESSION_STATE_20102=1781362353531; TS2125ef01027=084c26d5ccab20007035571ffe97782571138fffca2f4c8387911f1b38ad3db628f3d11cf20601000800eb63e7113000dc6a19b00d6b7a8b9c0f892c3e5069e09981b0dcfa0c3a383c0855c5977a9e70fafa4ba2d7e60029793e58746f53c1a3';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const allCourses = [];
  let start = 0;
  const pageSize = 10;
  let hasMore = true;

  console.log("Starting scrape of all QUT courses...");

  while (hasMore) {
    console.log(`Fetching courses start=${start}...`);
    const url = `https://qutvirtual4.qut.edu.au/web/qut/search?params.query=*&profile=COURSE&params.showOldUnits=true&params.sortKey=0&params.start=${start}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Cookie': cookies,
          'Referer': 'https://qutvirtual4.qut.edu.au/web/qut/search?params.query=*&params.showOldUnits=true&profile=UNIT&params.stickyTabs=false&params.singleResultRedirect=false',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        }
      });

      if (!response.ok) {
        console.error(`HTTP Error ${response.status} at start=${start}`);
        break;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const items = $('.course-result-item');
      if (items.length === 0) {
        console.log(`No course result items found at start=${start}. Stopping.`);
        hasMore = false;
        break;
      }

      items.each((i, el) => {
        const item = $(el);
        const headingText = item.find('h4').text().trim();
        const codeMatch = headingText.match(/^([A-Z0-9]{4})\s*-\s*(.+)$/);
        
        let code = '';
        let title = headingText;
        if (codeMatch) {
          code = codeMatch[1];
          title = codeMatch[2];
        } else {
          const parts = headingText.split(' - ');
          if (parts.length >= 2) {
            code = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
          }
        }

        const details = item.find('.course-details');
        
        // Extract facets
        const studyLevels = details.find('.course-details-studyLevels').text().replace('Study levels:', '').trim();
        const faculties = details.find('.course-details-faculties').text().replace('Faculties:', '').trim();
        const year = details.find('.course-details-year').text().replace('Year:', '').trim();
        const location = details.find('.course-details-location').text().replace('Location:', '').trim();

        allCourses.push({
          code,
          title,
          studyLevels,
          faculties,
          year: year ? parseInt(year, 10) : null,
          location
        });
      });

      console.log(`  Found ${items.length} courses on this page. Total collected: ${allCourses.length}`);

      if (items.length < pageSize) {
        console.log("Last page reached (fewer than 10 items).");
        hasMore = false;
      } else {
        start += pageSize;
        await sleep(150); // polite delay
      }

    } catch (err) {
      console.error(`Error at start=${start}:`, err);
      break;
    }
  }

  const outputPath = path.join(__dirname, '../data/qut-virtual-courses.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    scrapedAt: new Date().toISOString(),
    count: allCourses.length,
    courses: allCourses
  }, null, 2), 'utf8');

  console.log(`Saved ${allCourses.length} courses to ${outputPath}`);
}

main().catch(console.error);
