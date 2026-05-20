/**
 * KO localization fix: inject lang param + I18N labels into header/footer/nav/sidebar.
 *
 * Affected functions in src/templates/ai-blog/index.js:
 *   - generateHeader, generateSearchContainer, generateFooter
 *   - generateDefaultSidebarContent, generateMobileSidePanel
 *   - AI_NAV_ITEMS (category labels) — wrap into a function navItemsFor(lang)
 *   - wrapWithLayout call sites of all the above — pass lang
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
function tryReplace(label, before, after) {
  if (src.includes(after) && !src.includes(before)) { console.log(`skipped: ${label}`); return; }
  if (src.includes(before)) { src = src.replace(before, after); console.log(`patched: ${label}`); }
  else { console.error(`FAIL: ${label}`); failures++; }
}

// 1. Extend I18N with menu + searchAria labels.
tryReplace(
  'I18N en menu/searchAria',
  "categoryLabels: { general: 'General', openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic', vibecoding: 'Coding' }\r\n  },\r\n  ko:",
  "categoryLabels: { general: 'General', openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic', vibecoding: 'Coding' },\r\n    menu: 'Menu', vibeCoding: 'Vibe Coding'\r\n  },\r\n  ko:"
);
tryReplace(
  'I18N ko menu/searchAria',
  "categoryLabels: { general: '일반', openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic', vibecoding: '바이브코딩' }\r\n  }\r\n};",
  "categoryLabels: { general: '일반', openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic', vibecoding: '바이브코딩' },\r\n    menu: '메뉴', vibeCoding: '바이브코딩'\r\n  }\r\n};"
);

// 2. generateHeader — accept lang, use I18N.
tryReplace(
  'generateHeader signature',
  "function generateHeader() {\r\n  return `\r\n  <header id=\"aiscroll-header\"",
  "function generateHeader(lang = 'en') {\r\n  const _t = I18N[lang] || I18N.en;\r\n  return `\r\n  <header id=\"aiscroll-header\""
);
tryReplace(
  'header search placeholder/aria',
  "<input type=\"text\" class=\"search-input\" placeholder=\"Search articles...\" autocomplete=\"off\">\r\n          <button class=\"search-btn\" type=\"button\" aria-label=\"Search\">",
  "<input type=\"text\" class=\"search-input\" placeholder=\"${_t.searchPlaceholder}\" autocomplete=\"off\">\r\n          <button class=\"search-btn\" type=\"button\" aria-label=\"${_t.search}\">"
);

// 3. generateSearchContainer — accept lang.
tryReplace(
  'generateSearchContainer signature',
  "function generateSearchContainer() {\r\n  return `\r\n  <div class=\"search-container\">",
  "function generateSearchContainer(lang = 'en') {\r\n  const _t = I18N[lang] || I18N.en;\r\n  return `\r\n  <div class=\"search-container\">"
);
tryReplace(
  'searchContainer placeholder/aria',
  "<input type=\"text\" class=\"search-input\" placeholder=\"Search articles...\" autocomplete=\"off\">\r\n      <button class=\"search-btn\" type=\"button\" aria-label=\"Search\">",
  "<input type=\"text\" class=\"search-input\" placeholder=\"${_t.searchPlaceholder}\" autocomplete=\"off\">\r\n      <button class=\"search-btn\" type=\"button\" aria-label=\"${_t.search}\">"
);

// 4. generateFooter — accept lang.
tryReplace(
  'generateFooter signature + body',
  "function generateFooter() {\r\n  const year = new Date().getFullYear();\r\n  return `\r\n  <footer class=\"site-footer\">\r\n    <span>© ${year} AIScroll</span>\r\n    <span class=\"footer-divider\">|</span>\r\n    <a href=\"/privacy/\" class=\"footer-privacy-link\">Privacy Policy</a>\r\n  </footer>`;\r\n}",
  "function generateFooter(lang = 'en') {\r\n  const _t = I18N[lang] || I18N.en;\r\n  const _p = lang === 'ko' ? '/ko' : '';\r\n  const year = new Date().getFullYear();\r\n  return `\r\n  <footer class=\"site-footer\">\r\n    <span>© ${year} AIScroll</span>\r\n    <span class=\"footer-divider\">|</span>\r\n    <a href=\"${_p}/privacy/\" class=\"footer-privacy-link\">${_t.privacy}</a>\r\n  </footer>`;\r\n}"
);

// 5. generateDefaultSidebarContent — accept lang.
tryReplace(
  'generateDefaultSidebarContent signature',
  "function generateDefaultSidebarContent(counts = {}) {\r\n  const c = (key)",
  "function generateDefaultSidebarContent(counts = {}, lang = 'en') {\r\n  const _t = I18N[lang] || I18N.en;\r\n  const _p = lang === 'ko' ? '/ko' : '';\r\n  const _cat = _t.categoryLabels;\r\n  const c = (key)"
);
tryReplace(
  'sidebar article href lang',
  "<a href=\"/article/${item.category || 'general'}/${item.slug}/\" class=\"sidebar-article-item\">\r\n      <span class=\"sidebar-article-rank\">",
  "<a href=\"${_p}/article/${item.category || 'general'}/${item.slug}/\" class=\"sidebar-article-item\">\r\n      <span class=\"sidebar-article-rank\">"
);
tryReplace(
  'sidebar Categories block',
  "<div class=\"home-card-header\"><span class=\"home-card-title-link\"><h2 class=\"home-card-title\">Categories</h2></span></div>\r\n        <div class=\"sidebar-category-list\">\r\n          <a href=\"/article/general/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">General${c('general')}</span></a>\r\n          <a href=\"/article/openai/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">OpenAI${c('openai')}</span></a>\r\n          <a href=\"/article/google/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">Google${c('google')}</span></a>\r\n          <a href=\"/article/anthropic/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">Anthropic${c('anthropic')}</span></a>\r\n          <a href=\"/article/vibecoding/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">Vibe Coding${c('vibecoding')}</span></a>",
  "<div class=\"home-card-header\"><span class=\"home-card-title-link\"><h2 class=\"home-card-title\">${_t.categories}</h2></span></div>\r\n        <div class=\"sidebar-category-list\">\r\n          <a href=\"${_p}/article/general/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">${_cat.general}${c('general')}</span></a>\r\n          <a href=\"${_p}/article/openai/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">${_cat.openai}${c('openai')}</span></a>\r\n          <a href=\"${_p}/article/google/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">${_cat.google}${c('google')}</span></a>\r\n          <a href=\"${_p}/article/anthropic/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">${_cat.anthropic}${c('anthropic')}</span></a>\r\n          <a href=\"${_p}/article/vibecoding/\" class=\"sidebar-category-item\"><span class=\"sidebar-category-name\">${_t.vibeCoding || _cat.vibecoding}${c('vibecoding')}</span></a>"
);
tryReplace(
  'sidebar Popular/Latest tabs',
  "<button class=\"tab-btn small active\" data-sidebar-tab=\"popular\">Popular</button>\r\n          <button class=\"tab-btn small\" data-sidebar-tab=\"latest\">Latest</button>",
  "<button class=\"tab-btn small active\" data-sidebar-tab=\"popular\">${_t.popular}</button>\r\n          <button class=\"tab-btn small\" data-sidebar-tab=\"latest\">${_t.latest}</button>"
);

// 6. generateMobileSidePanel — accept lang, propagate to default sidebar content.
tryReplace(
  'generateMobileSidePanel signature',
  "function generateMobileSidePanel(sidebarContent = '') {\r\n  const content = sidebarContent || generateDefaultSidebarContent();",
  "function generateMobileSidePanel(sidebarContent = '', lang = 'en') {\r\n  const _t = I18N[lang] || I18N.en;\r\n  const content = sidebarContent || generateDefaultSidebarContent({}, lang);"
);
tryReplace(
  'mobile panel Menu title',
  "<span class=\"mobile-side-panel-title\">Menu</span>",
  "<span class=\"mobile-side-panel-title\">${_t.menu}</span>"
);

// 7. wrapWithLayout — pass lang to header/search/footer/nav/sidebar.
tryReplace(
  'wrapWithLayout header call',
  "${generateHeader()}\r\n  ${generateSearchContainer()}\r\n  ${generateNav(currentPage)}",
  "${generateHeader(lang)}\r\n  ${generateSearchContainer(lang)}\r\n  ${generateNav(currentPage, lang)}"
);
tryReplace(
  'wrapWithLayout sidebar+footer call',
  "${generateMobileSidePanel(generateDefaultSidebarContent(effectiveCounts))}\r\n  ${generateFooter()}",
  "${generateMobileSidePanel(generateDefaultSidebarContent(effectiveCounts, lang), lang)}\r\n  ${generateFooter(lang)}"
);

// 8. generateNav — accept lang param + category label localization.
tryReplace(
  'generateNav signature',
  "function generateNav(currentPage = 'home') {",
  "function generateNav(currentPage = 'home', lang = 'en') {\r\n  const _t = I18N[lang] || I18N.en;\r\n  const _p = lang === 'ko' ? '/ko' : '';\r\n  const _navItems = AI_NAV_ITEMS.map(it => ({\r\n    ...it,\r\n    label: _t.categoryLabels[it.id] || (it.id === 'vibecoding' ? (_t.vibeCoding || it.label) : it.label),\r\n    href: _p + it.href\r\n  }));"
);

// In generateNav body, replace `navItems` references with `_navItems` (if any).
src = src.replace(/(\$\{)navItems\b/g, '$1_navItems').replace(/(navItems)\.findIndex/g, '_navItems.findIndex').replace(/(navItems)\.map\(/g, '_navItems.map(');

if (failures > 0) { console.error(`${failures} patch(es) failed — not saving`); process.exit(1); }
if (src !== original) { fs.writeFileSync(TARGET, src, 'utf8'); console.log('saved'); }
else { console.log('no changes'); }
