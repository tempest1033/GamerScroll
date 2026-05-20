/**
 * Stage 2a: wrapWithLayout supports ko/en. Idempotent. CRLF preserved.
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

const oldOpts =
  'sidebarCounts = {},  // 모바일 사이드 패널 카테고리 숫자' + NL +
  '    cssFilenames = null' + NL +
  '  } = options;';
const newOpts =
  'sidebarCounts = {},  // 모바일 사이드 패널 카테고리 숫자' + NL +
  '    cssFilenames = null,' + NL +
  '    lang = \'en\',' + NL +
  '    alternates = null' + NL +
  '  } = options;' + NL +
  '  const isKo = lang === \'ko\';' + NL +
  '  const ogLocale = isKo ? \'ko_KR\' : \'en_US\';' + NL +
  '  const rssHref = isKo ? `${SITE_CONFIG.baseUrl}/ko/rss.xml` : `${SITE_CONFIG.baseUrl}/rss.xml`;' + NL +
  '  const hreflangLinks = alternates ? `' + NL +
  '  <link rel="alternate" hreflang="en" href="${alternates.en}">' + NL +
  '  <link rel="alternate" hreflang="ko" href="${alternates.ko}">' + NL +
  '  <link rel="alternate" hreflang="x-default" href="${alternates.en}">` : \'\';';
tryPatch('wrapWithLayout options + helpers', oldOpts, newOpts);

tryPatch('<html lang>',
  '<html lang="en" class="${htmlClassAttr}">',
  '<html lang="${lang}" class="${htmlClassAttr}">'
);

tryPatch('og:locale',
  '<meta property="og:locale" content="en_US">',
  '<meta property="og:locale" content="${ogLocale}">'
);

tryPatch('RSS link href',
  '<link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${SITE_CONFIG.baseUrl}/rss.xml">',
  '<link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${rssHref}">'
);

tryPatch('hreflang inline',
  '<link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${rssHref}">',
  '<link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${rssHref}">${hreflangLinks}'
);

if (failures > 0) { console.error(`${failures} failed`); process.exit(1); }
if (src !== original) { fs.writeFileSync(TARGET, src, 'utf8'); console.log('saved'); }
else { console.log('no changes'); }
