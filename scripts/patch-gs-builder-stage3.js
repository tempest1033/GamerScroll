/**
 * Stage 3: GamerScroll builder — remove tech category, filter site:aiscroll from issue reports.
 *
 * Patches (idempotent, CRLF preserved):
 *   1. loadTechData() → return {} (모든 호출자 자동 빈 데이터)
 *   2. techCategories = [] (tech 카테고리 루프 자동 skip)
 *   3. tech hub page try block guard
 *   4. sitemap에서 tech URL 4줄 제거
 *   5. issueReportsForHome 로드에 site !== 'aiscroll' 필터
 *   6. issueReports 로드에 site !== 'aiscroll' 필터
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(__dirname, '..', 'generate-html-report.js');
let src = fs.readFileSync(TARGET, 'utf8');
const original = src;
const NL = src.includes('\r\n') ? '\r\n' : '\n';

let failures = 0;
function tryReplace(label, before, after) {
  if (src.includes(after) && !src.includes(before)) { console.log(`skipped: ${label} (already)`); return; }
  if (src.includes(before)) { src = src.replace(before, after); console.log(`patched: ${label}`); }
  else { console.error(`FAIL: ${label} anchor not found`); failures++; }
}

function replaceBlock(label, startMarker, endMarker, newBody, alreadyMarker) {
  if (alreadyMarker && src.includes(alreadyMarker)) { console.log(`skipped: ${label} (already)`); return; }
  const s = src.indexOf(startMarker);
  if (s < 0) { console.error(`FAIL: ${label} start marker not found`); failures++; return; }
  const e = src.indexOf(endMarker, s + startMarker.length);
  if (e < 0) { console.error(`FAIL: ${label} end marker not found`); failures++; return; }
  src = src.slice(0, s) + newBody + src.slice(e);
  console.log(`patched: ${label} (${e - s} → ${newBody.length} bytes)`);
}

// ---- 1. loadTechData() 본문 비활성화 ----
const loadTechStart = '// 테크 데이터 로드 함수' + NL + "const TECH_DIR = './data/tech';" + NL + 'function loadTechData() {';
const loadTechEnd = '  return techData;' + NL + '}';
const newLoadTech = [
  '// 테크 데이터 로드 함수 (Stage 3: GamerScroll에서 tech 제거)',
  "const TECH_DIR = './data/tech';",
  'function loadTechData() {',
  '  // Disabled in Stage 3 — tech 콘텐츠는 AIScroll로 이관됨.',
  '  return { normal: [], ai: [], vibecoding: [] };'
].join(NL);

replaceBlock('loadTechData body',
  loadTechStart,
  loadTechEnd,
  newLoadTech,
  '// Disabled in Stage 3 — tech'
);

// ---- 2. techCategories = [] (L1902 영역) ----
tryReplace('techCategories array',
  "  const techCategories = ['normal', 'ai', 'vibecoding'];",
  "  const techCategories = []; // Stage 3: tech 카테고리 제거"
);

// ---- 3. tech hub page try block guard ----
tryReplace('tech hub guard',
  "  // tech/index.html 생성" + NL + "  try {",
  "  // tech/index.html 생성 (Stage 3: techCategories 비어있으면 skip)" + NL + "  if (techCategories.length > 0) try {"
);

// ---- 4. sitemap tech URL 4줄 제거 ----
const sitemapTechBlock = [
  '    // 테크 (허브 + 카테고리)',
  '    { loc: `${siteBaseUrl}/tech/`, lastmod: sitemapDate, priority: \'0.8\' },',
  '    { loc: `${siteBaseUrl}/tech/normal/`, lastmod: sitemapDate, priority: \'0.8\' },',
  '    { loc: `${siteBaseUrl}/tech/ai/`, lastmod: sitemapDate, priority: \'0.8\' },',
  '    { loc: `${siteBaseUrl}/tech/vibecoding/`, lastmod: sitemapDate, priority: \'0.8\' }'
].join(NL);
const sitemapTechReplacement = '    // 테크 카테고리는 AIScroll로 이관됨 (Stage 3)';
tryReplace('sitemap tech urls', sitemapTechBlock, sitemapTechReplacement);

// ---- 5. issueReportsForHome filter (L984) ----
tryReplace('issueReportsForHome site filter',
  "      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))" + NL + "      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));" + NL + "  }" + NL + NL + "  // 인사이트 리포트 데이터 로드 (홈페이지용",
  "      .filter(p => p && p.site !== 'aiscroll' && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))" + NL + "      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));" + NL + "  }" + NL + NL + "  // 인사이트 리포트 데이터 로드 (홈페이지용"
);

// ---- 6. issueReports filter (L1298) ----
tryReplace('issueReports site filter',
  "      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))" + NL + "      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));" + NL + "  }" + NL + NL + "  // 인사이트 리포트 데이터 로드 (허브",
  "      .filter(p => p && p.site !== 'aiscroll' && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))" + NL + "      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));" + NL + "  }" + NL + NL + "  // 인사이트 리포트 데이터 로드 (허브"
);

if (failures > 0) {
  console.error(`${failures} patch(es) failed — not saving`);
  process.exit(1);
}

if (src !== original) {
  fs.writeFileSync(TARGET, src, 'utf8');
  console.log('saved');
} else {
  console.log('no changes');
}
