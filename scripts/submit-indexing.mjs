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
// IndexNow verification: a static key file lives at docs/<KEY>.txt (persisted
// in git; the build does not clean docs/), served at
// https://gamerscroll.com/<KEY>.txt. Only gamerscroll.com URLs are submitted —
// IndexNow requires the key file to share the host of every submitted URL, so
// aiscroll.io URLs (tech/ai, tech/vibecoding) are skipped here.
//
// Failures never abort: IndexNow non-2xx responses are warned but the process
// exits 0 so CI stays green.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const DRY_RUN = process.argv.includes('--dry-run')

// IndexNow key — matches docs/86286c2003176dad721fca31b5423813.txt
const INDEXNOW_KEY = '86286c2003176dad721fca31b5423813'
const HOST = 'gamerscroll.com'
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

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

// IndexNow key files are per-host; only submit URLs on our verified host.
function onlyOwnHost(urls) {
  return urls.filter(u => {
    try { return new URL(u).host === HOST } catch { return false }
  })
}

async function submitIndexNow(urlList) {
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    }),
  })
  const text = await res.text().catch(() => '')
  return { ok: res.ok, status: res.status, body: text }
}

async function main() {
  const all = getUrls()
  const skipped = all.filter(u => { try { return new URL(u).host !== HOST } catch { return true } })
  const urls = onlyOwnHost(all)
  if (skipped.length) {
    console.log(`[indexnow] skipping ${skipped.length} off-host URL(s) (no key file on that host): ${skipped.join(', ')}`)
  }
  if (urls.length === 0) {
    console.log('[indexnow] no gamerscroll.com URLs to submit')
    return
  }
  console.log(`[indexnow] ${DRY_RUN ? 'would submit' : 'submitting'} ${urls.length} URL(s):`)
  for (const u of urls) console.log(`  ${u}`)
  if (DRY_RUN) {
    console.log('[indexnow] --dry-run: no live submission')
    return
  }
  const r = await submitIndexNow(urls)
  if (r.ok) {
    console.log(`[indexnow] OK ${r.status}`)
  } else {
    // Warn only — IndexNow non-2xx must not fail the workflow.
    console.warn(`[indexnow] WARN ${r.status} :: ${String(r.body).slice(0, 300)}`)
  }
}

main().catch(err => {
  // Never fail CI on IndexNow errors; discovery still works via sitemap.
  console.warn('[indexnow] WARN non-fatal error', err?.message || err)
})
