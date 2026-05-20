/**
 * Fix remaining English labels inside generateAIBlogIndex/CategoryPage inner functions
 * (Popular/Latest/Categories headers + tab buttons + category labels).
 *
 * Both outer functions already define _lang via the wrapWithLayout call site;
 * inner closures capture it. We just need the template-literal substitutions.
 *
 * Idempotent. CRLF preserved.
 */

const fs = require('fs');
const path = require('path');
const TARGET = path.resolve(__dirname, '..', 'src', 'templates', 'ai-blog', 'index.js');
let src = fs.readFileSync(TARGET, 'utf8');
const original = src;

let failures = 0;
function tryReplaceAll(label, before, after) {
  if (!src.includes(before)) {
    if (src.includes(after)) { console.log(`skipped: ${label} (already)`); return; }
    console.error(`FAIL: ${label}`); failures++; return;
  }
  const count = src.split(before).length - 1;
  src = src.split(before).join(after);
  console.log(`patched: ${label} x${count}`);
}

// Inner function templates use closure capture of outer `_lang`. The outer
// `generateAIBlogIndex` and `generateCategoryPage` both define `_lang` later
// in the function body — but the inner functions are only *called* from within
// the content template, which executes AFTER `_lang` is defined. So referencing
// `_lang` inside the inner template literal is safe at call time.

// 1. "Popular" card header (generatePopularCards return)
tryReplaceAll(
  'Popular card header',
  '<h2 class="home-card-title">Popular</h2>',
  '<h2 class="home-card-title">${(I18N[_lang] || I18N.en).popular}</h2>'
);

// 2. "Latest" card header (generateLatestGrid return)
tryReplaceAll(
  'Latest card header',
  '<h2 class="home-card-title">Latest</h2>',
  '<h2 class="home-card-title">${(I18N[_lang] || I18N.en).latest}</h2>'
);

// 3. "Categories" sidebar header (generateCategoryMenu return)
tryReplaceAll(
  'Categories sidebar header',
  '<h3 class="home-card-title">Categories</h3>',
  '<h3 class="home-card-title">${(I18N[_lang] || I18N.en).categories}</h3>'
);

// 4. Sidebar Popular/Latest tab buttons
tryReplaceAll(
  'sidebar Popular tab',
  '<button class="tab-btn small active" data-sidebar-tab="popular">Popular</button>',
  '<button class="tab-btn small active" data-sidebar-tab="popular">${(I18N[_lang] || I18N.en).popular}</button>'
);
tryReplaceAll(
  'sidebar Latest tab',
  '<button class="tab-btn small" data-sidebar-tab="latest">Latest</button>',
  '<button class="tab-btn small" data-sidebar-tab="latest">${(I18N[_lang] || I18N.en).latest}</button>'
);

// 5. generateCategoryMenu hardcoded categories array — replace with I18N-driven map.
tryReplaceAll(
  'generateCategoryMenu categories array',
  "const categories = [\r\n      { id: 'general', label: 'General' },\r\n      { id: 'openai', label: 'OpenAI' },\r\n      { id: 'google', label: 'Google' },\r\n      { id: 'anthropic', label: 'Anthropic' },\r\n      { id: 'vibecoding', label: 'Vibe Coding' }\r\n    ];",
  "const _menuT = I18N[_lang] || I18N.en;\r\n    const categories = ['general', 'openai', 'google', 'anthropic', 'vibecoding'].map(id => ({\r\n      id,\r\n      label: id === 'vibecoding' ? (_menuT.vibeCoding || _menuT.categoryLabels[id]) : _menuT.categoryLabels[id]\r\n    }));"
);

// 6. generateCategoryMenu hrefs: prefix langPrefix
tryReplaceAll(
  'category menu href',
  '<a href="/article/${cat.id}/" class="sidebar-category-item">',
  '<a href="${_langPrefix}/article/${cat.id}/" class="sidebar-category-item">'
);

if (failures > 0) { console.error(`${failures} patch(es) failed`); process.exit(1); }
if (src !== original) { fs.writeFileSync(TARGET, src, 'utf8'); console.log('saved'); }
else { console.log('no changes'); }
