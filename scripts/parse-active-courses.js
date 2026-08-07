const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const htmlPath = path.join(__dirname, '../data/active-courses.html');
const jsonPath = path.join(__dirname, '../data/qut-active-courses.json');

if (!fs.existsSync(htmlPath)) {
  console.error(`Error: HTML file not found at ${htmlPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

const courses = [];

$('table.table-handbook-courses').each((index, element) => {
  const table = $(element);
  const prevH3 = table.prevAll('h3').first();
  const titleText = prevH3.text().trim();
  
  // Title text is usually like "IN01 Bachelor of Information Technology"
  // Let's parse code and title
  const codeMatch = titleText.match(/^([A-Z0-9]{4})\s+(.+)$/);
  let parsedCode = '';
  let parsedTitle = titleText;
  if (codeMatch) {
    parsedCode = codeMatch[1];
    parsedTitle = codeMatch[2];
  }

  const course = {
    code: parsedCode,
    title: parsedTitle,
    creditPoints: null,
    aqfLevel: '',
    awardLevel: '',
    cricosStatus: '',
    accreditationPeriod: '',
    awardTitle: '',
    abbreviation: '',
    approvedMajors: []
  };

  table.find('tr').each((_, row) => {
    const th = $(row).find('th').text().trim().toLowerCase();
    const td = $(row).find('td');

    if (th.includes('course code')) {
      course.code = td.text().trim() || course.code;
    } else if (th.includes('credit points')) {
      const pts = parseInt(td.text().trim(), 10);
      course.creditPoints = isNaN(pts) ? null : pts;
    } else if (th.includes('aqf level')) {
      course.aqfLevel = td.text().trim();
    } else if (th.includes('award level')) {
      course.awardLevel = td.text().trim();
    } else if (th.includes('cricos status')) {
      course.cricosStatus = td.text().trim();
    } else if (th.includes('accreditation period')) {
      course.accreditationPeriod = td.text().trim().replace(/\s+/g, ' ');
    } else if (th.includes('award title')) {
      course.awardTitle = td.text().trim();
    } else if (th.includes('abbreviation')) {
      course.abbreviation = td.text().trim();
    } else if (th.includes('approved majors')) {
      const majors = [];
      td.find('li').each((_, li) => {
        majors.push($(li).text().trim());
      });
      course.approvedMajors = majors;
    }
  });

  courses.push(course);
});

fs.writeFileSync(jsonPath, JSON.stringify({
  scrapedAt: new Date().toISOString(),
  count: courses.length,
  courses: courses
}, null, 2), 'utf8');

console.log(`Successfully parsed ${courses.length} courses and saved to ${jsonPath}`);
