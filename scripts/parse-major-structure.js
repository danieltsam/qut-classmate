const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../data/BIT_CS_structure.html');
const jsonPath = path.join(__dirname, '../data/BIT_CS_structure.json');

if (!fs.existsSync(htmlPath)) {
  console.error(`Error: File not found at ${htmlPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

const structures = [];

// Find each structure heading
$('h4[id^="structure-"]').each((index, el) => {
  const heading = $(el);
  const structureId = heading.attr('id').replace('structure-', '');
  const title = heading.text().trim();

  const structure = {
    id: structureId,
    title: title,
    semesters: []
  };

  // Find structure contents
  const contents = $(`#structure-contents-${structureId}, #default-structure-contents-${structureId}`);
  if (contents.length > 0) {
    contents.find('.semester-item-content').each((_, semEl) => {
      const semBlock = $(semEl);
      const semId = semBlock.attr('id').split('-').pop();
      
      const headingEl = contents.find(`#semester-${semId}`);
      const semesterName = headingEl.text().trim() || `Semester ${semId}`;

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

fs.writeFileSync(jsonPath, JSON.stringify({
  scrapedAt: new Date().toISOString(),
  structures
}, null, 2), 'utf8');

console.log(`Saved parsed structure details to ${jsonPath}`);
