const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://gamerscroll.com';
const SITE_TITLE = '게이머스크롤';
const SITE_DESC = '게임 업계 데이터 크롤링 및 일일/주간 리포트';
const MAX_ITEMS = 30;

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRFC822(dateStr) {
  const date = new Date(dateStr);
  return date.toUTCString();
}

function readJsonFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function getIssueReports(reportsDir) {
  const issueDir = path.join(reportsDir, 'issue');
  if (!fs.existsSync(issueDir)) return [];

  const items = [];
  const files = fs.readdirSync(issueDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = readJsonFile(path.join(issueDir, file));
    if (!data || data.status !== 'approved') continue;

    items.push({
      type: 'issue',
      title: data.title,
      link: `${SITE_URL}/magazine/issue/${data.slug}/`,
      description: data.summary || '',
      date: new Date(data.date),
      thumbnail: data.thumbnail || '',
      category: '이슈'
    });
  }

  return items;
}

function getWeeklyReports(reportsDir) {
  const weeklyDir = path.join(reportsDir, 'weekly');
  if (!fs.existsSync(weeklyDir)) return [];

  const items = [];
  const files = fs.readdirSync(weeklyDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = readJsonFile(path.join(weeklyDir, file));
    if (!data || !data.ai) continue;

    const weekId = file.replace('.json', '');
    const weekNum = data.weekInfo?.weekNumber || data.ai?.weekNumber;

    items.push({
      type: 'weekly',
      title: `[주간] ${data.ai.date || weekId} 게임 업계 동향`,
      link: `${SITE_URL}/magazine/weekly/${weekId}/`,
      description: data.ai.summary || data.ai.headline || '',
      date: new Date(data.generatedAt || data.weekInfo?.endDate),
      thumbnail: data.ai.thumbnail || '',
      category: '주간 리포트'
    });
  }

  return items;
}

function getDailyReports(reportsDir) {
  const items = [];
  const files = fs.readdirSync(reportsDir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));

  for (const file of files) {
    const data = readJsonFile(path.join(reportsDir, file));
    if (!data || !data.ai) continue; // AI 인사이트가 있는 것만

    const dateStr = file.replace('.json', '');

    items.push({
      type: 'daily',
      title: `[일간] ${dateStr} 게임 업계 인사이트`,
      link: `${SITE_URL}/magazine/daily/${dateStr}/`,
      description: data.ai.headline || (data.summary ? data.summary.slice(0, 3).join(' / ') : ''),
      date: new Date(data.generatedAt || dateStr),
      thumbnail: data.ai.thumbnail || '',
      category: '일간 리포트'
    });
  }

  return items;
}

function generateRSS(reportsDir, outputPath) {
  console.log('=== RSS 피드 생성 시작 ===\n');

  // 모든 리포트 수집
  const issueItems = getIssueReports(reportsDir);
  const weeklyItems = getWeeklyReports(reportsDir);
  const dailyItems = getDailyReports(reportsDir);

  console.log(`이슈 리포트: ${issueItems.length}개`);
  console.log(`주간 리포트: ${weeklyItems.length}개`);
  console.log(`일간 리포트: ${dailyItems.length}개`);

  // 합치고 날짜순 정렬
  const allItems = [...issueItems, ...weeklyItems, ...dailyItems]
    .sort((a, b) => b.date - a.date)
    .slice(0, MAX_ITEMS);

  console.log(`\n총 ${allItems.length}개 항목 (최신 ${MAX_ITEMS}개 제한)\n`);

  // RSS XML 생성
  const lastBuildDate = new Date().toUTCString();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESC)}</description>
    <language>ko</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
`;

  for (const item of allItems) {
    xml += `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${toRFC822(item.date)}</pubDate>
      <guid isPermaLink="true">${item.link}</guid>
      <category>${escapeXml(item.category)}</category>
    </item>`;
  }

  xml += `
  </channel>
</rss>`;

  // 저장
  fs.writeFileSync(outputPath, xml, 'utf8');
  console.log(`✅ RSS 저장 완료: ${outputPath}`);

  return allItems.length;
}

// 직접 실행 시
if (require.main === module) {
  const reportsDir = path.join(__dirname, '../../reports');
  const outputPath = path.join(__dirname, '../../docs/rss.xml');

  generateRSS(reportsDir, outputPath);
}

module.exports = { generateRSS };
