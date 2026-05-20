/**
 * Stage 2b/2c (minimal): inject I18N, langPrefixOf, formatDateKo into index.js
 * and extend module.exports so generate-ai-blog.js's require succeeds.
 *
 * Body-level label substitution + langPrefix on hrefs are deferred to a follow-up
 * patch — current pass only restores the symbols required by Stage 2d/2e.
 *
 * Idempotent. CRLF preserved.
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(__dirname, '..', 'src', 'templates', 'ai-blog', 'index.js');
let src = fs.readFileSync(TARGET, 'utf8');
const original = src;
const NL = src.includes('\r\n') ? '\r\n' : '\n';

let failures = 0;
function tryPatch(label, before, after) {
  if (src.includes(after) && !src.includes(before)) { console.log(`skipped: ${label}`); return; }
  if (src.includes(before)) { src = src.replace(before, after); console.log(`patched: ${label}`); }
  else { console.error(`FAIL: ${label}`); failures++; }
}

// ---- 1. Insert I18N + langPrefixOf right after SITE_CONFIG (and before generateHeader) ----
const i18nAnchor = '};' + NL + NL + '// AIScroll 헤더 (로고 + 검색창 - PC용)';
const i18nBlock =
  '};' + NL + NL +
  '// i18n labels' + NL +
  'const I18N = {' + NL +
  '  en: {' + NL +
  '    popular: \'Popular\', latest: \'Latest\', search: \'Search\',' + NL +
  '    searchPlaceholder: \'Search articles...\',' + NL +
  '    privacy: \'Privacy Policy\', categories: \'Categories\',' + NL +
  '    readMore: \'Read more\', publishedAt: \'Published\',' + NL +
  '    noResults: \'No results\', sources: \'Sources\', related: \'Related Articles\',' + NL +
  '    copyright: \'© 2026 AIScroll. All rights reserved.\',' + NL +
  '    categoryLabels: { general: \'General\', openai: \'OpenAI\', google: \'Google\', anthropic: \'Anthropic\', vibecoding: \'Coding\' }' + NL +
  '  },' + NL +
  '  ko: {' + NL +
  '    popular: \'인기\', latest: \'최신\', search: \'검색\',' + NL +
  '    searchPlaceholder: \'기사 검색...\',' + NL +
  '    privacy: \'개인정보처리방침\', categories: \'카테고리\',' + NL +
  '    readMore: \'더 보기\', publishedAt: \'게시일\',' + NL +
  '    noResults: \'검색 결과 없음\', sources: \'출처\', related: \'관련 기사\',' + NL +
  '    copyright: \'© 2026 AIScroll. 모든 권리 보유.\',' + NL +
  '    categoryLabels: { general: \'일반\', openai: \'OpenAI\', google: \'Google\', anthropic: \'Anthropic\', vibecoding: \'바이브코딩\' }' + NL +
  '  }' + NL +
  '};' + NL + NL +
  'function langPrefixOf(lang) { return lang === \'ko\' ? \'/ko\' : \'\'; }' + NL + NL +
  '// AIScroll 헤더 (로고 + 검색창 - PC용)';
tryPatch('I18N + langPrefixOf insertion', i18nAnchor, i18nBlock);

// ---- 2. Insert formatDateKo right after formatDateEn ----
// formatDateEn is at L269. Read original to find the closing line.
// We anchor on the function-end pattern.
const formatDateEnAnchor = 'function formatDateEn(dateStr) {';
if (src.includes(formatDateEnAnchor) && !src.includes('function formatDateKo')) {
  // Find end of formatDateEn function by tracking braces from anchor.
  const start = src.indexOf(formatDateEnAnchor);
  let i = src.indexOf('{', start);
  let depth = 1;
  i++;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  // i is now right after the closing brace of formatDateEn
  const insertion = NL + NL +
    'function formatDateKo(dateStr) {' + NL +
    '  if (!dateStr) return \'\';' + NL +
    '  const d = new Date(dateStr);' + NL +
    '  if (isNaN(d.getTime())) return \'\';' + NL +
    '  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;' + NL +
    '}';
  src = src.slice(0, i) + insertion + src.slice(i);
  console.log('patched: formatDateKo inserted after formatDateEn');
} else if (src.includes('function formatDateKo')) {
  console.log('skipped: formatDateKo (already)');
} else {
  console.error('FAIL: formatDateEn anchor not found');
  failures++;
}

// ---- 3. Extend module.exports ----
tryPatch('module.exports extension',
  'module.exports = {' + NL +
  '  generateAIBlogIndex,' + NL +
  '  generateSearchPage,' + NL +
  '  generateCategoryPage,' + NL +
  '  wrapWithLayout,' + NL +
  '  setGlobalSidebarCounts,' + NL +
  '  setGlobalSidebarArticles,' + NL +
  '  SITE_CONFIG,' + NL +
  '  formatDateEn,' + NL +
  '  escapeHtml,' + NL +
  '  getThumbUrl' + NL +
  '};',
  'module.exports = {' + NL +
  '  generateAIBlogIndex,' + NL +
  '  generateSearchPage,' + NL +
  '  generateCategoryPage,' + NL +
  '  wrapWithLayout,' + NL +
  '  setGlobalSidebarCounts,' + NL +
  '  setGlobalSidebarArticles,' + NL +
  '  SITE_CONFIG,' + NL +
  '  formatDateEn,' + NL +
  '  formatDateKo,' + NL +
  '  I18N,' + NL +
  '  langPrefixOf,' + NL +
  '  escapeHtml,' + NL +
  '  getThumbUrl' + NL +
  '};'
);

if (failures > 0) { console.error(`${failures} failed`); process.exit(1); }
if (src !== original) { fs.writeFileSync(TARGET, src, 'utf8'); console.log('saved'); }
else { console.log('no changes'); }
