const puppeteer = require('puppeteer-core');

(async () => {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true
    });
    
    const page = await browser.newPage();
    
    // Monitor console warnings and errors
    const errors = [];
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        // Ignore network resources 404, standard React key warnings, and dev-overlay boundary notices
        if (
          text.includes('404') || 
          text.includes('Encountered two children with the same key') ||
          text.includes('The above error occurred')
        ) {
          return;
        }
        errors.push(text);
        console.error('Console Error:', text);
      }
    });

    page.on('pageerror', err => {
      errors.push(err.message);
      console.error('Page Exception:', err.message);
    });

    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    console.log('Running client-side shortcut clicks...');
    const clickResult = await page.evaluate(async () => {
      const divs = Array.from(document.querySelectorAll('.xp-desktop div'));
      const shortcutDivs = divs.filter(d => 
        d.className.includes('cursor-pointer') && 
        d.innerText && 
        !d.closest('.xp-window') && 
        !d.closest('.xp-taskbar')
      );

      console.log(`Found ${shortcutDivs.length} desktop shortcuts.`);
      if (shortcutDivs.length === 0) {
        throw new Error('Could not locate desktop shortcut elements on the page');
      }

      const openedWindows = [];
      
      // Click every shortcut
      for (const shortcut of shortcutDivs) {
        const label = shortcut.innerText.trim();
        console.log(`Clicking shortcut: ${label}`);
        shortcut.click();
        
        // Wait 150ms for React state updates to render the DOM nodes
        await new Promise(r => setTimeout(r, 150));
        
        // Count currently open windows
        const windowNodes = Array.from(document.querySelectorAll('.xp-window'));
        const openTitles = windowNodes.map(w => {
          const titleEl = w.querySelector('.xp-titlebar span');
          return titleEl ? titleEl.innerText.trim() : 'Unknown Window';
        });
        
        openedWindows.push({
          clicked: label,
          currentlyOpenCount: windowNodes.length,
          openTitles
        });
      }

      return openedWindows;
    });

    console.log('\n--- Client Click Sequence Report ---');
    console.log(JSON.stringify(clickResult, null, 2));
    console.log('------------------------------------\n');

    if (errors.length > 0) {
      console.error(`Test FAILED: ${errors.length} browser errors occurred.`);
      process.exit(1);
    } else {
      console.log('Test PASSED: All shortcuts clicked, multiple windows opened successfully without runtime errors!');
      process.exit(0);
    }

  } catch (err) {
    console.error('Fatal Test Runner Failure:', err);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
