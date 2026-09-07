#!/usr/bin/env node
// Search Console 기준 noindex 후보 산출 (GamerScroll 매거진 / AIScroll 기사).
//
// Usage:
//   node scripts/search-console-report.mjs --site aiscroll --pages       # 1) 페이지별 지표 덤프
//   node scripts/noindex-candidates.mjs --site aiscroll|gamerscroll       # 2) 후보 산출
//       [--dump <pages.json>] [--max-clicks 1] [--min-impressions 200] [--fresh-days 60] [--out <dir>]
//   node scripts/set-noindex.mjs --type ai --from cache/search-console/aiscroll-noindex-ai.json   # 3) 적용
//
// 기사 단위(AIScroll은 EN+KO URL 합산)로 다음을 모두 만족하면 후보:
//   전체 창 클릭 <= max-clicks, 최근 90일 클릭 0, 전체 창 노출 < min-impressions,
//   발행일이 fresh-days보다 오래됨(신규 기사는 평가 유예), 아직 noindex가 아님.
// 출력: <out>/<site>-noindex-<type>.json (slug 배열, set-noindex.mjs --from 입력)
//       <out>/<site>-noindex-report-<date>.json (후보/유지 근거)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = path.join(ROOT, 'cache', 'search-console')

const SITES = {
  gamerscroll: {
    types: { issue: 'reports/issue', insight: 'reports/insight', hotpick: 'reports/hotpick', ranking: 'reports/ranking' },
    isOwn: (data) => data.site !== 'aiscroll',
    // https://gamerscroll.com/magazine/<type>/<slug>/
    pageKey: (url) => {
      const m = url.match(/^https:\/\/gamerscroll\.com\/magazine\/(issue|insight|hotpick|ranking)\/([^/?#]+)\/?$/)
      return m ? `${m[1]}/${decodeURIComponent(m[2])}` : null
    },
    articleKey: (a) => `${a.type}/${a.slug}`,
  },
  aiscroll: {
    types: { ai: 'data/tech/ai', vibecoding: 'data/tech/vibecoding' },
    isOwn: (data) => data.site === 'aiscroll',
    // https://aiscroll.io/article/<cat>/<slug>/ 와 /ko/article/... 을 같은 기사로 합산
    pageKey: (url) => {
      const m = url.match(/^https:\/\/aiscroll\.io\/(?:ko\/)?article\/[^/]+\/([^/?#]+)\/?$/)
      return m ? decodeURIComponent(m[1]) : null
    },
    articleKey: (a) => a.slug,
  },
}

function parseArgs(argv) {
  const opts = { site: null, dump: null, maxClicks: 1, minImpressions: 200, freshDays: 60, out: DEFAULT_OUT }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--site') opts.site = argv[++i]
    else if (a === '--dump') opts.dump = path.resolve(argv[++i])
    else if (a === '--max-clicks') opts.maxClicks = Number(argv[++i])
    else if (a === '--min-impressions') opts.minImpressions = Number(argv[++i])
    else if (a === '--fresh-days') opts.freshDays = Number(argv[++i])
    else if (a === '--out') opts.out = path.resolve(argv[++i])
  }
  return opts
}

function latestDump(site, dir) {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter(f => f.startsWith(`${site}-pages-`) && f.endsWith('.json')).sort()
  return files.length ? path.join(dir, files[files.length - 1]) : null
}

function loadArticles(site) {
  const out = []
  for (const [type, rel] of Object.entries(site.types)) {
    const dir = path.join(ROOT, rel)
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      let data
      try { data = JSON.parse(readFileSync(path.join(dir, file), 'utf8').replace(/^\uFEFF/, '')) } catch { continue }
      if (!site.isOwn(data)) continue
      if (!(data.status === 'approved' || data.status === 'published')) continue
      out.push({ slug: data.slug || file.replace(/\.json$/, ''), type, date: data.date || '', noindex: data.noindex === true })
    }
  }
  return out
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const site = SITES[opts.site]
  if (!site) {
    console.error(`--site must be one of ${Object.keys(SITES).join('|')}`)
    process.exit(1)
  }
  const dumpFile = opts.dump || latestDump(opts.site, opts.out)
  if (!dumpFile || !existsSync(dumpFile)) {
    console.error(`no pages dump for ${opts.site}; run: node scripts/search-console-report.mjs --site ${opts.site} --pages`)
    process.exit(1)
  }
  const dump = JSON.parse(readFileSync(dumpFile, 'utf8'))

  const metrics = new Map()
  const acc = (key) => metrics.get(key) || metrics.set(key, { clicks: 0, impressions: 0, clicks90: 0 }).get(key)
  for (const r of dump.windows.full.rows) {
    const key = site.pageKey(r.page)
    if (!key) continue
    const m = acc(key)
    m.clicks += r.clicks
    m.impressions += r.impressions
  }
  for (const r of dump.windows.recent90.rows) {
    const key = site.pageKey(r.page)
    if (key) acc(key).clicks90 += r.clicks
  }

  const freshCutoff = Date.now() - opts.freshDays * 86400000
  const articles = loadArticles(site)
  const candidates = []
  const kept = []
  const skipped = { alreadyNoindex: 0, fresh: 0 }
  for (const a of articles) {
    if (a.noindex) { skipped.alreadyNoindex++; continue }
    const dateMs = Date.parse(a.date)
    if (Number.isFinite(dateMs) && dateMs > freshCutoff) { skipped.fresh++; continue }
    const m = metrics.get(site.articleKey(a)) || { clicks: 0, impressions: 0, clicks90: 0 }
    const row = { slug: a.slug, type: a.type, date: a.date.slice(0, 10), ...m }
    const isCandidate = m.clicks <= opts.maxClicks && m.clicks90 === 0 && m.impressions < opts.minImpressions
    ;(isCandidate ? candidates : kept).push(row)
  }
  kept.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)

  mkdirSync(opts.out, { recursive: true })
  const byType = {}
  for (const c of candidates) (byType[c.type] ||= []).push(c.slug)
  for (const [type, slugs] of Object.entries(byType)) {
    writeFileSync(path.join(opts.out, `${opts.site}-noindex-${type}.json`), JSON.stringify(slugs.sort(), null, 2) + '\n')
  }
  const report = {
    site: opts.site,
    dump: path.relative(ROOT, dumpFile),
    window: dump.windows.full,
    criteria: { maxClicks: opts.maxClicks, minImpressions: opts.minImpressions, freshDays: opts.freshDays, recentClicks: 0 },
    counts: { articles: articles.length, candidates: candidates.length, kept: kept.length, ...skipped },
    candidates,
    kept,
  }
  delete report.window.rows
  const reportFile = path.join(opts.out, `${opts.site}-noindex-report-${new Date().toISOString().slice(0, 10)}.json`)
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n')

  console.log(`${opts.site}: ${articles.length} articles → ${candidates.length} candidates, ${kept.length} kept (signal), ${skipped.fresh} fresh (<${opts.freshDays}d), ${skipped.alreadyNoindex} already noindex`)
  for (const [type, slugs] of Object.entries(byType)) console.log(`  ${type}: ${slugs.length} → ${path.relative(ROOT, path.join(opts.out, `${opts.site}-noindex-${type}.json`))}`)
  console.log(`  report: ${path.relative(ROOT, reportFile)}`)
  console.log('\n-- kept (top 15 by clicks)')
  for (const k of kept.slice(0, 15)) console.log(`  ${k.clicks}\t${k.impressions}\t${k.clicks90}\t${k.type}/${k.slug}`)
}

main()
