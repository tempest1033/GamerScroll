/**
 * Stage 2e: generate-ai-blog.js — sitemap hreflang xmlns + ko URL + /ko/rss.xml.
 *
 * Replaces the sitemap.xml + robots.txt + rss.xml section inside generateSEOFiles
 * (between "// 1. sitemap.xml 생성" and "// 4. Service Worker 생성").
 *
 * CRLF preserved. Idempotent.
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(__dirname, '..', 'generate-ai-blog.js');
let src = fs.readFileSync(TARGET, 'utf8');
const original = src;
const NL = src.includes('\r\n') ? '\r\n' : '\n';

let failures = 0;

// Also need to update the data mapping inside generateSEOFiles (currently uses enArticles only).
// Strategy: replace from "// 영문 데이터로 변환" down to (but not including) "// 4. Service Worker 생성".

const startMarker = '  // 영문 데이터로 변환' + NL;
const endMarker = NL + '  // 4. Service Worker 생성';
const alreadyMarker = '// === Stage 2e: dual-lang sitemap + ko rss ===';

if (src.includes(alreadyMarker)) {
  console.log('skipped: Stage 2e already applied');
  process.exit(0);
}

const s = src.indexOf(startMarker);
if (s < 0) {
  console.error(`FAIL: start marker not found: ${startMarker.trim()}`);
  process.exit(1);
}
const e = src.indexOf(endMarker, s + startMarker.length);
if (e < 0) {
  console.error('FAIL: end marker not found');
  process.exit(1);
}

const newBlock = [
  '  // === Stage 2e: dual-lang sitemap + ko rss ===',
  "  const enArticles = mapArticles(articles, 'en').map(a => ({",
  "    slug: a.slug, category: a.category || 'general', title: a.title, summary: a.summary, date: a.date, thumbnail: a.thumbnail",
  '  }));',
  "  const koArticles = mapArticles(articles, 'ko').map(a => ({",
  "    slug: a.slug, category: a.category || 'general', title: a.title, summary: a.summary, date: a.date, thumbnail: a.thumbnail",
  '  }));',
  '',
  '  // 1. sitemap.xml — en/ko URL + hreflang alternates',
  '  const baseSitemapPaths = [',
  "    { path: '/', priority: '1.0' },",
  "    { path: '/privacy/', priority: '0.3' },",
  "    { path: '/article/general/', priority: '0.8' },",
  "    { path: '/article/openai/', priority: '0.8' },",
  "    { path: '/article/google/', priority: '0.8' },",
  "    { path: '/article/anthropic/', priority: '0.8' },",
  "    { path: '/article/vibecoding/', priority: '0.8' }",
  '  ];',
  '',
  '  function makeAlternates(p) {',
  '    return [',
  '      `<xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}${p}"/>`,',
  '      `<xhtml:link rel="alternate" hreflang="ko" href="${SITE_URL}/ko${p}"/>`,',
  '      `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${p}"/>`',
  "    ].join('\\n    ');",
  '  }',
  '',
  '  const sitemapEntries = [];',
  '  for (const b of baseSitemapPaths) {',
  '    const alts = makeAlternates(b.path);',
  '    sitemapEntries.push({ loc: `${SITE_URL}${b.path}`, lastmod: today, priority: b.priority, alternates: alts });',
  '    sitemapEntries.push({ loc: `${SITE_URL}/ko${b.path}`, lastmod: today, priority: b.priority, alternates: alts });',
  '  }',
  '  for (const article of enArticles) {',
  "    const articleDate = article.date ? article.date.split('T')[0] : today;",
  '    const p = `/article/${article.category}/${article.slug}/`;',
  '    const alts = makeAlternates(p);',
  "    sitemapEntries.push({ loc: `${SITE_URL}${p}`, lastmod: articleDate, priority: '0.7', alternates: alts });",
  "    sitemapEntries.push({ loc: `${SITE_URL}/ko${p}`, lastmod: articleDate, priority: '0.7', alternates: alts });",
  '  }',
  '',
  '  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  '${sitemapEntries.map(p => `  <url>',
  '    <loc>${p.loc}</loc>',
  '    <lastmod>${p.lastmod}</lastmod>',
  '    <priority>${p.priority}</priority>',
  '    ${p.alternates}',
  "  </url>`).join('\\n')}",
  '</urlset>`;',
  '',
  "  fs.writeFileSync(path.join(DOCS_DIR, 'sitemap.xml'), sitemapXml, 'utf8');",
  "  console.log('sitemap.xml 생성 완료 (en+ko + hreflang)');",
  '',
  '  // 2. robots.txt',
  '  const robotsTxt = `# AIScroll robots.txt',
  'User-agent: *',
  'Allow: /',
  '',
  'Sitemap: ${SITE_URL}/sitemap.xml',
  '`;',
  "  fs.writeFileSync(path.join(DOCS_DIR, 'robots.txt'), robotsTxt, 'utf8');",
  "  console.log('robots.txt 생성 완료');",
  '',
  '  // 3a. RSS (en)',
  '  const enRssItems = enArticles',
  '    .sort((a, b) => new Date(b.date) - new Date(a.date))',
  '    .slice(0, 50)',
  '    .map(article => {',
  '      const pubDate = new Date(article.date).toUTCString();',
  '      const link = `${SITE_URL}/article/${article.category}/${article.slug}/`;',
  '      return `    <item>',
  '      <title><![CDATA[${article.title}]]></title>',
  '      <link>${link}</link>',
  '      <guid isPermaLink="true">${link}</guid>',
  '      <pubDate>${pubDate}</pubDate>',
  '      <description><![CDATA[${article.summary}]]></description>',
  '      <category><![CDATA[${article.category}]]></category>',
  '    </item>`;',
  '    });',
  '  const enRssXml = `<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
  '  <channel>',
  '    <title>AIScroll - AI News & Insights</title>',
  '    <link>${SITE_URL}</link>',
  '    <description>Latest AI news, trends, and insights. Stay updated with the AI industry.</description>',
  '    <language>en-us</language>',
  '    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>',
  '    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>',
  "${enRssItems.join('\\n')}",
  '  </channel>',
  '</rss>`;',
  "  fs.writeFileSync(path.join(DOCS_DIR, 'rss.xml'), enRssXml, 'utf8');",
  '  console.log(`RSS 피드 생성 완료 EN (${enRssItems.length}개)`);',
  '',
  '  // 3b. RSS (ko)',
  '  const koRssItems = koArticles',
  '    .sort((a, b) => new Date(b.date) - new Date(a.date))',
  '    .slice(0, 50)',
  '    .map(article => {',
  '      const pubDate = new Date(article.date).toUTCString();',
  '      const link = `${SITE_URL}/ko/article/${article.category}/${article.slug}/`;',
  '      return `    <item>',
  '      <title><![CDATA[${article.title}]]></title>',
  '      <link>${link}</link>',
  '      <guid isPermaLink="true">${link}</guid>',
  '      <pubDate>${pubDate}</pubDate>',
  '      <description><![CDATA[${article.summary}]]></description>',
  '      <category><![CDATA[${article.category}]]></category>',
  '    </item>`;',
  '    });',
  '  const koRssXml = `<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
  '  <channel>',
  '    <title>AIScroll - 최신 AI 뉴스와 인사이트</title>',
  '    <link>${SITE_URL}/ko</link>',
  '    <description>최신 AI 뉴스와 인사이트. AI 업계 동향을 빠르게 확인하세요.</description>',
  '    <language>ko-kr</language>',
  '    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>',
  '    <atom:link href="${SITE_URL}/ko/rss.xml" rel="self" type="application/rss+xml"/>',
  "${koRssItems.join('\\n')}",
  '  </channel>',
  '</rss>`;',
  "  const koDir = path.join(DOCS_DIR, 'ko');",
  '  if (!fs.existsSync(koDir)) fs.mkdirSync(koDir, { recursive: true });',
  "  fs.writeFileSync(path.join(koDir, 'rss.xml'), koRssXml, 'utf8');",
  '  console.log(`RSS 피드 생성 완료 KO (${koRssItems.length}개)`);',
  ''
].join(NL);

src = src.slice(0, s) + newBlock + src.slice(e);
console.log(`patched: SEO block (${e - s} → ${newBlock.length} bytes)`);

fs.writeFileSync(TARGET, src, 'utf8');
console.log('saved');
