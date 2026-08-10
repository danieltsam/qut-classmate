const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const activeCoursesPath = path.join(__dirname, '../data/qut-active-courses.json');
const outputPath = path.join(__dirname, '../data/qut-degree-structures.json');

// Select popular courses to scrape
const TARGET_COURSE_CODES = ['IN01', 'BS05', 'MS01', 'IN05', 'IX22', 'NS42', 'ST01', 'EN01', 'LW38', 'IN20', 'IQ20'];

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/&/g, '-and-')         // Replace & with 'and'
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse the structures content HTML using Cheerio
function parseStructureHtml(html) {
  const $ = cheerio.load(html);
  const structures = [];

  $('h4[id^="structure-"]').each((_, el) => {
    const heading = $(el);
    const structureId = heading.attr('id').replace('structure-', '');
    const title = heading.text().trim();

    const structure = {
      id: structureId,
      title: title,
      semesters: []
    };

    const contents = $(`#structure-contents-${structureId}, #default-structure-contents-${structureId}`);
    if (contents.length > 0) {
      contents.find('.semester-item-content').each((_, semEl) => {
        const semBlock = $(semEl);
        const semId = semBlock.attr('id').split('-').pop();
        
        const headingEl = contents.find(`#semester-${semId}`);
        let semesterName = headingEl.text().trim() || `Semester ${semId}`;
        
        // Clean up duplicate text inside headings due to mobile titles
        semesterName = semesterName.split('\n')[0].trim();

        const semester = {
          name: semesterName,
          units: [],
          textItems: []
        };

        semBlock.children().each((_, itemEl) => {
          const child = $(itemEl);
          if (child.hasClass('unit-item-title')) {
            const idAttr = child.find('h6').attr('id');
            if (!idAttr) return;
            
            const parts = idAttr.split('-');
            const unitCode = parts[1];
            const unitTitle = child.find('h6').text().trim();
            
            const href = child.attr('href');
            if (!href) return;
            const contentsId = href.replace('#', '');
            const unitContents = semBlock.find(`[id="${contentsId}"]`);
            
            let creditPoints = null;
            let campus = '';
            let synopsis = '';

            if (unitContents.length > 0) {
              unitContents.find('dl.row dt').each((_, dtEl) => {
                const dt = $(dtEl).text().trim().toLowerCase();
                const dd = $(dtEl).next('dd').text().trim();
                if (dt.includes('credit points')) {
                  creditPoints = parseInt(dd, 10);
                } else if (dt.includes('campus')) {
                  campus = dd;
                }
              });
              synopsis = unitContents.find('p').first().text().trim();
            }

            semester.units.push({
              code: unitCode,
              title: unitTitle,
              creditPoints,
              campus,
              synopsis
            });
          } else if (child.hasClass('text-item-contents')) {
            semester.textItems.push(child.text().trim());
          }
        });

        structure.semesters.push(semester);
      });
    }

    structures.push(structure);
  });

  return structures;
}

async function scrapeCourseStructure(page, courseCode, courseTitle) {
  const baseSlug = slugify(courseTitle);
  const courseUrl = `https://www.qut.edu.au/courses/${baseSlug}`;
  
  console.log(`\n==================================================`);
  console.log(`Processing course ${courseCode}: ${courseTitle}`);
  console.log(`Target URL: ${courseUrl}`);

  // 1. Load the main course page
  try {
    const response = await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    if (!response || response.status() === 404) {
      console.error(`  Error 404: Course page not found for ${courseCode}`);
      return null;
    }
  } catch (err) {
    console.error(`  Failed to load course page: ${err.message}`);
    return null;
  }

  // 2. Look for majors (links starting with courseUrl + "-")
  const majorLinks = await page.evaluate((baseUrl) => {
    const links = [];
    document.querySelectorAll('a').forEach(a => {
      const href = a.href || '';
      if (href.startsWith(baseUrl + '-') && !links.includes(href)) {
        links.push(href);
      }
    });
    return links;
  }, courseUrl);

  const targets = [];
  if (majorLinks.length > 0) {
    console.log(`  Found ${majorLinks.length} major specializations to scrape:`);
    majorLinks.forEach(link => {
      const majorName = link.split('/').pop().replace(baseSlug + '-', '').replace(/-/g, ' ');
      targets.push({ name: majorName, url: link });
      console.log(`    - ${majorName} (${link})`);
    });
  } else {
    console.log(`  No majors found. Scraping main course page structure.`);
    targets.push({ name: 'Default', url: courseUrl });
  }

  const results = [];

  // 3. Scrape each target major/default page
  for (const target of targets) {
    console.log(`  Scraping structure for: ${target.name}...`);
    try {
      await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Click details and units tab
      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('#details-and-units-button') || document.querySelector('button[aria-controls="details-and-units-tab"]');
        if (btn) {
          btn.click();
          return true;
        }
        const heading = document.querySelector('#details-and-units-tab .content-title');
        if (heading) {
          heading.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        console.log(`    Could not find "Details and units" tab button. Skipping structure.`);
        continue;
      }

      // Wait for AJAX structure load
      await sleep(5000);

      const structuresHtml = await page.evaluate(() => {
        const container = document.querySelector('#structures-content');
        return container ? container.innerHTML : '';
      });

      if (!structuresHtml || structuresHtml.includes('spin.js')) {
        console.log(`    Structures content did not load successfully (empty or spinner).`);
        continue;
      }

      const parsedStructures = parseStructureHtml(structuresHtml);
      results.push({
        specialization: target.name,
        url: target.url,
        structures: parsedStructures
      });

      console.log(`    Successfully parsed ${parsedStructures.length} study plans.`);

    } catch (err) {
      console.error(`    Error scraping ${target.name}:`, err.message);
    }

    await sleep(200); // Polite rate limit delay
  }

  return results;
}

async function main() {
  if (!fs.existsSync(activeCoursesPath)) {
    console.error(`Error: Active courses file not found at ${activeCoursesPath}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(activeCoursesPath, 'utf8'));
  const activeCourses = catalog.courses;

  // Filter for our target course codes
  const selectedCourses = activeCourses.filter(c => TARGET_COURSE_CODES.includes(c.code));
  
  // Inject IV04 manually since it is a double degree with a custom page slug
  selectedCourses.push({
    code: 'IV04',
    title: 'Bachelor of Information Technology / Master of Data Science',
    creditPoints: 384,
    aqfLevel: 'AQF Level 9',
    approvedMajors: []
  });

  console.log(`Scraping degree structures for ${selectedCourses.length} selected courses...`);

  // Load existing data if available (incremental scraping checkpoint)
  let degreeStructuresDatabase = [];
  if (fs.existsSync(outputPath)) {
    try {
      const content = fs.readFileSync(outputPath, 'utf8');
      degreeStructuresDatabase = JSON.parse(content).data || [];
      console.log(`Loaded ${degreeStructuresDatabase.length} existing course structures from cache.`);
    } catch (err) {
      console.error('Error reading existing degree structures database, starting fresh:', err.message);
    }
  }

  console.log("Launching headless Chrome...");
  let browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const saveDatabase = () => {
    fs.writeFileSync(outputPath, JSON.stringify({
      scrapedAt: new Date().toISOString(),
      coursesCount: degreeStructuresDatabase.length,
      data: degreeStructuresDatabase
    }, null, 2), 'utf8');
  };

  for (const course of selectedCourses) {
    // Check if course is already scraped and has specializations
    const existingIndex = degreeStructuresDatabase.findIndex(c => c.courseCode === course.code);
    if (existingIndex !== -1 && degreeStructuresDatabase[existingIndex].specializations && degreeStructuresDatabase[existingIndex].specializations.length > 0) {
      console.log(`Course ${course.code} is already scraped in cache. Skipping.`);
      continue;
    }

    console.log(`Opening fresh tab for course: ${course.code}`);
    let page = null;
    try {
      // Reconnect/re-launch browser if it crashed or disconnected
      const isConnected = browser && (typeof browser.isConnected === 'function' ? browser.isConnected() : browser.connected);
      if (!isConnected) {
        console.log("Browser disconnected! Re-launching Chrome...");
        browser = await puppeteer.launch({
          executablePath,
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
          ]
        });
      }

      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 805 });

      const structures = await scrapeCourseStructure(page, course.code, course.title);
      if (structures && structures.length > 0) {
        const courseData = {
          courseCode: course.code,
          courseTitle: course.title,
          creditPoints: course.creditPoints,
          aqfLevel: course.aqfLevel,
          approvedMajors: course.approvedMajors,
          specializations: structures
        };

        if (existingIndex !== -1) {
          degreeStructuresDatabase[existingIndex] = courseData;
        } else {
          degreeStructuresDatabase.push(courseData);
        }

        saveDatabase();
        console.log(`Saved checkpoint for ${course.code}`);
      }
    } catch (err) {
      console.error(`Error processing course ${course.code}:`, err.message);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (err) {
          console.warn(`Warning: Failed to close page for ${course.code}: ${err.message}`);
        }
      }
    }
  }

  try {
    await browser.close();
  } catch (err) {
    console.warn('Warning: Failed to close browser cleanly:', err.message);
  }

  // Final database save
  saveDatabase();

  console.log(`\n==================================================`);
  console.log(`Successfully scraped degree structures for ${degreeStructuresDatabase.length} courses.`);
  console.log(`Database saved to ${outputPath}`);
}

main().catch(console.error);
