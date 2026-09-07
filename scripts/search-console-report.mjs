#!/usr/bin/env node
// Search Console report for gamerscroll.com / aiscroll.io.
//
// Usage:
//   node scripts/search-console-report.mjs [--site gamerscroll|aiscroll] [--months 16] [--top 25] [--inspect] [--pages] [--out <dir>]
//
// Auth reuses the GA4 service accounts (credentials/*.json locally, or the
// GA4_SERVICE_ACCOUNT / AISCROLL_GA4_SERVICE_ACCOUNT JSON env vars in CI).
// Each service account must be added as a user on the matching Search Console
// domain property (sc-domain:...).
//
// --inspect runs the URL Inspection API over every URL in the local sitemap
// (docs/sitemap.xml or ai-docs/sitemap.xml). Quota is 2,000 URLs/day per
// property, so a full pass fits in one run; raw results are written as JSON
// under --out (default cache/search-console/).
//
// --pages dumps every page-level row (clicks/impressions/position) for the
// --months window and for the last 90 days to --out; this is the input for
// scripts/noindex-candidates.mjs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import googleapis from 'googleapis'

const { google } = googleapis
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']

const SITES = {
  gamerscroll: {
    siteUrl: 'sc-domain:gamerscroll.com',
    keyFile: path.join(ROOT, 'credentials', 'ga4-service-account.json'),
    envKey: 'GA4_SERVICE_ACCOUNT',
    sitemap: path.join(ROOT, 'docs', 'sitemap.xml'),
  },
  aiscroll: {
    siteUrl: 'sc-domain:aiscroll.io',
    keyFile: path.join(ROOT, 'credentials', 'aiscroll-ga4-service-account.json'),
    envKey: 'AISCROLL_GA4_SERVICE_ACCOUNT',
    sitemap: path.join(ROOT, 'ai-docs', 'sitemap.xml'),
  },
}

function parseArgs(argv) {
  const opts = { site: null, months: 16, top: 25, inspect: false, pages: false, out: path.join(ROOT, 'cache', 'search-console') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--site') opts.site = argv[++i]
    else if (a === '--months') opts.months = Number(argv[++i]) || 16
    else if (a === '--top') opts.top = Number(argv[++i]) || 25
    else if (a === '--inspect') opts.inspect = true
    else if (a === '--pages') opts.pages = true
    else if (a === '--out') opts.out = path.resolve(argv[++i])
  }
  return opts
}

function createAuth(site) {
  const envJson = process.env[site.envKey]
  if (envJson) return new google.auth.GoogleAuth({ credentials: JSON.parse(envJson), scopes: SCOPES })
  if (existsSync(site.keyFile)) return new google.auth.GoogleAuth({ keyFile: site.keyFile, scopes: SCOPES })
  throw new Error(`no credentials: set ${site.envKey} or add ${path.relative(ROOT, site.keyFile)}`)
}

function isoDate(d) { return d.toISOString().slice(0, 10) }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d }

function printTable(title, header, rows) {
  console.log(`\n-- ${title}`)
  console.log(header.join('\t'))
  for (const r of rows) console.log(r.join('\t'))
}

// Search analytics data lags ~3 days; end every window there.
const LAG_DAYS = 3

async function query(sc, siteUrl, body) {
  const res = await sc.searchanalytics.query({ siteUrl, requestBody: { rowLimit: 25000, ...body } })
  return res.data.rows || []
}

function fmtRow(r) {
  return [...r.keys, r.clicks, r.impressions, `${(r.ctr * 100).toFixed(2)}%`, r.position.toFixed(1)]
}

async function reportSitemaps(sc, siteUrl) {
  const res = await sc.sitemaps.list({ siteUrl })
  const rows = (res.data.sitemap || []).map(s => {
    const contents = (s.contents || []).map(c => `${c.type}:${c.submitted}/${c.indexed}`).join(' ')
    return [s.path, s.lastSubmitted || '', s.lastDownloaded || '', s.isPending ? 'pending' : 'ok', s.errors || 0, s.warnings || 0, contents]
  })
  printTable('sitemaps', ['path', 'lastSubmitted', 'lastDownloaded', 'state', 'errors', 'warnings', 'submitted/indexed'], rows)
}

async function reportMonthly(sc, siteUrl, months) {
  const end = daysAgo(LAG_DAYS)
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - months)
  const rows = await query(sc, siteUrl, { startDate: isoDate(start), endDate: isoDate(end), dimensions: ['date'] })
  const byMonth = new Map()
  for (const r of rows) {
    const month = r.keys[0].slice(0, 7)
    const acc = byMonth.get(month) || { clicks: 0, impressions: 0, positionSum: 0 }
    acc.clicks += r.clicks
    acc.impressions += r.impressions
    acc.positionSum += r.position * r.impressions
    byMonth.set(month, acc)
  }
  const out = [...byMonth.entries()].sort().map(([month, a]) => [
    month,
    a.clicks,
    a.impressions,
    a.impressions ? `${(a.clicks / a.impressions * 100).toFixed(2)}%` : '-',
    a.impressions ? (a.positionSum / a.impressions).toFixed(1) : '-',
  ])
  printTable(`monthly (${isoDate(start)}..${isoDate(end)})`, ['month', 'clicks', 'impressions', 'ctr', 'avgPos'], out)
}

async function reportDimension(sc, siteUrl, dimension, days, top) {
  const rows = await query(sc, siteUrl, {
    startDate: isoDate(daysAgo(days + LAG_DAYS)),
    endDate: isoDate(daysAgo(LAG_DAYS)),
    dimensions: [dimension],
    rowLimit: top,
  })
  printTable(`${dimension} ${days}d`, [dimension, 'clicks', 'impressions', 'ctr', 'avgPos'], rows.map(fmtRow))
}

function sitemapUrls(file) {
  if (!existsSync(file)) return []
  const xml = readFileSync(file, 'utf8')
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
}

async function inspectAll(sc, site, outDir, concurrency = 4) {
  const urls = sitemapUrls(site.sitemap)
  console.log(`\n-- url inspection: ${urls.length} URLs from ${path.relative(ROOT, site.sitemap)}`)
  const results = []
  let next = 0
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++]
      try {
        const res = await sc.urlInspection.index.inspect({
          requestBody: { inspectionUrl: url, siteUrl: site.siteUrl, languageCode: 'ko' },
        })
        const r = res.data.inspectionResult?.indexStatusResult || {}
        results.push({
          url,
          verdict: r.verdict,
          coverageState: r.coverageState,
          indexingState: r.indexingState,
          robotsTxtState: r.robotsTxtState,
          pageFetchState: r.pageFetchState,
          lastCrawlTime: r.lastCrawlTime,
          googleCanonical: r.googleCanonical,
          userCanonical: r.userCanonical,
        })
      } catch (err) {
        results.push({ url, error: err.message })
      }
      if (results.length % 50 === 0) console.log(`   ${results.length}/${urls.length}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))

  const counts = new Map()
  for (const r of results) {
    const key = r.error ? `ERROR: ${r.error.slice(0, 60)}` : `${r.verdict} | ${r.coverageState}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  printTable('inspection summary', ['verdict | coverageState', 'urls'], [...counts.entries()].sort((a, b) => b[1] - a[1]))

  const notIndexed = results.filter(r => !r.error && r.verdict !== 'PASS')
  printTable(`not indexed (${notIndexed.length}, first 40)`, ['url', 'coverageState', 'lastCrawlTime'],
    notIndexed.slice(0, 40).map(r => [r.url, r.coverageState, r.lastCrawlTime || '']))

  mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `${site.name}-inspection-${isoDate(new Date())}.json`)
  writeFileSync(file, JSON.stringify({ site: site.siteUrl, inspectedAt: new Date().toISOString(), results }, null, 2))
  console.log(`   saved ${path.relative(ROOT, file)}`)
}

async function dumpPages(sc, site, outDir, months) {
  const end = daysAgo(LAG_DAYS)
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - months)
  const windows = {
    full: { startDate: isoDate(start), endDate: isoDate(end) },
    recent90: { startDate: isoDate(daysAgo(90 + LAG_DAYS)), endDate: isoDate(end) },
  }
  const out = { site: site.siteUrl, fetchedAt: new Date().toISOString(), windows: {} }
  for (const [name, range] of Object.entries(windows)) {
    const rows = await query(sc, site.siteUrl, { ...range, dimensions: ['page'] })
    out.windows[name] = {
      ...range,
      rows: rows.map(r => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Number(r.position.toFixed(1)) })),
    }
  }
  mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `${site.name}-pages-${isoDate(new Date())}.json`)
  writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`\n-- pages dump: full ${out.windows.full.rows.length} rows, recent90 ${out.windows.recent90.rows.length} rows → ${path.relative(ROOT, file)}`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const names = opts.site ? [opts.site] : Object.keys(SITES)
  for (const name of names) {
    if (!SITES[name]) {
      console.error(`unknown site: ${name} (expected ${Object.keys(SITES).join('|')})`)
      process.exitCode = 1
      continue
    }
    const site = { name, ...SITES[name] }
    console.log(`\n===== ${name} (${site.siteUrl}) =====`)
    try {
      const sc = google.searchconsole({ version: 'v1', auth: createAuth(site) })
      await reportSitemaps(sc, site.siteUrl)
      await reportMonthly(sc, site.siteUrl, opts.months)
      await reportDimension(sc, site.siteUrl, 'page', 90, opts.top)
      await reportDimension(sc, site.siteUrl, 'query', 90, opts.top)
      await reportDimension(sc, site.siteUrl, 'country', 90, 10)
      if (opts.pages) await dumpPages(sc, site, opts.out, opts.months)
      if (opts.inspect) await inspectAll(sc, site, opts.out)
    } catch (err) {
      console.error(`ERROR ${name}: ${err.message}`)
      process.exitCode = 1
    }
  }
}

main()
