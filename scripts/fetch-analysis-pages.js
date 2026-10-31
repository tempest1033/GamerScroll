'use strict';

/**
 * Refreshes data/analysis-pages.json (which games have a metrics page, per edition) from the metrics sitemap
 * https://gamerscroll.com/analysis/sitemap.xml. Never fails the build: when the sitemap cannot be fetched or is not a
 * <urlset>, the committed list from the last successful run stays untouched (src/build/analysis-pages.js).
 */
const fs = require('node:fs');
const { ANALYSIS_SITEMAP_URL, PAGES_FILE, parseAnalysisSitemap, readAnalysisPages } = require('../src/build/analysis-pages');

const warn = (message) => console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : '⚠️ '}analysis pages: ${message} — keeping the last known list`);

(async () => {
  let pages;
  try {
    const response = await fetch(ANALYSIS_SITEMAP_URL, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'GamerScroll-build' } });
    if (!response.ok) return warn(`${ANALYSIS_SITEMAP_URL} → HTTP ${response.status}`);
    pages = parseAnalysisSitemap(await response.text());
  } catch (error) {
    return warn(`${ANALYSIS_SITEMAP_URL}: ${error.message}`);
  }
  if (!pages) return warn(`${ANALYSIS_SITEMAP_URL} is not a <urlset>`);
  const json = JSON.stringify(pages, null, 1) + '\n';
  if (JSON.stringify(readAnalysisPages()) !== JSON.stringify(pages)) fs.writeFileSync(PAGES_FILE, json, 'utf8');
  console.log(`📈 analysis pages: ${Object.keys(pages).length} games with a metrics page`);
})();
