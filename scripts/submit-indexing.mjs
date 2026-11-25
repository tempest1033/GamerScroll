#!/usr/bin/env node
// Submit recently-changed indexable URLs to IndexNow (Bing, Yandex, et al.).
//
// Why not the Google Indexing API? That API officially supports only
// JobPosting / BroadcastEvent pages — submitting regular magazine/wiki
// article URLs has no effect and is ignored by Google. Google discovery for
// this site therefore relies on the XML sitemap + Search Console (a one-time
// manual sitemap submission by the site owner). IndexNow covers Bing/Yandex/
// Seznam/Naver, which do honour URL pings for ordinary content.
//
// Inputs:
//   INDEXING_URLS   optional newline-separated URL list to submit (when
//                   absent, the script extracts URLs added/changed between
//                   HEAD~1 and HEAD by inspecting new JSON files under the
//                   article roots below).
//
// IndexNow verification is per-host: each host serves its own key file at
// https://<host>/<KEY>.txt. gamerscroll.com's key is a static file persisted
// at docs/<KEY>.txt; aiscroll.io's key is emitted by generate-ai-blog.js into
// ai-docs/<KEY>.txt on every build. URLs are grouped by host and each group
// is submitted with its own key, so both sites get Bing/Yandex/Naver pings.
//
// Failures never abort: IndexNow non-2xx responses are warned but the process
// exits 0 so CI stays green.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import taxonomy from '../src/templates/ai-blog/taxonomy.js'

const buildAiscrollUrls = article => Object.values(taxonomy.articlePublicationUrls(article))

const DRY_RUN = process.argv.includes('--dry-run')
// Sitemap mode: submit the gamerscroll.com sitemap URLs whose content changed since the last submission: a <lastmod>
// that differs from the one last submitted for that URL, or a URL not submitted before. INDEXING_STATE is the JSON file
// { <url>: <lastmod> } of the last submission (kept between runs by the workflow's cache); it is rewritten after a
// successful submission. Without it every sitemap URL counts as changed once.
const SITEMAP_MODE = process.argv.includes('--sitemap') || process.env.INDEXING_MODE === 'sitemap'
const STATE_FILE = process.env.INDEXING_STATE || '.indexnow-state.json'
const SITEMAP_INDEX = 'https://gamerscroll.com/sitemap.xml'
const INDEXNOW_BATCH = 10000
const USER_AGENT = 'Mozilla/5.0 (compatible; GamerScrollIndexNow/1.0; +https://gamerscroll.com)'

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

// Per-host IndexNow keys — each must match the key file served on that host.
//   gamerscroll.com -> docs/<KEY>.txt (static, in git)
//   aiscroll.io     -> ai-docs/<KEY>.txt (written by generate-ai-blog.js)
const HOST_KEYS = {
  'gamerscroll.com': '86286c2003176dad721fca31b5423813',
  'aiscroll.io': '4aa084cf4bb0f0d440cc9c06ee5e0998',
}

const SITE_BY_PREFIX = [
  { prefix: 'data/tech/ai/',         build: buildAiscrollUrls },
  // 2026-09 재출발: 폴더가 카테고리를 강제하지 않는다 — URL은 JSON category(news/reviews/guides/benchmarks/hot)로 결정
  { prefix: 'data/tech/vibecoding/', build: buildAiscrollUrls },
  { prefix: 'data/tech/normal/',     build: ({ slug })          => [`https://gamerscroll.com/tech/normal/${slug}/`] },
  // 위키 폐기: /wiki/* 는 410 (functions/_middleware.js)
  { prefix: 'data/wiki/',            build: () => [] },
  // GamerScroll 매거진 폐기: reports/issue·hotpick 은 AIScroll 발행분(site: aiscroll)만 핑한다
  { prefix: 'reports/issue/',        build: () => [] },
  { prefix: 'reports/hotpick/',      build: () => [] },
]

export function urlsForArticle(file, json) {
  const route = SITE_BY_PREFIX.find(r => file.startsWith(r.prefix))
  if (!route || json.status !== 'approved' || !json.slug) return []
  return json.site === 'aiscroll' ? buildAiscrollUrls(json) : route.build(json)
}

function extractUrlsFromCommit() {
  const range = process.env.INDEXING_DIFF_RANGE || 'HEAD~1..HEAD'
  const diff = execSync(`git diff --name-only --diff-filter=AM ${range}`, { encoding: 'utf8' })
  const files = diff.split('\n').map(s => s.trim()).filter(s => s.endsWith('.json'))
  const urls = new Set()
  for (const file of files) {
    let json
    try { json = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    for (const u of urlsForArticle(file, json)) urls.add(u)
  }
  return [...urls]
}

// Read a sitemap XML: prefer the built file under docs/ (when present), else fetch live.
async function readSitemap(url) {
  const local = path.join('docs', new URL(url).pathname)
  if (existsSync(local)) return readFileSync(local, 'utf8')
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`sitemap fetch failed: ${url} -> ${res.status}`)
  return res.text()
}

const unescape = s => s.replace(/&amp;/g, '&')
const extractLocs = xml => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => unescape(m[1]))

// { <url>: <lastmod or ''> } of a <urlset>
export function sitemapEntries(xml) {
  const out = {}
  for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = body.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)
    if (!loc) continue
    const lastmod = body.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)
    out[unescape(loc[1])] = lastmod ? lastmod[1] : ''
  }
  return out
}

// URLs whose lastmod differs from the last submitted one, or that were never submitted.
export function changedUrls(current, previous) {
  return Object.keys(current).filter(u => !Object.prototype.hasOwnProperty.call(previous, u) || previous[u] !== current[u])
}

async function collectSitemapEntries() {
  const children = extractLocs(await readSitemap(SITEMAP_INDEX))
    .filter(u => new URL(u).host === 'gamerscroll.com')
  const entries = {}
  for (const child of children) {
    for (const [u, lastmod] of Object.entries(sitemapEntries(await readSitemap(child)))) {
      if (new URL(u).host === 'gamerscroll.com') entries[u] = lastmod
    }
  }
  return { children, entries }
}

const readState = () => { try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return {} } }

let sitemapState = null
async function collectSitemapUrls() {
  const { children, entries } = await collectSitemapEntries()
  const changed = changedUrls(entries, readState())
  sitemapState = entries
  console.log(`[indexnow] sitemap mode: ${children.length} child sitemap(s), ${Object.keys(entries).length} URL(s), ${changed.length} changed since the last submission`)
  return changed
}

async function getUrls() {
  if (SITEMAP_MODE) return collectSitemapUrls()
  const fromEnv = (process.env.INDEXING_URLS || '').split('\n').map(s => s.trim()).filter(Boolean)
  if (fromEnv.length) return fromEnv
  return extractUrlsFromCommit()
}

// Group URLs by host; only hosts with a registered key are submittable.
function groupByHost(urls) {
  const groups = new Map()
  const unknown = []
  for (const u of urls) {
    let host
    try { host = new URL(u).host } catch { unknown.push(u); continue }
    if (!HOST_KEYS[host]) { unknown.push(u); continue }
    if (!groups.has(host)) groups.set(host, [])
    groups.get(host).push(u)
  }
  return { groups, unknown }
}

async function submitIndexNow(host, urlList) {
  const key = HOST_KEYS[host]
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key,
      keyLocation: `https://${host}/${key}.txt`,
      urlList,
    }),
  })
  const text = await res.text().catch(() => '')
  return { ok: res.ok, status: res.status, body: text }
}

async function main() {
  const all = await getUrls()
  const { groups, unknown } = groupByHost(all)
  if (unknown.length) {
    console.log(`[indexnow] skipping ${unknown.length} URL(s) with no registered host key: ${unknown.join(', ')}`)
  }
  let failed = false
  if (groups.size === 0) console.log('[indexnow] no submittable URLs')
  for (const [host, urls] of groups) {
    console.log(`[indexnow] ${DRY_RUN ? 'would submit' : 'submitting'} ${urls.length} URL(s) for ${host}:`)
    for (const u of SITEMAP_MODE ? urls.slice(0, 5) : urls) console.log(`  ${u}`)
    if (DRY_RUN) continue
    for (let i = 0; i < urls.length; i += INDEXNOW_BATCH) {
      const batch = urls.slice(i, i + INDEXNOW_BATCH)
      const r = await submitIndexNow(host, batch)
      if (r.ok) {
        console.log(`[indexnow] OK ${r.status} (${host}, ${batch.length} URL(s))`)
      } else {
        // Warn only — IndexNow non-2xx must not fail the workflow.
        console.warn(`[indexnow] WARN ${r.status} (${host}, ${batch.length} URL(s)) :: ${String(r.body).slice(0, 300)}`)
        failed = true
      }
    }
  }
  if (DRY_RUN) console.log('[indexnow] --dry-run: no live submission')
  // A failed submission keeps the previous state, so its URLs count as changed again next time.
  else if (sitemapState && !failed) writeFileSync(STATE_FILE, JSON.stringify(sitemapState), 'utf8')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(err => {
  // Never fail CI on IndexNow errors; discovery still works via sitemap.
  console.warn('[indexnow] WARN non-fatal error', err?.message || err)
})
