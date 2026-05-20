#!/usr/bin/env node
// Submit new article URLs to Google Indexing API after a build/push.
//
// Inputs:
//   GOOGLE_INDEXING_SA_KEY   service account JSON (as a string)
//   INDEXING_URLS            optional newline-separated URL list to submit
//                            (when absent, the script extracts URLs added/
//                             changed between HEAD~1 and HEAD by inspecting
//                             new files under data/tech/ai/, reports/issue/,
//                             reports/hotpick/, reports/insight/, reports/ranking/,
//                             data/wiki/, data/tech/normal/, data/tech/vibecoding/).
//
// The Google Indexing API publish endpoint accepts one URL per call. We POST
// each URL in sequence and log the response. Non-2xx responses are surfaced
// but do not abort the run — partial success is preferable to total skip.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createSign } from 'node:crypto'

const SA_RAW = process.env.GOOGLE_INDEXING_SA_KEY
if (!SA_RAW) {
  console.error('[indexing] GOOGLE_INDEXING_SA_KEY env not set')
  process.exit(1)
}
const sa = JSON.parse(SA_RAW)

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

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const signature = b64url(signer.sign(sa.private_key))
  const assertion = `${header}.${payload}.${signature}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) throw new Error(`token exchange failed: ${JSON.stringify(body)}`)
  return body.access_token
}

async function publish(url, token) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

async function main() {
  const urls = getUrls()
  if (urls.length === 0) {
    console.log('[indexing] no URLs to submit')
    return
  }
  console.log(`[indexing] submitting ${urls.length} URL(s)`)
  const token = await getAccessToken()
  for (const url of urls) {
    const r = await publish(url, token)
    if (r.ok) {
      console.log(`[indexing] OK  ${url}`)
    } else {
      console.error(`[indexing] FAIL ${r.status} ${url} :: ${JSON.stringify(r.body).slice(0, 300)}`)
    }
  }
}

main().catch(err => {
  console.error('[indexing] fatal', err)
  process.exit(1)
})
