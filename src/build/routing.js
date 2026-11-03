'use strict';

// Cloudflare Pages routing artifacts: docs/_routes.json (what reaches Functions) and docs/_redirects (static 301s).
// See generate-html-report.js for where they are written.
const marketPlan = require('../../functions/_lib/market-plan');

// The comment above the _routes.json step in generate-html-report.js explains each rule. The localized rankings tree is
// excluded from Functions, which is why removed market pages need static redirects (redirectsText).
const LOCALES = ['ko', 'ja', 'zh-cn', 'zh-tw'];

function routesJson() {
  const localeStatic = LOCALES.flatMap((p) => [
    `/${p}`, `/${p}/`, `/${p}/games/`, `/${p}/rankings/*`, `/${p}/steam/*`, `/${p}/trending/*`, `/${p}/about/*`, `/${p}/privacy/*`
  ]);
  return {
    version: 1,
    include: ['/*'],
    exclude: [
      '/assets/*/*.*',
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

// Static redirects for localized market pages an edition does not build (plans = docs/games-data/_pages.json, prefixes = { code: '/ko' }).
function redirectsText(plans, prefixes) {
  const rules = marketPlan.redirectRules(plans, prefixes);
  if (rules.length > 2000) throw new Error(`too many static redirects: ${rules.length}`);
  return rules.length ? rules.join('\n') + '\n' : '';
}

module.exports = { routesJson, redirectsText };

