'use strict';

// Country editions: language, hreflang, selector, locale cookie, default chart country and Hangul-free English edition.
// Runs against the preview server (node scripts/preview-data-design.js, http://127.0.0.1:4175); starts it when it is not running.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { EDITIONS, editionPath, absoluteUrl } = require('../src/i18n');

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
// The Hangul-slug game detail page is rendered on request (functions/_lib/game-route.js; the preview server runs the same handler).
const PAGES = ['/', '/rankings/', '/steam/', '/games/', '/about/', '/games/%EB%A9%94%EC%9D%B4%ED%94%8C-%ED%82%A4%EC%9A%B0%EA%B8%B0/'];
const COUNTRY_NAME_KEY = { us: 'stats.united_states', jp: 'stats.japan', cn: 'stats.china', kr: 'stats.korea', tw: 'stats.taiwan' };
const ALL_COUNTRIES = ['kr', 'jp', 'us', 'cn', 'tw'];
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

async function ensureServer() {
  try { const res = await fetch(base); if (res.ok) return null; } catch { /* start it below */ }
  const child = spawn(process.execPath, [path.resolve(__dirname, 'preview-data-design.js')], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try { const res = await fetch(base); if (res.ok) return child; } catch { /* retry */ }
  }
  child.kill();
  throw new Error('preview server did not start');
}

const hreflangLinks = (html) => [...html.matchAll(/<link\b[^>]*rel="alternate"[^>]*>/g)]
  .map((m) => ({ hreflang: (m[0].match(/hreflang="([^"]+)"/) || [])[1], href: (m[0].match(/href="([^"]+)"/) || [])[1] }))
  .filter((l) => l.hreflang)
  .sort((a, b) => a.hreflang.localeCompare(b.hreflang));
const canonicalOf = (html) => ((html.match(/<link\b[^>]*rel="canonical"[^>]*>/) || [''])[0].match(/href="([^"]+)"/) || [])[1];

(async () => {
  const server = await ensureServer();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  const check = async (label, fn) => { try { await fn(); } catch (error) { failures.push(`${label}: ${error.message.split('\n')[0]}`); } };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(`${page.url()}: ${error.message}`));

    for (const edition of EDITIONS) {
      const messages = require(`../src/i18n/messages/${edition.code}.js`);
      for (const pagePath of PAGES) {
        const localized = editionPath(edition.code, pagePath);
        const label = `[${edition.code}] ${localized}`;
        await check(label, async () => {
          const response = await page.goto(base + localized, { waitUntil: 'networkidle' });
          assert.equal(response.status(), 200, 'status');

          // <html lang>
          assert.equal(await page.evaluate(() => document.documentElement.lang), edition.htmlLang, 'html lang');

          // hreflang: 5 editions + x-default, absolute, reciprocal; canonical is self-referencing
          const html = await response.text();
          const links = hreflangLinks(html);
          const expected = [...EDITIONS.map((e) => ({ hreflang: e.hreflang, href: absoluteUrl(e.code, pagePath) })), { hreflang: 'x-default', href: absoluteUrl('en', pagePath) }]
            .sort((a, b) => a.hreflang.localeCompare(b.hreflang));
          assert.deepEqual(links, expected, 'hreflang set');
          for (const link of links) assert.ok(/^https:\/\/gamerscroll\.com\//.test(link.href), `absolute hreflang ${link.href}`);
          assert.equal(canonicalOf(html), absoluteUrl(edition.code, pagePath), 'canonical');
          assert.ok(html.includes(`<meta property="og:locale" content="${edition.ogLocale}">`), 'og:locale');
          for (const link of links) {
            const target = new URL(link.href);
            const other = await (await fetch(base + target.pathname)).text();
            assert.deepEqual(hreflangLinks(other), expected, `reciprocal hreflang on ${target.pathname}`);
          }

          // selector: button = current edition, dropdown = five editions in contract order
          const selector = page.locator('.gs-header [data-edition-selector]');
          assert.equal((await selector.locator('[data-edition-toggle] .gs-lang-label').innerText()).trim(), edition.label, 'selector button label');
          const options = await selector.locator('[data-edition-link]').evaluateAll((els) => els.map((e) => ({ code: e.dataset.edition, label: e.textContent.trim(), href: e.getAttribute('href') })));
          assert.deepEqual(options.map((o) => o.code), EDITIONS.map((e) => e.code), 'selector order');
          assert.deepEqual(options.map((o) => o.label), EDITIONS.map((e) => e.label), 'selector labels');
          assert.deepEqual(options.map((o) => o.href), EDITIONS.map((e) => editionPath(e.code, pagePath)), 'selector paths');

          // chart country: the edition's own country comes first and is the default
          if (pagePath === '/rankings/') {
            const tabs = await page.locator('.rk-country-tabs a').evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), active: e.classList.contains('active'), href: e.getAttribute('href') })));
            assert.equal(tabs.length, 5, 'country tabs');
            assert.ok(tabs[0].active, 'home country tab is active');
            assert.equal(tabs[0].text, messages[COUNTRY_NAME_KEY[edition.country]], 'home country label');
            assert.equal(tabs[0].href, localized, 'home country tab links to /rankings/');
            const others = ALL_COUNTRIES.filter((c) => c !== edition.country);
            assert.deepEqual(tabs.slice(1).map((t) => t.href).sort(), others.map((c) => editionPath(edition.code, `/rankings/${c}/`)).sort(), 'other countries stay on /rankings/<cc>/');
            if (edition.country === 'cn') assert.equal(await page.locator('.rk-cols .rk-col').count(), 1, 'cn: App Store only');
          }
          if (pagePath === '/') {
            const first = await page.locator('.rk-hcountry label').first().innerText();
            assert.equal(first.trim(), messages[COUNTRY_NAME_KEY[edition.country]], 'home card country');
            assert.ok(await page.locator(`#hc-${edition.country}`).isChecked(), 'home country radio checked');
            if (edition.country === 'cn') assert.ok(await page.locator('#ht-ios').isChecked(), 'cn defaults to App Store');
          }

          // English edition (and the ja/zh editions, which carry en text for now): no Hangul outside [data-name] (game and publisher names)
          if (edition.code !== 'ko') {
            const offenders = await page.evaluate((source) => {
              const re = new RegExp(source);
              const found = [];
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const parent = node.parentElement;
                if (!parent || parent.closest('script, style, noscript, template, [data-name]')) continue;
                if (re.test(node.nodeValue)) found.push(node.nodeValue.trim().slice(0, 60));
              }
              for (const el of document.body.querySelectorAll('[placeholder], [aria-label], [title]')) {
                if (el.closest('[data-name]')) continue;
                for (const attr of ['placeholder', 'aria-label', 'title']) if (re.test(el.getAttribute(attr) || '')) found.push(`@${attr}=${el.getAttribute(attr).slice(0, 40)}`);
              }
              return found;
            }, HANGUL.source);
            assert.deepEqual(offenders.slice(0, 5), [], `Hangul outside [data-name] (${offenders.length})`);
          }
        });
      }
    }

    // Switching edition: cookie + same path in the target edition
    for (const from of EDITIONS) {
      const target = EDITIONS.find((e) => e.code === (from.code === 'ja' ? 'ko' : 'ja'));
      const pagePath = '/rankings/';
      await check(`[switch ${from.code}→${target.code}]`, async () => {
        await context.clearCookies();
        await page.goto(base + editionPath(from.code, pagePath), { waitUntil: 'networkidle' });
        await page.locator('.gs-header [data-edition-toggle]').click();
        await page.locator(`.gs-header [data-edition-link][data-edition="${target.code}"]`).click();
        await page.waitForURL((url) => url.pathname === editionPath(target.code, pagePath));
        const cookie = (await context.cookies()).find((c) => c.name === 'gs_locale');
        assert.ok(cookie, 'gs_locale cookie set');
        assert.equal(cookie.value, target.code, 'cookie value');
        assert.equal(cookie.path, '/');
        assert.equal(cookie.sameSite, 'Lax');
        assert.equal(cookie.secure, true);
        assert.ok(cookie.expires - Date.now() / 1000 > 31536000 - 3600, 'Max-Age one year');
        assert.equal(await page.evaluate(() => document.documentElement.lang), target.htmlLang, 'landed in target edition');
      });
    }
    assert.deepEqual(pageErrors, [], 'no uncaught page errors');
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(`i18n editions ok: ${EDITIONS.length} editions × ${PAGES.length} pages + ${EDITIONS.length} switches`);
})().catch((error) => { console.error(error); process.exit(1); });
