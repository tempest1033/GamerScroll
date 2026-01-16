/**
 * Fill AI thumbnails in daily report JSON without regenerating AI/HTML.
 * Usage: node scripts/fill-daily-thumbnails.js [--date=YYYY-MM-DD]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getTodayDate, getYesterdayDate } = require('../src/insights/daily');
const { fillInsightThumbnails, collectNewsItemsFromNewsData, collectHistoryNewsItems } = require('../src/insights/thumbnail-fill');

function getPrevDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const hasBom = raw.charCodeAt(0) === 0xfeff;
  const cleaned = hasBom ? raw.slice(1) : raw;
  return { data: JSON.parse(cleaned), hasBom };
}

function writeJsonFile(filePath, data, hasBom) {
  const json = JSON.stringify(data, null, 2);
  const content = hasBom ? `\ufeff${json}` : json;
  fs.writeFileSync(filePath, content, 'utf8');
}

async function processFile(label, filePath, targetDate, prevDate) {
  if (!fs.existsSync(filePath)) {
    console.log(`- ${label}: 없음 (${filePath})`);
    return null;
  }

  let parsed;
  try {
    parsed = readJsonFile(filePath);
  } catch (e) {
    console.log(`- ${label}: JSON 파싱 실패 (${e.message})`);
    return null;
  }

  const { data, hasBom } = parsed;
  if (!data.ai) {
    console.log(`- ${label}: ai 없음 (스킵)`);
    return null;
  }

  const reportNewsItems = collectNewsItemsFromNewsData(data.news, `report:${label}`);
  const historyNewsItems = collectHistoryNewsItems([targetDate, prevDate]);

  const summary = await fillInsightThumbnails(data.ai, {
    newsItems: [...reportNewsItems, ...historyNewsItems],
    dateRange: { start: targetDate, end: targetDate }
  });

  writeJsonFile(filePath, data, hasBom);
  console.log(`- ${label}: 갱신 ${summary.updated} / 유지 ${summary.kept} / 실패 ${summary.failed}`);
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const dateArg = args.find(arg => arg.startsWith('--date='));
  const targetDate = dateArg ? dateArg.split('=')[1] : getTodayDate();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error(`잘못된 날짜 형식: ${targetDate}`);
    process.exit(1);
  }

  const prevDate = dateArg ? getPrevDate(targetDate) : getYesterdayDate();

  console.log(`🖼️ 일간 AI 썸네일 보강 시작: ${targetDate}`);

  const baseDir = path.resolve(__dirname, '..');
  const targets = [
    { label: 'reports', path: path.join(baseDir, 'reports', `${targetDate}.json`) },
    { label: 'docs/reports', path: path.join(baseDir, 'docs', 'reports', `${targetDate}.json`) },
    { label: 'docs-mobile/reports', path: path.join(baseDir, 'docs-mobile', 'reports', `${targetDate}.json`) }
  ];

  for (const target of targets) {
    await processFile(target.label, target.path, targetDate, prevDate);
  }

  console.log('✅ 완료');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
