const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = 'https://www.qut.edu.au/courses/bachelor-of-information-technology-computer-science';

async function main() {
  console.log("Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36');

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  console.log("Clicking the details and units tab button...");
  await page.evaluate(() => {
    const btn = document.querySelector('#details-and-units-button') || document.querySelector('button[aria-controls="details-and-units-tab"]');
    if (btn) {
      btn.click();
    } else {
      const heading = document.querySelector('#details-and-units-tab .content-title');
      if (heading) heading.click();
    }
  });

  console.log("Waiting for structures content to load...");
  try {
    await page.waitForFunction(() => {
      const container = document.querySelector('#structures-content');
      // Wait for it to contain text or elements (excluding just spinners)
      return container && container.innerHTML.trim().length > 0 && !container.innerHTML.includes('spin.js');
    }, { timeout: 15000 });
    console.log("Structures content loaded successfully!");
  } catch (err) {
    console.warn("Timeout waiting for structures content. Fetching whatever is present.");
  }

  const data = await page.evaluate(() => {
    const container = document.querySelector('#structures-content');
    return container ? container.innerHTML : 'Not found';
  });

  console.log("Content length:", data.length);
  
  const outputPath = path.join(__dirname, '../data/BIT_CS_structure.html');
  fs.writeFileSync(outputPath, data, 'utf8');
  console.log(`Saved structures HTML to ${outputPath}`);

  await browser.close();
}

main().catch(console.error);
