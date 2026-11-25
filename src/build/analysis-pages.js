'use strict';

/**
 * Which games have a metrics ("지표 분석") page, per edition. The pages live in a separate Worker; its page list
 * (https://gamerscroll.com/analysis/pages.xml, sitemap format, absolute URLs of every built /<prefix>/analysis/<slug>/)
 * is the single source. The metrics pages are not offered to search engines: neither the sitemap index nor robots.txt
 * names a metrics sitemap, and ranking rows do not link them. scripts/fetch-analysis-pages.js stores the parsed list in
 * data/analysis-pages.json (a failed fetch empties it, so no tab can link to a removed page) and scripts/generate-game-pages.js
 * puts each game's edition codes into its games-data JSON.
 */
const fs = require('fs');
const path = require('path');
const i18n = require('../i18n');
const { slugKeys } = require('./game-slug');

const ANALYSIS_PAGES_URL = `${i18n.SITE_ORIGIN}/analysis/pages.xml`;
const PAGES_FILE = process.env.ANALYSIS_PAGES_FILE || path.join(__dirname, '..', '..', 'data', 'analysis-pages.json');

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// sitemap XML → { <slug (NFC)>: [edition code, ...] }. Only <urlset> entries on the site origin shaped /[<prefix>/]analysis/<slug>/ count.
// Returns null when the text is not a urlset.
function parseAnalysisSitemap(xml) {
  if (!/<urlset[\s>]/.test(xml)) return null;
  const pages = {};
  for (const [, loc] of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    let url;
    try { url = new URL(unxml(loc)); } catch { continue; }
    if (url.origin !== i18n.SITE_ORIGIN) continue;
    for (const edition of i18n.EDITIONS) {
      const match = url.pathname.startsWith(`${edition.prefix}/analysis/`) && url.pathname.slice(`${edition.prefix}/analysis/`.length).match(/^([^/]+)\/$/);
      if (!match) continue;
      let slug;
      try { slug = decodeURIComponent(match[1]).normalize('NFC'); } catch { break; }
      if (!pages[slug]) pages[slug] = [];
      if (!pages[slug].includes(edition.code)) pages[slug].push(edition.code);
      break;
    }
  }
  return Object.fromEntries(Object.keys(pages).sort().map((slug) => [slug, pages[slug].sort()]));
}

// The committed list; {} when absent or unreadable (no tabs).
function readAnalysisPages(file = PAGES_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

// The metrics Worker names a page by the slug it knows the game by, which may be one the game has since retired
// (game.legacySlugs). Returns { slug, editions } of the game's metrics pages in `pages`, or null.
function analysisEntry(game, pages) {
  for (const slug of slugKeys(game)) {
    const editions = pages[String(slug).normalize('NFC')];
    if (Array.isArray(editions)) return { slug, editions };
  }
  return null;
}

// Same rule as the game page tab (game.analysis): the slug of the game's metrics page in this edition, or null.
let pagesCache;
function analysisSlug(game, editionCode) {
  if (!pagesCache) pagesCache = readAnalysisPages();
  const entry = analysisEntry(game, pagesCache);
  return entry && entry.editions.includes(editionCode) ? entry.slug : null;
}

module.exports = { ANALYSIS_PAGES_URL, PAGES_FILE, parseAnalysisSitemap, readAnalysisPages, analysisEntry, analysisSlug };
