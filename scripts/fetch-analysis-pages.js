'use strict';

/**
 * Refreshes data/analysis-pages.json (which games have a metrics page, per edition) from the metrics page list
 * https://gamerscroll.com/analysis/pages.xml (every built page, indexable or not). Never fails the build: when the list
 * cannot be fetched or is not a <urlset>, it is emptied, so that build shows no tabs — an older list could link to
 * metrics pages removed since.
 */
const fs = require('node:fs');
const { ANALYSIS_PAGES_URL, ANALYSIS_SITEMAP_URL, PAGES_FILE, LASTMOD_FILE, newestLastmod, readAnalysisLastmod, parseAnalysisSitemap, readAnalysisPages } = require('../src/build/analysis-pages');

const write = (pages) => {
  if (JSON.stringify(readAnalysisPages()) !== JSON.stringify(pages)) fs.writeFileSync(PAGES_FILE, JSON.stringify(pages, null, 1) + '\n', 'utf8');
};
// data/analysis-lastmod.json: the metrics sitemap's own newest <lastmod> (its data as-of date); null when unavailable, never a build time.
const writeLastmod = (lastmod) => {
  if (readAnalysisLastmod() !== lastmod) fs.writeFileSync(LASTMOD_FILE, JSON.stringify({ lastmod }) + '\n', 'utf8');
};
const fetchLastmod = async () => {
  try {
    const response = await fetch(ANALYSIS_SITEMAP_URL, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'GamerScroll-build' } });
    return response.ok ? newestLastmod(await response.text()) : null;
  } catch { return null; }
};
const fail = (message) => {
  writeLastmod(null);
  console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : '⚠️ '}analysis pages: ${message} — no metrics tabs in this build`);
  write({});
};

(async () => {
  let pages;
  try {
    const response = await fetch(ANALYSIS_PAGES_URL, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'GamerScroll-build' } });
    if (!response.ok) return fail(`${ANALYSIS_PAGES_URL} → HTTP ${response.status}`);
    pages = parseAnalysisSitemap(await response.text());
  } catch (error) {
    return fail(`${ANALYSIS_PAGES_URL}: ${error.message}`);
  }
  if (!pages) return fail(`${ANALYSIS_PAGES_URL} is not a <urlset>`);
  write(pages);
  const lastmod = await fetchLastmod();
  writeLastmod(lastmod);
  console.log(`📈 analysis sitemap lastmod: ${lastmod || 'none'}`);
  console.log(`📈 analysis pages: ${Object.keys(pages).length} games with a metrics page`);
})();
