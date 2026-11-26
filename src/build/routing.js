'use strict';

// Cloudflare Pages routing artifacts: docs/_routes.json (what reaches Functions) and docs/_redirects (static 301s).
// See generate-html-report.js for where they are written.
const marketPlan = require('../../functions/_lib/market-plan');

// The comment above the _routes.json step in generate-html-report.js explains each rule. The localized rankings tree is
// excluded from Functions, which is why removed market pages need static redirects (redirectsText). Steam record pages
// (/<locale>/steam/<id>) reach Functions, whose middleware redirects those that moved to a game page; only the hub is excluded.
const LOCALES = ['ko', 'ja', 'zh-cn', 'zh-tw'];

function routesJson() {
  const localeStatic = LOCALES.flatMap((p) => [
    `/${p}`, `/${p}/`, `/${p}/badge/*`, `/${p}/games/`, `/${p}/rankings/*`, `/${p}/steam/`, `/${p}/steam/most-played/*`, `/${p}/trending/*`, `/${p}/about/*`, `/${p}/privacy/*`
  ]);
  return {
    version: 1,
    include: ['/*'],
    exclude: [
      '/assets/*/*.*',
      '/badge/*',
      '/games-data/*',
      '/images/*',
      '/styles/*',
      '/styles-*',
      '/favicon*',
      '/icon-*',
      '/apple-touch-icon*',
      '/og-image.png',
      '/naver*',
      '/sitemap*',
      '/*.json',
      '/*.css',
      '/*.js',
      '/*.txt',
      '/*.map',
      ...localeStatic
    ]
  };
}

// Cloudflare Pages _headers rules for static rank badges (cacheable, non-indexed, hotlinkable across origins).
function badgeHeaderLines() {
  const paths = ['/badge/*', ...LOCALES.map((p) => `/${p}/badge/*`)];
  return paths.flatMap((rule) => [
    rule,
    '  Cache-Control: public, max-age=1800, s-maxage=3600, stale-while-revalidate=3600',
    '  X-Robots-Tag: noindex, nofollow',
    '  Access-Control-Allow-Origin: *',
    '  Cross-Origin-Resource-Policy: cross-origin',
    '  Timing-Allow-Origin: *',
    "  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'",
    '  X-Content-Type-Options: nosniff',
    '',
  ]);
}

// Static redirects for localized market pages an edition does not build (plans = docs/games-data/_pages.json, prefixes = { code: '/ko' }).
function redirectsText(plans, prefixes) {
  const rules = marketPlan.redirectRules(plans, prefixes);
  if (rules.length > 2000) throw new Error(`too many static redirects: ${rules.length}`);
  return rules.length ? rules.join('\n') + '\n' : '';
}

module.exports = { routesJson, badgeHeaderLines, redirectsText };

