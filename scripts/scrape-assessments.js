const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dbPath = path.join(__dirname, '../data/qut-degree-structures.json');
const outputPath = path.join(__dirname, '../data/qut-unit-assessments.json');

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Degree structures file not found at ${dbPath}`);
    process.exit(1);
  }

  // Load unique units from degree structures
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const courses = db.data || [];

  const in01 = courses.find(c => c.courseCode === 'IN01');
  const in05 = courses.find(c => c.courseCode === 'IN05');
  const ix22 = courses.find(c => c.courseCode === 'IX22');

  const in01UnitCodes = new Set();
  const allUnitCodes = new Set();

  const collectUnits = (course, set) => {
    if (!course || !course.specializations) return;
    course.specializations.forEach(sp => {
      sp.structures.forEach(st => {
        st.semesters.forEach(sem => {
          sem.units.forEach(u => {
            set.add(u.code);
          });
        });
      });
    });
  };

  collectUnits(in01, in01UnitCodes);
  collectUnits(in05, in01UnitCodes);
  collectUnits(ix22, in01UnitCodes);

  courses.forEach(c => collectUnits(c, allUnitCodes));

  // Prioritize IN01 / IT-related units by placing them first
  const prioritized = Array.from(in01UnitCodes).sort();
  const others = Array.from(allUnitCodes).filter(code => !in01UnitCodes.has(code)).sort();
  const targetUnits = [...prioritized, ...others];

  console.log(`Total units to scrape: ${targetUnits.length} (${prioritized.length} prioritized IT units, ${others.length} others)`);

  // Load existing data if available (incremental scraping)
  let assessmentsDb = {};
  if (fs.existsSync(outputPath)) {
    try {
      const content = fs.readFileSync(outputPath, 'utf8');
      assessmentsDb = JSON.parse(content).data || {};
      console.log(`Loaded ${Object.keys(assessmentsDb).length} existing unit assessments from cache.`);
    } catch (err) {
      console.error('Error reading existing assessments database, starting fresh.');
    }
  }

  // Filter out units that are already scraped and have weight details, or are marked discontinued
  const unitsToProcess = targetUnits.filter(code => {
    const entry = assessmentsDb[code];
    if (!entry) return true;
    if (entry.discontinued || entry.emptyOrNotFound || entry.notFoundOrEmpty) return false;
    
    // Check if it was scraped with the new scraper (contains weight or has items but first has weight)
    if (entry.items && entry.items.length > 0) {
      const hasWeights = entry.items.some(item => item.weight !== undefined && item.weight !== null);
      if (hasWeights) {
        return false; // already has weights, skip!
      }
    }
    
    return true; // no items, or items have no weights
  });
  console.log(`Units left to scrape: ${unitsToProcess.length}`);

  if (unitsToProcess.length === 0) {
    console.log('All units are already scraped with weights!');
    return;
  }

  const CONCURRENCY = 4;
  const workers = [];
  let index = 0;

  const saveDatabase = () => {
    fs.writeFileSync(outputPath, JSON.stringify({
      scrapedAt: new Date().toISOString(),
      unitsCount: Object.keys(assessmentsDb).length,
      data: assessmentsDb
    }, null, 2), 'utf8');
  };

  const scrapeUnitWorker = async (workerId) => {
    let workerBrowser = null;

    const initBrowser = async () => {
      if (workerBrowser) {
        try {
          await workerBrowser.close();
        } catch (e) {}
      }
      workerBrowser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ]
      });
    };

    try {
      await initBrowser();
    } catch (launchErr) {
      console.error(`[Worker ${workerId}] Failed to launch Chrome: ${launchErr.message}`);
      return;
    }

    while (true) {
      // Get next unit code
      let unitCode;
      synchronizedBlock: {
        if (index >= unitsToProcess.length) {
          break;
        }
        unitCode = unitsToProcess[index++];
      }

      console.log(`[Worker ${workerId}] [${index}/${unitsToProcess.length}] Scraping assessments for ${unitCode}...`);
      
      let page = null;
      try {
        // Check browser connection
        const isConnected = workerBrowser && (typeof workerBrowser.isConnected === 'function' ? workerBrowser.isConnected() : workerBrowser.connected);
        if (!isConnected) {
          console.log(`[Worker ${workerId}] Browser disconnected! Re-initializing Chrome...`);
          await initBrowser();
        }

        page = await workerBrowser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        // Enable request interception to block images/CSS/fonts to save CPU/memory
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const type = req.resourceType();
          if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
            req.abort();
          } else {
            req.continue();
          }
        });

        let assessments = [];
        let success = false;
        let offeringsList = [];

        // Primary Strategy: Try QUT Virtual public outline pages (2026 -> 2027 -> 2025)
        const yearsToTry = [2026, 2027, 2025];
        let qutVirtualSuccess = false;
        
        for (const yr of yearsToTry) {
          if (qutVirtualSuccess) break;
          const qvUrl = `https://qutvirtual4.qut.edu.au/web/qut/unit?unitCode=${unitCode}&year=${yr}`;
          try {
            await page.goto(qvUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            const pageText = await page.evaluate(() => document.body.innerText);
            
            if (pageText.includes('Details for this unit are not currently available.')) {
              continue; // try next year
            }
            
            const pageHtml = await page.content();
            const $qv = cheerio.load(pageHtml);
            const parsedOfferings = [];
            
            $qv('h2').each((_, el) => {
              const h2Text = $qv(el).text().trim();
              if (h2Text.includes('Unit Outline:')) {
                const offeringName = h2Text.replace('Unit Outline:', '').trim().replace(/\s+/g, ' ');
                const offeringAssessments = [];
                
                let sib = $qv(el).next();
                while (sib.length > 0) {
                  const sibText = sib.text().trim();
                  if (sib[0].name === 'h2' && sibText.includes('Unit Outline:')) {
                    break;
                  }
                  
                  if (sib[0].name === 'h4' && sibText.includes('Assessment:')) {
                    const taskName = sibText.replace('Assessment:', '').trim();
                    
                    let weight = '';
                    let individualGroup = '';
                    let dueDate = '';
                    const descParts = [];
                    
                    let detailSib = sib.next();
                    // Stop at next assessment (H4) or next outline section headers (H2, H3)
                    while (detailSib.length > 0 && detailSib[0].name !== 'h4') {
                      const detailText = detailSib.text().trim();
                      if (detailSib[0].name === 'h2' || detailSib[0].name === 'h3') {
                        break;
                      }
                      
                      if (detailSib[0].name === 'p') {
                        if (detailText) descParts.push(detailText);
                      } else if (detailSib[0].name === 'div') {
                        const cleanText = detailText.replace(/\s+/g, ' ').trim();
                        if (cleanText.toLowerCase().startsWith('weight:')) {
                          weight = cleanText.replace(/weight:/i, '').trim();
                        } else if (cleanText.toLowerCase().startsWith('individual/group:')) {
                          individualGroup = cleanText.replace(/individual\/group:/i, '').trim();
                        }
                      } else if (detailSib[0].name === 'strong' && detailText.toLowerCase().startsWith('due (indicative):')) {
                        const nextNode = detailSib[0].nextSibling;
                        if (nextNode) {
                          if (nextNode.type === 'text') {
                            dueDate = nextNode.data.trim();
                          } else if (nextNode.nodeType === 3) {
                            dueDate = nextNode.nodeValue.trim();
                          }
                        }
                      }
                      detailSib = detailSib.next();
                    }
                    
                    offeringAssessments.push({
                      name: taskName,
                      description: descParts.join(' '),
                      weight: weight ? parseInt(weight, 10) : null,
                      individualGroup,
                      dueDate
                    });
                  }
                  sib = sib.next();
                }
                
                if (offeringAssessments.length > 0) {
                  parsedOfferings.push({
                    name: offeringName,
                    items: offeringAssessments
                  });
                }
              }
            });
            
            if (parsedOfferings.length > 0) {
              offeringsList = parsedOfferings;
              // Choose assessments from the first offering (e.g. S1 or S2 gp internal)
              assessments = parsedOfferings[0].items;
              success = true;
              qutVirtualSuccess = true;
              console.log(`  -> Success via QUT Virtual (${yr}): ${unitCode} has ${assessments.length} assessment tasks (Weightings parsed)`);
            }
          } catch (qvErr) {
            console.warn(`  -> QUT Virtual (${yr}) outline failed for ${unitCode}: ${qvErr.message}`);
          }
        }

        // Fallback: Try CourseLoop offerings JSON API if QUT Virtual returned nothing
        if (!success) {
          const apiUrl = `https://www.qut.edu.au/study/unit/unit-sorcery/courseloop-subject-offerings?unitCode=${unitCode}&years=2026,2025,2027`;
          try {
            await page.goto(apiUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            const apiText = await page.evaluate(() => document.body.innerText);
            if (apiText && apiText.trim().startsWith('[')) {
              const outlines = JSON.parse(apiText);
              const validOffering = outlines.find(o => o.assesment_tasks && o.assesment_tasks.length > 0);
              if (validOffering) {
                assessments = validOffering.assesment_tasks.map(task => ({
                  name: task.name ? task.name.trim() : `Assessment ${task.number}`,
                  description: task.description ? task.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '',
                  weight: null,
                  individualGroup: '',
                  dueDate: ''
                }));
                success = true;
                console.log(`  -> Success via Fallback CourseLoop API: ${unitCode} has ${assessments.length} assessment tasks`);
              }
            }
          } catch (apiErr) {
            console.warn(`  -> Fallback CourseLoop API failed for ${unitCode}: ${apiErr.message}`);
          }
        }

        // Fallback 2: Try public handbook outline page scrape
        if (!success) {
          const pageUrl = `https://www.qut.edu.au/study/unit?unitCode=${unitCode}`;
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          const html = await page.content();
          const $ = cheerio.load(html);
          
          const title = $('title').text().trim().toLowerCase();
          const pageTitleH1 = $('h1').text().trim().toLowerCase();
          
          if (title.includes('page not found') || pageTitleH1.includes('page not found') || title.includes('oops. something broke')) {
            console.log(`  -> Discontinued: ${unitCode} page returns Not Found`);
            assessmentsDb[unitCode] = {
              hasExam: false,
              assessmentCount: 0,
              items: [],
              discontinued: true
            };
            success = true;
          } else {
            let found = false;
            $('h4').each((_, el) => {
              if (found) return;
              const h4 = $(el);
              if (h4.text().trim().toLowerCase() === 'assessment') {
                found = true;
                let nextEl = h4.next();
                while (nextEl.length > 0 && nextEl[0].name !== 'h4' && nextEl[0].name !== 'h3') {
                  if (nextEl[0].name === 'h5') {
                    const name = nextEl.text().trim();
                    let description = '';
                    
                    let detailEl = nextEl.next();
                    const descParts = [];
                    while (detailEl.length > 0 && detailEl[0].name !== 'h5' && detailEl[0].name !== 'h4' && detailEl[0].name !== 'h3') {
                      if (detailEl[0].name === 'p') {
                        const text = detailEl.text().trim();
                        if (text) descParts.push(text);
                      }
                      detailEl = detailEl.next();
                    }
                    description = descParts.join(' ');
                    assessments.push({
                      name,
                      description,
                      weight: null,
                      individualGroup: '',
                      dueDate: ''
                    });
                  }
                  nextEl = nextEl.next();
                }
              }
            });

            if (assessments.length > 0) {
              success = true;
              console.log(`  -> Success via Fallback HTML Scrape: ${unitCode} has ${assessments.length} assessment tasks`);
            }
          }
        }

        if (success && assessments.length > 0) {
          const hasExam = assessments.some(item => 
            item.name.toLowerCase().includes('exam') || 
            item.name.toLowerCase().includes('examination') ||
            item.description.toLowerCase().includes('invigilated exam') ||
            item.description.toLowerCase().includes('final exam')
          );

          assessmentsDb[unitCode] = {
            hasExam,
            assessmentCount: assessments.length,
            items: assessments,
            offerings: offeringsList.length > 0 ? offeringsList : undefined
          };
        } else if (!assessmentsDb[unitCode]) {
          assessmentsDb[unitCode] = {
            hasExam: false,
            assessmentCount: 0,
            items: [],
            emptyOrNotFound: true
          };
          console.log(`  -> No assessments found for ${unitCode}`);
        }

      } catch (err) {
        console.error(`  -> Failed to scrape ${unitCode}: ${err.message}`);
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (err) {}
        }
      }

      // Save database periodically
      if (index % 10 === 0) {
        saveDatabase();
      }

      await sleep(150);
    }

    if (workerBrowser) {
      try {
        await workerBrowser.close();
      } catch (e) {}
    }
  };

  // Launch workers
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(scrapeUnitWorker(i + 1));
  }

  try {
    await Promise.all(workers);
  } catch (err) {
    console.error("Error running workers:", err.message);
  }

  // Final save
  saveDatabase();
  console.log(`\nScraping complete! Assessment data saved to ${outputPath}`);
}

main().catch(console.error);
