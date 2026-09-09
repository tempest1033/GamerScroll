'use strict';
// 빌드본 docs/ 전수 SEO 점검 (읽기 전용)
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs');
const BASE = 'https://gamerscroll.com';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const files = walk(docs);
const toUrl = f => '/' + path.relative(docs, f).replace(/\\/g, '/').replace(/index\.html$/, '');
const pageType = u => {
  if (u === '/') return 'home';
  if (u.startsWith('/rankings/')) return u === '/rankings/' ? 'rankings-hub' : 'rankings-sub';
  if (u.startsWith('/steam/')) return u === '/steam/' ? 'steam-hub' : 'steam-detail';
  if (u.startsWith('/games/')) return u === '/games/' ? 'games-hub' : 'game-detail';
  if (u.startsWith('/magazine/')) return 'article';
  if (u.startsWith('/reports/')) return 'reports';
  return 'other';
};
const sitemap = new Set([...fs.readFileSync(path.join(docs, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(BASE, '')));
const existing = new Set(files.map(toUrl));
const rows = [];
const issues = {};
const add = (k, u, extra) => { (issues[k] = issues[k] || []).push(extra ? `${u} ${extra}` : u); };
const titles = {};
const brokenLinks = {};
for (const f of files) {
  const u = toUrl(f);
  const html = fs.readFileSync(f, 'utf8');
  const $ = cheerio.load(html);
  const t = $('title').first().text().trim();
  const desc = ($('meta[name="description"]').attr('content') || '').trim();
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const robots = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
  const noindex = /noindex/.test(robots);
  const h1s = $('h1').filter((_, el) => !$(el).hasClass('visually-hidden')).length;
  const h1hidden = $('h1.visually-hidden').length;
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const ld = $('script[type="application/ld+json"]').map((_, el) => { try { const j = JSON.parse($(el).html()); return (Array.isArray(j) ? j : [j]).map(x => x['@type']).join('/'); } catch (e) { return 'INVALID'; } }).get();
  const lang = $('html').attr('lang') || '';
  const imgsNoAlt = $('img').filter((_, el) => $(el).attr('alt') == null).length;
  const type = pageType(u);
  rows.push({ u, type, t, descLen: desc.length, canonical, noindex, h1s, h1hidden, ogTitle: !!ogTitle, ogImage: !!ogImage, ld, lang, imgsNoAlt, inSitemap: sitemap.has(u) });
  if (!t) add('title 없음', u);
  if (t.length > 70 && !noindex) add('title 70자 초과', u, `(${t.length})`);
  if (!desc && !noindex) add('description 없음', u);
  else if (!noindex && (desc.length < 50 || desc.length > 160)) add('description 길이 50~160 벗어남', u, `(${desc.length})`);
  if (!noindex && !canonical) add('canonical 없음', u);
  if (canonical && canonical !== BASE + u && !noindex) add('canonical이 자기 URL과 다름', u, `→ ${canonical}`);
  if (h1s === 0 && h1hidden === 0) add('h1 없음', u);
  if (h1s > 1) add('h1 2개 이상', u, `(${h1s})`);
  if (!noindex && !ogTitle) add('og:title 없음', u);
  if (!noindex && !ogImage) add('og:image 없음', u);
  if (ld.includes('INVALID')) add('JSON-LD 파싱 실패', u);
  if (!noindex && !sitemap.has(u)) add('색인 페이지인데 사이트맵에 없음', u);
  if (noindex && sitemap.has(u)) add('noindex인데 사이트맵에 있음', u);
  if (!noindex) { (titles[t] = titles[t] || []).push(u); }
  if (lang !== 'ko') add('html lang != ko', u, `(${lang})`);
  // 내부 링크 확인
  $('a[href]').each((_, el) => {
    let href = $(el).attr('href');
    if (!href || /^(https?:|mailto:|tel:|javascript:|#)/.test(href)) { if (href && href.startsWith(BASE)) href = href.slice(BASE.length); else return; }
    href = href.split('#')[0].split('?')[0];
    if (!href.startsWith('/')) return;
    let target = href;
    if (!target.endsWith('/') && !/\.[a-z0-9]+$/i.test(target)) target += '/';
    if (target.endsWith('/')) { if (existing.has(target)) return; if (fs.existsSync(path.join(docs, target, 'index.html'))) return; }
    else if (fs.existsSync(path.join(docs, target))) return;
    (brokenLinks[target] = brokenLinks[target] || new Set()).add(u);
  });
}
for (const s of sitemap) if (!existing.has(s)) add('사이트맵에 있는데 파일 없음', s);
for (const [t, us] of Object.entries(titles)) if (us.length > 1) add('title 중복(색인 페이지)', `"${t}"`, `× ${us.length}: ${us.slice(0, 3).join(', ')}`);
const summary = {};
for (const r of rows) { const s = summary[r.type] = summary[r.type] || { n: 0, noindex: 0, sitemap: 0, ld: {} }; s.n++; if (r.noindex) s.noindex++; if (r.inSitemap) s.sitemap++; for (const l of r.ld) s.ld[l] = (s.ld[l] || 0) + 1; }
console.log('pages', files.length, 'sitemap', sitemap.size);
console.log(JSON.stringify(summary, null, 1));
for (const [k, v] of Object.entries(issues)) { console.log(`\n## ${k}: ${v.length}`); v.slice(0, 40).forEach(x => console.log('  ' + x)); }
const bl = Object.entries(brokenLinks).sort((a, b) => b[1].size - a[1].size);
console.log(`\n## 깨진 내부 링크 대상: ${bl.length}`);
bl.slice(0, 20).forEach(([t, s]) => console.log(`  ${t}  ← ${s.size}페이지 (예: ${[...s][0]})`));
// 샘플 메타 출력
for (const type of ['home', 'rankings-hub', 'rankings-sub', 'steam-hub', 'steam-detail', 'games-hub', 'game-detail', 'article', 'reports', 'other']) {
  const r = rows.find(x => x.type === type && !x.noindex) || rows.find(x => x.type === type);
  if (r) console.log(`\n[${type}] ${r.u}\n  title(${r.t.length}): ${r.t}\n  desc=${r.descLen} canonical=${r.canonical} noindex=${r.noindex} h1=${r.h1s}+${r.h1hidden}hidden ld=${r.ld.join(',')} og=${r.ogTitle}/${r.ogImage} noalt=${r.imgsNoAlt}`);
}
