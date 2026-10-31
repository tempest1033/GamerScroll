'use strict';

/**
 * Refreshes data/analysis-pages.json (which games have a metrics page, per edition) from the metrics sitemap
 * https://gamerscroll.com/analysis/sitemap.xml. Never fails the build: when the sitemap cannot be fetched or is not a
 * <urlset>, the list is emptied, so that build shows no tabs — an older list could link to metrics pages removed since.
 */
const fs = require('node:fs');
const { ANALYSIS_SITEMAP_URL, PAGES_FILE, parseAnalysisSitemap, readAnalysisPages } = require('../src/build/analysis-pages');

const write = (pages) => {
  if (JSON.stringify(readAnalysisPages()) !== JSON.stringify(pages)) fs.writeFileSync(PAGES_FILE, JSON.stringify(pages, null, 1) + '\n', 'utf8');
};
const fail = (message) => {
  console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : '⚠️ '}analysis pages: ${message} — no metrics tabs in this build`);
  write({});
};

(async () => {
  let pages;
  try {
    const response = await fetch(ANALYSIS_SITEMAP_URL, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'GamerScroll-build' } });
    if (!response.ok) return fail(`${ANALYSIS_SITEMAP_URL} → HTTP ${response.status}`);
    pages = parseAnalysisSitemap(await response.text());
  } catch (error) {
    return fail(`${ANALYSIS_SITEMAP_URL}: ${error.message}`);
  }
  if (!pages) return fail(`${ANALYSIS_SITEMAP_URL} is not a <urlset>`);
  write(pages);
  console.log(`📈 analysis pages: ${Object.keys(pages).length} games with a metrics page`);
})();
