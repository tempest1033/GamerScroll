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

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const DRY_RUN = process.argv.includes('--dry-run')

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

// Per-host IndexNow keys — each must match the key file served on that host.
//   gamerscroll.com -> docs/<KEY>.txt (static, in git)
//   aiscroll.io     -> ai-docs/<KEY>.txt (written by generate-ai-blog.js)
const HOST_KEYS = {
  'gamerscroll.com': '86286c2003176dad721fca31b5423813',
  'aiscroll.io': '4aa084cf4bb0f0d440cc9c06ee5e0998',
}

const SITE_BY_PREFIX = [
  { prefix: 'data/tech/ai/',         build: ({ slug, category }) => [
    `https://aiscroll.io/article/${category}/${slug}/`,
    `https://aiscroll.io/ko/article/${category}/${slug}/`,
  ]},
  { prefix: 'data/tech/vibecoding/', build: ({ slug })          => [
    `https://aiscroll.io/article/vibecoding/${slug}/`,
    `https://aiscroll.io/ko/article/vibecoding/${slug}/`,
  ]},
  { prefix: 'data/tech/normal/',     build: ({ slug })          => [`https://gamerscroll.com/tech/normal/${slug}/`] },
  { prefix: 'data/wiki/business/',   build: ({ slug })          => [`https://gamerscroll.com/wiki/business/${slug}/`] },
  { prefix: 'data/wiki/history/',    build: ({ slug })          => [`https://gamerscroll.com/wiki/history/${slug}/`] },
  { prefix: 'data/wiki/knowledge/',  build: ({ slug })          => [`https://gamerscroll.com/wiki/knowledge/${slug}/`] },
  { prefix: 'reports/issue/',        build: ({ slug })          => [`https://gamerscroll.com/magazine/issue/${slug}/`] },
  { prefix: 'reports/hotpick/',      build: ({ slug })          => [`https://gamerscroll.com/magazine/hotpick/${slug}/`] },
  { prefix: 'reports/insight/',      build: ({ slug })          => [`https://gamerscroll.com/magazine/insight/${slug}/`] },
  { prefix: 'reports/ranking/',      build: ({ slug })          => [`https://gamerscroll.com/magazine/ranking/${slug}/`] },
]

function extractUrlsFromCommit() {
  const range = process.env.INDEXING_DIFF_RANGE || 'HEAD~1..HEAD'
  const diff = execSync(`git diff --name-only --diff-filter=AM ${range}`, { encoding: 'utf8' })
  const files = diff.split('\n').map(s => s.trim()).filter(s => s.endsWith('.json'))
  const urls = new Set()
  for (const file of files) {
    const route = SITE_BY_PREFIX.find(r => file.startsWith(r.prefix))
    if (!route) continue
    let json
    try { json = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    if (json.status !== 'approved') continue
    const slug = json.slug
    if (!slug) continue
    const built = route.build({ slug, category: json.category || 'general' })
    for (const u of built) urls.add(u)
  }
  return [...urls]
}

function getUrls() {
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
  const all = getUrls()
  const { groups, unknown } = groupByHost(all)
  if (unknown.length) {
    console.log(`[indexnow] skipping ${unknown.length} URL(s) with no registered host key: ${unknown.join(', ')}`)
  }
  if (groups.size === 0) {
    console.log('[indexnow] no submittable URLs')
    return
  }
  for (const [host, urls] of groups) {
    console.log(`[indexnow] ${DRY_RUN ? 'would submit' : 'submitting'} ${urls.length} URL(s) for ${host}:`)
    for (const u of urls) console.log(`  ${u}`)
    if (DRY_RUN) continue
    const r = await submitIndexNow(host, urls)
    if (r.ok) {
      console.log(`[indexnow] OK ${r.status} (${host})`)
    } else {
      // Warn only — IndexNow non-2xx must not fail the workflow.
      console.warn(`[indexnow] WARN ${r.status} (${host}) :: ${String(r.body).slice(0, 300)}`)
    }
  }
  if (DRY_RUN) console.log('[indexnow] --dry-run: no live submission')
}

main().catch(err => {
  // Never fail CI on IndexNow errors; discovery still works via sitemap.
  console.warn('[indexnow] WARN non-fatal error', err?.message || err)
})
