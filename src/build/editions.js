'use strict';

/**
 * Edition build loop: renders the static GamerScroll page set once per country edition.
 *   en  → docs/            ja → docs/ja/   zh-cn → docs/zh-cn/   ko → docs/ko/   zh-tw → docs/zh-tw/
 * Game detail pages are rendered by scripts/generate-game-pages.js and are out of scope here.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const i18n = require('../i18n');
const { ensureDir, externalizeDeferredJsonFromHtml } = require('./utils');
const { ANALYSIS_SITEMAP_URL } = require('./analysis-pages');

const ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATES_DIR = path.join(ROOT, 'src', 'templates') + path.sep;
const AI_BLOG_DIR = path.join(ROOT, 'src', 'templates', 'ai-blog') + path.sep;
const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');

// Template modules hold edition strings in module-level constants, so every edition gets a fresh copy of them.
// The statistics layer (src/rank) is edition independent and stays cached.
function loadTemplates() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(TEMPLATES_DIR) && !key.startsWith(AI_BLOG_DIR)) delete require.cache[key];
  }
  return {
    layout: require('../templates/layout'),
    rankHub: require('../templates/pages/rank-hub'),
    steamHub: require('../templates/pages/steam-hub'),
    index: require('../templates/pages/index'),
    rankings: require('../templates/pages/rankings'),
    steam: require('../templates/pages/steam'),
    gamesHub: require('../templates/pages/games-hub'),
    notFound: require('../templates/pages/404'),
    about: require('../templates/pages/about'),
    privacy: require('../templates/pages/privacy'),
  };
}

function removeOrphanDirs(parentDir, keep, match, label) {
  if (!fs.existsSync(parentDir)) return;
  for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name) || !match(entry.name)) continue;
    fs.rmSync(path.join(parentDir, entry.name), { recursive: true, force: true });
    console.log(`  🧹 orphan page removed: ${label}/${entry.name}`);
  }
}

// docs/games/search-index.json with the edition's game names (names[code] → home-chart title → DB name).
function buildSearchIndex(base, rankStats, edition) {
  const games = base.games.map((entry) => {
    const g = rankStats && entry.slug ? rankStats.bySlug.get(entry.slug) : null;
    return g ? { ...entry, name: rankStats.displayName(g) } : entry;
  });
  return { version: md5(JSON.stringify(games)).slice(0, 8), games };
}

// Writes the edition's search index (<prefix>/games/search-index.json, en: games/search-index.en.json) and returns its version.
// Entries keep the DB fields; `name` is the edition's game name and links are built client-side as /games/<slug>/ (localized by the runtime bundle).
function writeEditionSearchIndex(docsDir, baseSearch, rankStats, edition) {
  const index = buildSearchIndex(baseSearch, rankStats, edition);
  const file = path.join(docsDir, edition.prefix, i18n.searchIndexPath(edition.code).replace(/^\//, ''));
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(index), 'utf8');
  return index.version;
}

function buildClientData({ rankings, steam, gamesData }) {
  const iosSlugMap = {};
  const androidSlugMap = {};
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  Object.values(gamesData || {}).forEach((g) => {
    if (!g || !g.slug || !g.appIds) return;
    if (g.appIds.ios) iosSlugMap[String(g.appIds.ios)] = g.slug;
    if (g.appIds.android) androidSlugMap[String(g.appIds.android)] = g.slug;
    regions.forEach((r) => {
      if (g.appIds[`ios_${r}`]) iosSlugMap[String(g.appIds[`ios_${r}`])] = g.slug;
      if (g.appIds[`android_${r}`]) androidSlugMap[String(g.appIds[`android_${r}`])] = g.slug;
    });
  });
  const buildChart = (chartData) => {
    const out = {};
    for (const [countryCode, perCountry] of Object.entries(chartData || {})) {
      const iosList = Array.isArray(perCountry && perCountry.ios) ? perCountry.ios : [];
      const androidList = Array.isArray(perCountry && perCountry.android) ? perCountry.android : [];
      out[countryCode] = {
        ios: iosList.map((app) => ({ ...app, slug: iosSlugMap[String(app && app.appId)] || null })),
        android: androidList.map((app) => ({ ...app, slug: androidSlugMap[String(app && app.appId)] || null })),
      };
    }
    return out;
  };
  const buildChartStore = (chartData, store) => {
    const out = {};
    const slugMap = store === 'ios' ? iosSlugMap : androidSlugMap;
    for (const [countryCode, perCountry] of Object.entries(chartData || {})) {
      const list = Array.isArray(perCountry && perCountry[store]) ? perCountry[store] : [];
      out[countryCode] = list.map((app) => ({ ...app, slug: slugMap[String(app && app.appId)] || null }));
    }
    return out;
  };
  const files = {
    'rankings/data.json': { grossing: buildChart(rankings && rankings.grossing), free: buildChart(rankings && rankings.free) },
    'rankings/grossing-ios.json': buildChartStore(rankings && rankings.grossing, 'ios'),
    'rankings/grossing-android.json': buildChartStore(rankings && rankings.grossing, 'android'),
    'rankings/free-ios.json': buildChartStore(rankings && rankings.free, 'ios'),
    'rankings/free-android.json': buildChartStore(rankings && rankings.free, 'android'),
  };
  const topSellers = Array.isArray(steam && steam.topSellers) ? steam.topSellers.map((g) => ({ name: (g && g.name) || '', developer: (g && g.developer) || '', img: (g && g.img) || '', price: (g && g.price) || '', discount: (g && g.discount) || '' })) : [];
  const mostPlayed = Array.isArray(steam && steam.mostPlayed) ? steam.mostPlayed.map((g) => ({ name: (g && g.name) || '', developer: (g && g.developer) || '', img: (g && g.img) || '', ccu: (g && g.ccu) ?? 0 })) : [];
  files['steam/data.json'] = { topSellers, mostPlayed };
  return files;
}

/**
 * @param {object} ctx
 *   docsDir, feedDir, cssFilename, cssVersion, gamesData, popularGames, data ({rankings, steam, ...}),
 *   rankingsCacheVersion, steamCacheVersion
 * @returns {Array<{code, prefix, pages, sitemap: Array<{loc, priority}>, assets: {core, runtime, version}}>}
 */
function buildEditions(ctx) {
  const { docsDir, feedDir, gamesData, popularGames, data } = ctx;
  ensureDir(feedDir);
  const rankStats = (() => { try { return require('../rank/stats').loadRankStats(); } catch (e) { return null; } })();
  const baseSearchPath = path.join(docsDir, 'games', 'search-index.json');
  const baseSearch = fs.existsSync(baseSearchPath) ? JSON.parse(fs.readFileSync(baseSearchPath, 'utf8')) : null;
  const baseSearchGames = baseSearch && Array.isArray(baseSearch.games) ? baseSearch : null;
  const clientData = buildClientData({ rankings: data.rankings, steam: data.steam, gamesData });
  const results = [];
  // Sitemap <lastmod>: the date of the data a page shows (latest ranking day / latest Steam day / the page's own month or game).
  const steamStats = (() => { try { return require('../rank/steam-stats').loadSteamStats(); } catch (e) { return null; } })();
  const lastDate = (days) => (days && days.length ? days[days.length - 1].date : null);
  const rankDate = rankStats ? lastDate(rankStats.days) : null;
  const steamDate = steamStats ? lastDate(steamStats.days) : null;
  const homeDate = [rankDate, steamDate].filter(Boolean).sort().pop() || null;
  const steamGameDate = (id) => lastDate(steamStats.days.filter((d) => steamStats.ccuOf(d, id) != null || steamStats.sellOf(d, id) != null));

  for (const edition of i18n.EDITIONS) {
    const started = Date.now();
    i18n.setEdition(edition.code);
    const m = loadTemplates();
    const outDir = path.join(docsDir, edition.prefix);
    const home = edition.country;
    let pages = 0;
    const sitemap = [];

    const write = (rel, html, priority, lastmod = null) => {
      const file = path.join(outDir, rel);
      ensureDir(path.dirname(file));
      const body = rel.endsWith('.html') ? externalizeDeferredJsonFromHtml(html, `${edition.code}/${rel}`, feedDir) : html;
      fs.writeFileSync(file, body, 'utf8');
      if (rel.endsWith('.html')) pages += 1;
      if (priority && rel.endsWith('index.html') && !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) {
        const dir = path.dirname(rel).replace(/\\/g, '/');
        sitemap.push({ path: dir === '.' ? '/' : `/${dir}/`, priority, lastmod });
      }
    };
    const attempt = (label, fn) => {
      try { return fn(); } catch (e) { console.warn(`  ⚠️ [${edition.code}] ${label} failed: ${e.message}`); return null; }
    };

    // ----- edition search index + runtime bundles (they carry the edition's strings) -----
    let searchVersion = '';
    if (baseSearchGames && rankStats) {
      searchVersion = writeEditionSearchIndex(docsDir, baseSearchGames, rankStats, edition);
    }
    m.layout.setCssFilename(ctx.cssFilename);
    m.layout.setCssAssetVersion(ctx.cssVersion);
    if (searchVersion) m.layout.setSearchIndexVersion(searchVersion);
    const coreBundle = m.layout.buildLayoutCoreBundle();
    const runtimeBundle = m.layout.buildLayoutRuntimeBundle({ searchIndexVersion: searchVersion });
    const assetVersion = md5(coreBundle + runtimeBundle).slice(0, 8);
    m.layout.setRuntimeAssetVersion(assetVersion);
    for (const baseDir of [path.join(ROOT, 'assets'), path.join(docsDir, 'assets')]) {
      for (const [asset, body] of [[m.layout.LAYOUT_CORE_ASSET, coreBundle], [m.layout.LAYOUT_RUNTIME_ASSET, runtimeBundle]]) {
        const file = path.join(baseDir, asset);
        ensureDir(path.dirname(file));
        fs.writeFileSync(file, body, 'utf8');
      }
    }

    // ----- top-level pages -----
    const homeHtml = attempt('home', () => m.index.generateIndexPage());
    if (homeHtml) write('index.html', homeHtml, '1.0', homeDate);
    const rankingsHtml = attempt('rankings', () => m.rankHub.renderRankingsHub(home))
      || attempt('rankings (legacy)', () => m.rankings.generateRankingsPage({ ...data, games: gamesData, cacheVersion: ctx.rankingsCacheVersion }));
    if (rankingsHtml) write('rankings/index.html', rankingsHtml, '0.8', rankDate);
    const trendingHtml = rankStats ? attempt('trending', () => m.rankHub.renderTrending(home)) : null;
    if (trendingHtml) write('trending/index.html', trendingHtml, '0.8', rankDate);
    if (trendingHtml) attempt('trending subpages', () => {
      // /trending/<cc>/ for every country (the home country's page canonicalizes to /trending/ → not in the sitemap) + /trending/global/
      for (const c of Object.keys(rankStats.COUNTRIES)) write(`trending/${c}/index.html`, m.rankHub.renderTrending(c), c === home ? null : '0.7', rankDate);
      write('trending/global/index.html', m.rankHub.renderTrending('global'), '0.7', rankDate);
    });
    const steamHtml = attempt('steam', () => m.steamHub.renderSteamHub())
      || attempt('steam (legacy)', () => m.steam.generateSteamPage({ ...data, cacheVersion: ctx.steamCacheVersion }));
    if (steamHtml) write('steam/index.html', steamHtml, '0.8', steamDate);
    const hubHtml = attempt('games hub', () => m.gamesHub.generateGamesHubPage({ games: gamesData, popularGames: popularGames || [], searchIndexVersion: searchVersion }));
    if (hubHtml) write('games/index.html', hubHtml, '0.8', rankDate);
    const notFoundHtml = attempt('404', () => m.notFound.generate404Page());
    if (notFoundHtml) write('404.html', notFoundHtml);
    const aboutHtml = attempt('about', () => m.about.renderAboutPage());
    if (aboutHtml) write('about/index.html', aboutHtml, '0.5');
    const privacyHtml = attempt('privacy', () => m.privacy.renderPrivacyPage());
    if (privacyHtml) write('privacy/index.html', privacyHtml, '0.3');

    // ----- rank hub subpages -----
    if (rankingsHtml && rankStats) attempt('rank hub', () => {
      const S = rankStats;
      const hub = m.rankHub;
      // rankings/about is static text: no trustworthy content date → no <lastmod>
      const sub = (rel, html, priority = '0.7', lastmod = rel === 'about' ? null : rankDate) => write(`rankings/${rel}/index.html`, html, rel === 'subculture' ? null : priority, lastmod);
      // Every country has its own /rankings/<cc>/ (kr included); the home country's page canonicalizes to /rankings/.
      for (const c of Object.keys(S.COUNTRIES)) {
        const duplicate = c === home ? null : '0.7'; // the home country's own subpage duplicates /rankings/ (canonical) → not in the sitemap
        sub(c, hub.renderRankingsHub(c), duplicate);
        sub(`free/${c}`, hub.renderRankingsHub(c, 'free'), duplicate);
      }
      sub('free', hub.renderRankingsHub(home, 'free'));
      sub('subculture', hub.renderSubculture('kr'));
      sub('genres', hub.renderGenre('all'));
      const categories = require('../rank/genres').loadGenres().categories;
      for (const category of categories) sub(`genres/${category.id}`, hub.renderGenre(category.id));
      sub('global', hub.renderGlobal());
      sub('about', hub.renderAbout());
      sub('publishers', hub.renderPublishers('kr'));
      const pubs = hub.publisherPages(hub.publisherIndex(S, 'kr'));
      for (const p of pubs) sub(`publishers/${p.slug}`, hub.renderPublisher(p, 'kr'));
      removeOrphanDirs(path.join(outDir, 'rankings', 'publishers'), new Set(pubs.map((p) => p.slug)), () => true, `${edition.code}/rankings/publishers`);
      removeOrphanDirs(path.join(outDir, 'rankings', 'genres'), new Set(categories.map((c) => c.id)), () => true, `${edition.code}/rankings/genres`);
      sub('records', hub.renderRecords('kr'));
      for (const mo of S.months) {
        if (S.daysIn(mo).length < 7) continue;
        const html = hub.renderMonthly(mo, 'kr');
        if (html) sub(`monthly/${mo}`, html, undefined, lastDate(S.daysIn(mo)));
      }
      // /rankings/monthly/ used to be a 404 → redirect page to the latest month (noindex, not in the sitemap)
      if (S.latestMonth) {
        const latest = `/rankings/monthly/${S.latestMonth}/`;
        const localized = i18n.editionPath(edition.code, latest);
        const t = i18n.t;
        write('rankings/monthly/index.html', `<!DOCTYPE html><html lang="${edition.htmlLang}"><head><meta charset="utf-8"><meta name="robots" content="noindex, follow"><meta http-equiv="refresh" content="0; url=${localized}"><link rel="canonical" href="${i18n.absoluteUrl(edition.code, latest)}"><title>${t('build.monthly_redirect_title')}</title></head><body><p>${t('build.monthly_redirect_notice')} <a href="${localized}">${t('build.monthly_redirect_link', { month: i18n.formatYearMonth(S.latestMonth) })}</a></p></body></html>`);
      }
    });

    // ----- Steam game pages -----
    if (steamHtml) attempt('steam game pages', () => {
      const ids = new Set(m.steamHub.steamGameIds());
      for (const id of ids) write(`steam/${id}/index.html`, m.steamHub.renderSteamGame(id), '0.6', steamGameDate(id));
      removeOrphanDirs(path.join(outDir, 'steam'), ids, (name) => /^\d+$/.test(name), `${edition.code}/steam`);
    });

    // ----- client data -----
    for (const [rel, payload] of Object.entries(clientData)) write(rel, JSON.stringify(payload));

    results.push({
      code: edition.code,
      prefix: edition.prefix,
      pages,
      sitemap: sitemap.map((e) => ({ loc: i18n.absoluteUrl(edition.code, e.path), path: e.path, priority: e.priority, lastmod: e.lastmod })),
      assets: { core: m.layout.LAYOUT_CORE_ASSET, runtime: m.layout.LAYOUT_RUNTIME_ASSET, version: assetVersion },
      searchVersion,
      seconds: ((Date.now() - started) / 1000).toFixed(1),
    });
    console.log(`  ✅ [${edition.code}] ${pages} pages → ${path.relative(ROOT, outDir) || 'docs'} (${results[results.length - 1].seconds}s)`);
  }
  // The request-time game pages (functions/_lib/game-route.js) reference the same runtime bundles and search index versions.
  const editionsFile = path.join(docsDir, 'games-data', '_editions.json');
  ensureDir(path.dirname(editionsFile));
  fs.writeFileSync(editionsFile, JSON.stringify(Object.fromEntries(results.map((r) => [r.code, { runtime: r.assets.version, search: r.searchVersion }]))), 'utf8');
  return results;
}

// <lastmod> line of a sitemap entry; omitted when the page has no trustworthy content date
const lastmodTag = (lastmod) => (lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '');

// sitemap index + one sitemap per edition (each URL lists all editions as xhtml alternates)
function writeSitemaps(docsDir, results) {
  const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const names = [];
  for (const r of results) {
    const entries = r.sitemap.map((e) => {
      const alt = (code) => xmlEscape(encodeURI(i18n.absoluteUrl(code, i18n.alternatePath(code, e.path, r.code))));
      const alternates = [...i18n.EDITIONS.map((x) => `    <xhtml:link rel="alternate" hreflang="${x.hreflang}" href="${alt(x.code)}"/>`), `    <xhtml:link rel="alternate" hreflang="x-default" href="${alt('en')}"/>`].join('\n');
      return `  <url>\n    <loc>${xmlEscape(encodeURI(e.loc))}</loc>${lastmodTag(e.lastmod)}\n    <priority>${e.priority}</priority>\n${alternates}\n  </url>`;
    }).join('\n');
    const name = `sitemap-${r.code}.xml`;
    fs.writeFileSync(path.join(docsDir, name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`, 'utf8');
    names.push(name);
  }
  return writeSitemapIndex(docsDir);
}

// docs/sitemap.xml lists every docs/sitemap-*.xml (page sitemaps and the game sitemaps written by scripts/generate-game-pages.js).
// A child's <lastmod> is the newest <lastmod> of its URLs (omitted when it has none). The metrics pages' sitemap is served by
// another Worker (not in docs/) and is always listed.
function writeSitemapIndex(docsDir) {
  const names = fs.readdirSync(docsDir).filter((f) => /^sitemap-[\w-]+\.xml$/.test(f)).sort();
  const newest = (n) => [...fs.readFileSync(path.join(docsDir, n), 'utf8').matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((x) => x[1]).sort().pop();
  const locs = [...names.map((n) => `  <sitemap>\n    <loc>${i18n.SITE_ORIGIN}/${n}</loc>${lastmodTag(newest(n))}\n  </sitemap>`), `  <sitemap>\n    <loc>${ANALYSIS_SITEMAP_URL}</loc>\n  </sitemap>`];
  const index = locs.join('\n');
  fs.writeFileSync(path.join(docsDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index}\n</sitemapindex>\n`, 'utf8');
  return names;
}

// Game detail URLs of every edition, with reciprocal hreflang alternates, split into sitemap-games-<code>-<n>.xml files (< 50,000 URLs each).
// slugsByEdition: { <code>: [slug, ...] } lists only indexable games; the hreflang set of a URL is the editions that list the slug.
// lastmodBySlug: { <slug>: 'YYYY-MM-DD' } date of each game's latest data (no entry → no <lastmod>).
const SITEMAP_MAX_URLS = 45000;
function writeGameSitemaps(docsDir, slugsByEdition, lastmodBySlug) {
  for (const f of fs.readdirSync(docsDir)) if (/^sitemap-games-[\w-]+\.xml$/.test(f)) fs.unlinkSync(path.join(docsDir, f));
  const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pathOf = (slug) => `/games/${encodeURIComponent(slug)}/`;
  const listed = Object.fromEntries(Object.entries(slugsByEdition).map(([code, slugs]) => [code, new Set(slugs)]));
  const names = [];
  for (const edition of i18n.EDITIONS) {
    const slugs = [...(listed[edition.code] || [])].sort();
    for (let part = 0; part * SITEMAP_MAX_URLS < slugs.length; part++) {
      const entries = slugs.slice(part * SITEMAP_MAX_URLS, (part + 1) * SITEMAP_MAX_URLS).map((slug) => {
        const p = pathOf(slug);
        const alternates = [
          ...i18n.EDITIONS.filter((x) => listed[x.code] && listed[x.code].has(slug)).map((x) => `    <xhtml:link rel="alternate" hreflang="${x.hreflang}" href="${xmlEscape(i18n.absoluteUrl(x.code, p))}"/>`),
          ...(listed.en && listed.en.has(slug) ? [`    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(i18n.absoluteUrl('en', p))}"/>`] : []),
        ].join('\n');
        return `  <url>\n    <loc>${xmlEscape(i18n.absoluteUrl(edition.code, p))}</loc>${lastmodTag(lastmodBySlug[slug])}\n    <priority>0.6</priority>\n${alternates}\n  </url>`;
      }).join('\n');
      const name = `sitemap-games-${edition.code}-${part + 1}.xml`;
      fs.writeFileSync(path.join(docsDir, name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`, 'utf8');
      names.push(name);
    }
  }
  return names;
}

module.exports = { buildEditions, writeSitemaps, writeSitemapIndex, writeGameSitemaps, writeEditionSearchIndex, loadTemplates };
