'use strict';

// Layout QA for the five language editions: every page type x edition x width.
// Usage: node scripts/test-i18n-layout.js   (needs `node scripts/preview-data-design.js` running on :4175)
// Env: PREVIEW_URL, I18N_LAYOUT_EDITIONS=en,ja  I18N_LAYOUT_WIDTHS=360,390  I18N_LAYOUT_ROUTES=substr  CONCURRENCY=5  NO_SHOTS=1
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
const docs = path.resolve(__dirname, '../docs');
const outDir = path.resolve(__dirname, '../mockups/i18n-layout');
const EDITIONS = (process.env.I18N_LAYOUT_EDITIONS || 'en,ja,zh-cn,ko,zh-tw').split(',');
const WIDTHS = (process.env.I18N_LAYOUT_WIDTHS || '360,390,768,1024,1440').split(',').map(Number);
const ROUTE_FILTER = process.env.I18N_LAYOUT_ROUTES || '';
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const NO_SHOTS = !!process.env.NO_SHOTS;
const prefixOf = ed => (ed === 'en' ? '' : '/' + ed);
const FONT_TOKEN = { ja: 'Noto Sans JP', 'zh-cn': 'Noto Sans SC', 'zh-tw': 'Noto Sans TC' };
const HTML_LANG = { en: 'en', ja: 'ja', 'zh-cn': 'zh-Hans', ko: 'ko', 'zh-tw': 'zh-Hant' };

// Explicit, minimal allowlist of intentional scroll containers / non-DOM-text boxes (check b).
const OVERFLOW_ALLOW = [
  ['.rk-scroll', 'horizontal-scroll wrapper for wide ranking tables (by design)'],
  ['.rk-hscroll', 'horizontal-scroll wrapper for tab/store rows (by design)'],
  ['.rk-carousel', 'home carousel track scrolls/snaps by design'],
  ['.rk-card.rk-country-period', 'game page "rankings by country" card: 6-column table with two sparkline columns scrolls inside its card on phones (overflow-x:auto, min-width:max-content by design)'],
  ['.rk-card.rk-game-months', 'game page monthly-trend card: same horizontally scrolling table card as above'],
  ['.rk-card.rk-month-records', 'steam game page monthly-records card: 6 numeric columns with long metric headings scroll inside the card on phones (overflow-x:auto by design)'],
  ['.rk-interactive-chart', 'game detail chart panel: fixed-width plot scrolls horizontally on phones by design'],
  ['svg, canvas', 'chart drawings: not DOM text boxes, clipped by their own viewBox'],
  ['.visually-hidden', 'screen-reader-only 1px boxes'],
];

function listDirs(p) { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } }
const dispWidth = s => [...s].reduce((n, ch) => n + (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 2 : 1), 0);

function pickGames() {
  const dir = path.join(docs, 'games-data');
  const charting = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (g.ranked) charting.push({ slug: g.slug || f.replace(/\.json$/, ''), name: g.name || '', names: g.names || {} });
  }
  const longest = (sel) => charting.filter(g => sel(g)).sort((a, b) => dispWidth(sel(b)) - dispWidth(sel(a)))[0];
  const slugs = [
    longest(g => g.names.ja), longest(g => g.names['zh-tw']), longest(g => g.names['zh-cn']), longest(g => g.name),
  ].filter(Boolean).map(g => g.slug);
  for (const s of ['메이플-키우기', 'where-winds-meet']) slugs.push(s);
  return [...new Set(slugs)];
}

function buildRoutes() {
  const first = (dirPath) => listDirs(path.join(docs, dirPath)).sort()[0];
  const countries = listDirs(path.join(docs, 'rankings')).filter(n => /^[a-z]{2}$/.test(n));
  const monthly = listDirs(path.join(docs, 'rankings/monthly')).filter(n => /^\d{4}-\d{2}$/.test(n)).sort().pop();
  const genre = first('rankings/genres');
  const publisher = first('rankings/publishers');
  const steamGame = listDirs(path.join(docs, 'steam')).filter(n => /^\d+$/.test(n)).sort()[0];
  const routes = ['/', '/trending/', '/rankings/', ...countries.map(c => `/rankings/${c}/`), '/rankings/free/', '/rankings/genres/', `/rankings/genres/${genre}/`,
    `/rankings/monthly/${monthly}/`, '/rankings/global/', '/rankings/records/', '/rankings/publishers/', `/rankings/publishers/${publisher}/`,
    '/rankings/about/', '/steam/', `/steam/${steamGame}/`, '/games/', ...pickGames().map(s => `/games/${encodeURI(s)}/`),
    '/about/', '/privacy/', '/404.html'];
  return routes;
}
const slugOf = route => (route.replace(/^\/|\/$/g, '').replace(/[^\w.-]+/g, '_') || 'home').slice(0, 80);

// ---- in-page audit (runs in the browser) ----
function audit(cfg) {
  const { lang, htmlLang, fontToken, allow, state } = cfg;
  const out = [];
  const add = (selector, check, text, extra) => out.push({ selector, check, text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100), ...extra });
  const visible = el => el.checkVisibility && el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false }) && el.getClientRects().length > 0;
  const allowSel = allow.join(',');
  const inAllowed = el => !!el.closest(allowSel);
  const desc = el => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const scope = state === 'lang-menu' ? '.gs-lang-menu' : state === 'search' ? 'body > .search-container' : null;
  const rootEls = scope ? [...document.querySelectorAll(scope)] : [document.body];
  const all = [];
  for (const r of rootEls) { all.push(r); all.push(...r.querySelectorAll('*')); }
  const vis = all.filter(el => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD'].includes(el.tagName) && visible(el));

  // a. page-level horizontal overflow
  if (!scope) {
    const se = document.scrollingElement;
    if (se.scrollWidth > innerWidth) {
      const offenders = vis.filter(el => !inAllowed(el) && el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 4).map(desc).join(' | ');
      add('document', 'page-overflow', `scrollWidth ${se.scrollWidth} > ${innerWidth}; ${offenders}`);
    }
  }

  // b. content overflow / clipping / ellipsis
  for (const el of vis) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    if (inAllowed(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || cs.display === 'contents') continue;
    if (el.tagName === 'HTML' || el.tagName === 'BODY' || el.tagName === 'IMG') continue;
    const ellipsis = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
    const overW = el.scrollWidth > el.clientWidth + 1, overH = el.scrollHeight > el.clientHeight + 1;
    if (!overW && !overH) continue;
    const ox = cs.overflowX, oy = cs.overflowY;
    if (ellipsis) {
      // allowed only for game/publisher names ([data-name], on or around the cut box) that carry the full text in title/aria-label
      const named = el.closest('[data-name]') || el.querySelector('[data-name]');
      const full = [el, named].some(x => x && (x.getAttribute('title') || x.getAttribute('aria-label')));
      if (named && full) continue;
      add(desc(el), 'ellipsis-cut', el.textContent, { dim: `${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}` });
      continue;
    }
    const clipsX = ox !== 'visible', clipsY = oy !== 'visible';
    if ((overW && (clipsX || ox === 'visible')) || (overH && (clipsY || oy === 'visible'))) {
      // visible overflow only counts when the spill is of in-flow content (skip boxes whose spill is absolute/fixed descendants)
      if (ox === 'visible' && oy === 'visible') {
        const rect = el.getBoundingClientRect();
        const spills = [...el.children].some(c => { const cc = getComputedStyle(c); if (cc.position === 'absolute' || cc.position === 'fixed' || !visible(c)) return false; const b = c.getBoundingClientRect(); return b.right > rect.right + 1 || b.bottom > rect.bottom + 4 && overH; }); // +4px: fallback-font line boxes (CJK ascent) may exceed a fixed line-height without any visible spill
        const textSpill = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() && (() => { const rg = document.createRange(); rg.selectNodeContents(n); const b = rg.getBoundingClientRect(); return b.right > rect.right + 1; })());
        if (!spills && !textSpill) continue;
      }
      add(desc(el), 'content-overflow', el.textContent, { dim: `${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`, overflow: `${ox}/${oy}` });
    }
  }

  // c. single-line controls
  const SINGLE = {
    nav: '.gs-nav a, .gs-nav button, .nav-item',
    edition: '.gs-lang-btn, .gs-lang-label, .gs-lang-menu a, .gs-lang-menu button',
    tab: '.rk-subnav a, .rk-tabs > *, .rk-htabs > *, .rk-country-tabs > *, .rk-storeseg > *, .rk-kinds > *, .rk-hcountry > label, [role="tab"]',
    button: 'button:not([data-name]), .btn, .gs-list-action',
    badge: '.rk-tagnew, [class*="badge"], [class*="pill"], [class*="chip"], .tag',
    kpi: '.rk-kpi .k, .rk-kpi .l, .rk-stat .l, .rk-preview-label, .rk-kpi > span:first-child',
    th: 'th, .rk-colh',
    legend: '[class*="legend"] > *',
    more: '.rk-hmore, .rk-preview-link, .gs-list-link, [class*="see-all"], [class*="expand"], [class*="more"]',
  };
  const wrapKeys = [];
  for (const [group, sel] of Object.entries(SINGLE)) {
    const els = scope ? rootEls.flatMap(r => [...r.querySelectorAll(sel)]) : [...document.querySelectorAll(sel)];
    els.forEach((el, i) => {
      if (!visible(el) || inAllowed(el) && !el.closest('.rk-hscroll, .rk-scroll')) return;
      // skip containers: only elements without block-level element children
      const cs = getComputedStyle(el);
      if ([...el.children].some(c => { const d = getComputedStyle(c).display; return d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item' || d === 'table'; })) return;
      const rg = document.createRange(); rg.selectNodeContents(el);
      const tops = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        if (!n.textContent.trim()) continue;
        const r2 = document.createRange(); r2.selectNodeContents(n);
        for (const rc of r2.getClientRects()) if (rc.width > 0) tops.push(rc.top + rc.height / 2);
      }
      if (!tops.length) return;
      tops.sort((x, y) => x - y);
      const fs = parseFloat(cs.fontSize); const lh = parseFloat(cs.lineHeight) || fs * 1.2;
      let lines = 1; for (let k = 1; k < tops.length; k++) if (tops[k] - tops[k - 1] > lh * 0.6) lines++;
      const rect = el.getBoundingClientRect();
      const contentH = rect.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
      if (lines > 1) {
        add(`${group}:${desc(el)}`, 'single-line-wrap', el.textContent, { key: `${group}#${i}`, lines, h: Math.round(contentH), lh: Math.round(lh) });
      }
    });
  }

  // d. overlapping siblings
  const CONTAINERS = '.gs-header-inner, .header-inner, .gs-nav, .nav-inner, .rk-subnav, .rk-tabs, .rk-htabs, .rk-country-tabs, .rk-storeseg, .rk-kinds, .rk-kpis, .rk-preview-kpis, .rk-hpanels, .rk-cols, .rk-toolbar, .rk-control, .rk-head, tr, .rk-podium, .rk-hcard, .rk-card';
  const conts = scope ? rootEls.flatMap(r => [...r.querySelectorAll(CONTAINERS)]) : [...document.querySelectorAll(CONTAINERS)];
  for (const c of conts) {
    if (!visible(c)) continue;
    const kids = [...c.children].filter(k => visible(k) && !['absolute', 'fixed'].includes(getComputedStyle(k).position) && k.getBoundingClientRect().width > 0 && k.getBoundingClientRect().height > 0);
    const rects = kids.map(k => k.getBoundingClientRect());
    let hit = false;
    for (let i = 0; i < kids.length && !hit; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = rects[i], b = rects[j];
      const iw = Math.min(a.right, b.right) - Math.max(a.left, b.left), ih = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (iw > 1 && ih > 1) { add(desc(c), 'overlap', `${desc(kids[i])} x ${desc(kids[j])}: ${kids[i].textContent} / ${kids[j].textContent}`, { by: `${Math.round(iw)}x${Math.round(ih)}` }); hit = true; break; }
    }
  }

  // e. script correctness (text outside [data-name])
  if (!scope) {
    const hangul = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
    const brand = /(Google Play(?: Store)?|Apple App Store|App Store|Microsoft Store|Epic Games Store|PlayStation(?: Store| Network)?|Nintendo(?: eShop| Switch)?|Steam(?: Charts)?|GamerScroll|SensorTower|Sensor Tower|AppMagic|Game Informer|X \(Twitter\)|Cloudflare|SteamDB|Top (?:Free|Grossing|Paid))/gi;
    const skip = 'script, style, noscript, svg, [data-name], [translate="no"], .notranslate, .search-dropdown';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n; (n = walker.nextNode());) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || el.closest(skip) || !visible(el)) continue;
      if (lang !== 'ko' && hangul.test(t)) { const k = 'h' + t; if (!seen.has(k)) { seen.add(k); add(desc(el), 'wrong-script', t, { why: 'hangul' }); } continue; }
      if (lang === 'ja' || lang.startsWith('zh')) {
        const stripped = t.replace(brand, ' ');
        if (/[A-Za-z][A-Za-z'’-]{1,}(?:\s+[A-Za-z][A-Za-z'’-]*){2,}/.test(stripped)) {
          const k = 'l' + t; if (!seen.has(k)) { seen.add(k); add(desc(el), 'wrong-script', t, { why: 'english-sentence' }); }
        }
      }
    }
  }

  // g. Latin words must never be broken mid-word across lines (CJK exempt)
  {
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const txt = n.textContent;
      if (!/[A-Za-z]{2}/.test(txt)) continue;
      const el = n.parentElement;
      if (!el || el.closest('script, style, noscript, svg') || !visible(el)) continue;
      const re = /[^\s\-\u2010-\u2015\/]+/g;
      for (let m; (m = re.exec(txt));) {
        const w = m[0];
        if (!/[A-Za-z]{2}/.test(w) || /[^\u0000-\u024F\u2000-\u206F]/.test(w)) continue;
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + w.length);
        const tops = [...rg.getClientRects()].filter(r => r.width > 0.5).map(r => Math.round(r.top));
        if (new Set(tops.map(t => Math.round(t / 4))).size > 1 && Math.max(...tops) - Math.min(...tops) > 4) {
          const k = desc(el) + w; if (!seen.has(k)) { seen.add(k); add(desc(el), 'word-break-midword', w, { context: txt.replace(/\s+/g, ' ').trim().slice(0, 60) }); }
        }
      }
    }
  }

  // f. fonts
  if (!scope) {
    if (document.documentElement.lang !== htmlLang) add('html', 'font-stack', `html lang="${document.documentElement.lang}" expected ${htmlLang}`);
    if (fontToken) {
      const seen = new Set();
      for (const el of vis) {
        if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const ff = getComputedStyle(el).fontFamily;
        if (!ff.includes(fontToken)) { const k = desc(el) + ff; if (!seen.has(k)) { seen.add(k); add(desc(el), 'font-stack', el.textContent, { family: ff.slice(0, 80) }); } }
      }
    }
  }
  return out;
}

// ---- fixed/sticky elements must not cover visible content at any scroll position (runs in the browser) ----
// The header bars themselves (they own that strip by design) and opened menus/dropdowns are exempt.
// Allowlist (fixed-overlap): .gs-header / .search-container / .nav = the page header bars; .gs-lang-menu, .search-dropdown,
// .gs-menu, [role="dialog"] = opened menus/overlays; .games-hub-index = the /games/ A-Z toolbar, a sticky opaque bar under
// the header that page content scrolls beneath exactly like the header (nothing is covered at rest).
const OVERLAY_ALLOW = '.gs-header, body > .search-container, body > .nav, .nav, .gs-lang-menu, .search-dropdown, .gs-menu, [role="dialog"], .games-hub-index';
function fixedAudit(OVERLAY_ALLOW_SEL) {
  const out = [];
  const visible = el => el.checkVisibility && el.checkVisibility({ checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const desc = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const pinned = [...document.querySelectorAll('body *')].filter(el => { const p = getComputedStyle(el).position; return (p === 'fixed' || p === 'sticky') && visible(el) && !el.closest(OVERLAY_ALLOW_SEL); });
  if (!pinned.length) return out;
  const isPinned = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script, style, noscript, svg') || !visible(el) || isPinned(el)) continue;
    texts.push(n);
  }
  for (const p of pinned) {
    const pr = p.getBoundingClientRect();
    if (pr.width < 1 || pr.height < 1) continue;
    let hit = false;
    for (const n of texts) {
      if (hit) break;
      if (p.contains(n)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const rc of rg.getClientRects()) {
        if (rc.width < 1 || rc.bottom < 0 || rc.top > innerHeight) continue;
        const iw = Math.min(pr.right, rc.right) - Math.max(pr.left, rc.left), ih = Math.min(pr.bottom, rc.bottom) - Math.max(pr.top, rc.top);
        if (iw > 1 && ih > 1) { out.push({ selector: desc(p), text: n.textContent, by: `${Math.round(iw)}x${Math.round(ih)}`, scrollY: Math.round(scrollY) }); hit = true; break; }
      }
    }
  }
  return out;
}

// ---- home: country tab x store tab => exactly one country block visible (runs in the browser) ----
function homeTabsAudit() {
  const out = [];
  const visible = el => el.checkVisibility && el.checkVisibility({ checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const countries = [...document.querySelectorAll('input[name="rk-hc"]')].map(i => i.id.replace('hc-', ''));
  const stores = [...document.querySelectorAll('input[name="rk-ht"]')].map(i => i.id.replace('ht-', '')).filter(s => s === 'ios' || s === 'and');
  for (const s of stores) for (const c of countries) {
    document.querySelector(`label[for="ht-${s}"]`).click();
    document.querySelector(`label[for="hc-${c}"]`).click();
    const panel = [...document.querySelectorAll('.rk-hpanel')].find(p => getComputedStyle(p).display !== 'none' && p.classList.contains(s)); // display:contents on the home layout, so no client rects
    const tag = `country=${c} store=${s}`;
    if (!panel) { out.push({ selector: '.rk-hpanel', text: `${tag}: no visible panel` }); continue; }
    const blocks = [...panel.querySelectorAll('.rk-cn')].filter(visible);
    const seen = new Set(blocks.map(b => [...b.classList].find(k => /^rk-c-/.test(k))));
    if (seen.size !== 1 || !seen.has('rk-c-' + c)) out.push({ selector: '.rk-cn', text: `${tag}: visible country blocks = [${[...seen].join(', ')}]` });
    const emptyAll = [...panel.querySelectorAll('.rk-empty.rk-cn')];
    const emptyVisible = emptyAll.filter(visible);
    const expected = c === 'cn' && s === 'and' ? emptyAll.filter(e => e.classList.contains('rk-c-cn')) : [];
    if (emptyVisible.length !== expected.length || emptyVisible.some(e => !expected.includes(e))) out.push({ selector: '.rk-empty.rk-cn', text: `${tag}: ${emptyVisible.length} empty message(s) visible, expected ${expected.length}` });
  }
  return out;
}

async function runGroup(browser, edition, width, routes, ctx) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.route('**/*', r => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await context.newPage();
  const cfg = { lang: edition, htmlLang: HTML_LANG[edition], fontToken: FONT_TOKEN[edition], allow: OVERFLOW_ALLOW.map(a => a[0]) };
  const jobs = routes.map(r => ({ route: r, state: null }));
  if (routes.includes('/')) {
    jobs.push({ route: '/', state: 'lang-menu' });
    if (width <= 768) jobs.push({ route: '/', state: 'search' });
    jobs.push({ route: '/', state: 'home-tabs' });
  }
  for (const job of jobs) {
    const url = base + prefixOf(edition) + (job.route === '/' && edition !== 'en' ? '/' : job.route);
    const label = job.state ? `${job.route}#${job.state}` : job.route;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      if (job.state === 'home-tabs') {
        for (const it of await page.evaluate(homeTabsAudit)) ctx.items.push({ edition, width, route: label, check: 'state-tabs', ...it });
        continue;
      }
      if (!job.state) {
        // fixed/sticky overlap at several scroll positions
        const total = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
        const seenFixed = new Set();
        for (const y of [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(Math.max(0, total) * f))) {
          await page.evaluate(v => scrollTo(0, v), y);
          await page.waitForTimeout(60);
          for (const it of await page.evaluate(fixedAudit, OVERLAY_ALLOW)) {
            const k = it.selector + it.text; if (seenFixed.has(k)) continue; seenFixed.add(k);
            ctx.items.push({ edition, width, route: label, check: 'fixed-overlap', ...it });
          }
        }
        await page.evaluate(() => scrollTo(0, 0));
      }
      if (job.state === 'lang-menu') await page.locator('.gs-lang-btn:visible').first().click();
      if (job.state === 'search') await page.locator('body > .search-container .search-btn').click();
      await page.waitForTimeout(150);
      const items = await page.evaluate(audit, { ...cfg, state: job.state, allow: cfg.allow });
      for (const it of items) ctx.items.push({ edition, width, route: label, ...it });
      if (!NO_SHOTS) {
        const file = `${edition}-${width}-${slugOf(job.route)}${job.state ? '-' + job.state : ''}.png`;
        let buf = await page.screenshot({ fullPage: true, animations: 'disabled' }).catch(() => null);
        if (buf) {
          const meta = await sharp(buf).metadata();
          let img = sharp(buf);
          if (meta.height > 12000) img = img.extract({ left: 0, top: 0, width: meta.width, height: 12000 });
          await img.png({ palette: true, compressionLevel: 9 }).toFile(path.join(outDir, file));
          ctx.shots.push({ edition, width, route: label, file, truncated: meta.height > 12000 });
        }
      }
    } catch (error) {
      ctx.items.push({ edition, width, route: label, selector: 'page', check: 'load-error', text: String(error.message).split('\n')[0] });
    }
  }
  await context.close();
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function writeContactSheet(routes, items, shots) {
  const failing = new Map();
  for (const it of items) if (!it.design) { const k = `${it.edition}|${it.width}|${it.route}`; (failing.get(k) || failing.set(k, []).get(k)).push(it); }
  const shotBy = new Map(shots.map(s => [`${s.edition}|${s.width}|${s.route}`, s]));
  const allRoutes = [...new Set(shots.map(s => s.route))];
  const order = [...routes, '/#lang-menu', '/#search'].filter(r => allRoutes.includes(r));
  let html = `<!doctype html><meta charset="utf-8"><title>i18n layout contact sheet</title><style>
body{font:13px system-ui,sans-serif;margin:16px;background:#f4f5f7;color:#111}h2{margin:28px 0 8px;font-size:15px}
.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;align-items:start}.cell{background:#fff;border:2px solid #cfd3d9;padding:4px;min-width:0}
.cell.fail{border-color:#d92d20;background:#fff1f0}.cell.pass{border-color:#2a9d57}.cell img{width:100%;max-height:520px;object-fit:cover;object-position:top;display:block}
.hd{font-weight:700;margin-bottom:4px}.fl{color:#b42318;font-size:11px;margin:4px 0 0;padding-left:14px}.nav{position:sticky;top:0;background:#f4f5f7;padding:6px 0;z-index:2}
</style><div class="nav"><b>Width:</b> ${WIDTHS.map(w => `<label><input type="radio" name="w" value="${w}"${w === WIDTHS[0] ? ' checked' : ''}> ${w}</label>`).join(' ')}
 &nbsp; <label><input type="checkbox" id="onlyfail"> only failing routes</label> &nbsp; red = failing items (design-level wraps that also wrap in ko are not highlighted)</div>`;
  for (const route of order) {
    html += `<section data-route="${esc(route)}"><h2>${esc(route)}</h2><div class="grid">`;
    for (const ed of EDITIONS) {
      html += '<div>';
      for (const w of WIDTHS) {
        const k = `${ed}|${w}|${route}`, s = shotBy.get(k), f = failing.get(k) || [];
        html += `<div class="cell ${f.length ? 'fail' : 'pass'}" data-w="${w}" data-fail="${f.length ? 1 : 0}"${w === WIDTHS[0] ? '' : ' hidden'}><div class="hd">${ed} · ${w}px${f.length ? ' · ' + f.length + ' issue(s)' : ''}</div>${s ? `<a href="${esc(s.file)}"><img loading="lazy" src="${esc(s.file)}"></a>` : '<i>no screenshot</i>'}`;
        if (f.length) html += '<ul class="fl">' + f.slice(0, 8).map(x => `<li>${esc(x.check)} · ${esc(x.selector)} · ${esc(x.text)}</li>`).join('') + (f.length > 8 ? `<li>+${f.length - 8} more</li>` : '') + '</ul>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div></section>';
  }
  html += `<script>
const sync=()=>{const w=document.querySelector('input[name=w]:checked').value,of=document.getElementById('onlyfail').checked;
document.querySelectorAll('.cell').forEach(c=>c.hidden=c.dataset.w!==w);
document.querySelectorAll('section').forEach(s=>{s.hidden=of&&!s.querySelector('.cell[data-w="'+w+'"][data-fail="1"]')});};
document.addEventListener('change',sync);</script>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let routes = buildRoutes();
  if (ROUTE_FILTER) routes = routes.filter(r => r.includes(ROUTE_FILTER));
  const ctx = { items: [], shots: [] };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const queue = [];
  for (const w of WIDTHS) for (const e of EDITIONS) queue.push([e, w]);
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (let t; (t = queue.shift());) { await runGroup(browser, t[0], t[1], routes, ctx); process.stdout.write(`done ${t[0]} ${t[1]}\n`); }
    }));
  } finally { await browser.close(); }

  // design-level: the same control also wraps in ko at that width/route
  const koWrap = new Set(ctx.items.filter(i => i.edition === 'ko' && i.check === 'single-line-wrap').map(i => `${i.width}|${i.route}|${i.key}`));
  for (const it of ctx.items) if (it.check === 'single-line-wrap' && it.edition !== 'ko' && koWrap.has(`${it.width}|${it.route}|${it.key}`)) it.design = true;
  const edOrder = e => EDITIONS.indexOf(e);
  ctx.items.sort((a, b) => edOrder(a.edition) - edOrder(b.edition) || a.width - b.width || a.route.localeCompare(b.route));
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ base, editions: EDITIONS, widths: WIDTHS, routes, allowlist: OVERFLOW_ALLOW, items: ctx.items }, null, 1));
  if (!NO_SHOTS) writeContactSheet(routes, ctx.items, ctx.shots);

  const checks = ['page-overflow', 'content-overflow', 'ellipsis-cut', 'single-line-wrap', 'overlap', 'wrong-script', 'font-stack', 'word-break-midword', 'fixed-overlap', 'state-tabs', 'load-error'];
  const real = ctx.items.filter(i => !i.design);
  console.log('\ncheck'.padEnd(20) + EDITIONS.map(e => e.padStart(7)).join(''));
  for (const c of checks) console.log(c.padEnd(19) + EDITIONS.map(e => String(real.filter(i => i.check === c && i.edition === e).length).padStart(7)).join(''));
  console.log(`design-level (also wraps in ko): ${ctx.items.length - real.length}`);
  console.log(`total failures: ${real.length}  report: ${path.join(outDir, 'report.json')}`);
  if (real.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
