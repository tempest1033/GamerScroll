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

// Static redirects for localized market pages an edition does not build (plans = docs/games-data/_pages.json, prefixes = { code: '/ko' })
// and for localized Steam record pages that moved to a game page (steam = docs/games-data/_steam.json, app ID → slug).
// The unprefixed edition's URLs reach the middleware, which redirects them itself.
function redirectsText(plans, prefixes, steam = {}) {
  const steamRules = Object.values(prefixes).filter(Boolean).flatMap((prefix) => Object.entries(steam).map(([id, slug]) => `${prefix}/steam/${id}/ ${prefix}/games/${encodeURIComponent(slug)}/ 301`));
  const rules = [...marketPlan.redirectRules(plans, prefixes), ...steamRules];
  if (rules.length > 2000) throw new Error(`too many static redirects: ${rules.length}`);
  return rules.length ? rules.join('\n') + '\n' : '';
}

module.exports = { routesJson, redirectsText };

