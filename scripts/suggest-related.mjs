#!/usr/bin/env node
// suggest-related.mjs — relatedDocs 자동 후보 추천.
//
// 카탈로그 전체(같은 site의 발행 기사)를 대상으로 제목/키워드/요약 토큰 중복도를
// 점수화해 상위 후보를 relatedDocs prefix 형식으로 출력한다. 동점은 최신순.
//
//   node scripts/suggest-related.mjs <article.json> [--top 8] [--include-drafts]
//
// 출력 형식은 parseRelatedDocs()가 받는 그대로: issue:slug / insight:slug /
// hotpick:slug / ranking:slug / wiki:<cat>/slug / tech:<cat>/slug — 복사해서
// relatedDocs 배열에 붙여넣으면 된다 (3–4개 선택은 사람 판단).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const fileArg = args.find(a => !a.startsWith('-'))
let topN = 8
const topIdx = args.indexOf('--top')
if (topIdx >= 0) topN = Number(args[topIdx + 1]) || 8
const includeDrafts = args.includes('--include-drafts')

if (!fileArg) {
  console.error('usage: node scripts/suggest-related.mjs <article.json> [--top 8] [--include-drafts]')
  process.exit(2)
}

// site별 후보 풀 (경로 → prefix 빌더)
const POOLS = {
  gamerscroll: [
    { dir: 'reports/issue',        prefix: s => `issue:${s}` },
    { dir: 'reports/insight',      prefix: s => `insight:${s}` },
    { dir: 'reports/hotpick',      prefix: s => `hotpick:${s}` },
    { dir: 'reports/ranking',      prefix: s => `ranking:${s}` },
    { dir: 'data/wiki/business',   prefix: s => `wiki:business/${s}` },
    { dir: 'data/wiki/history',    prefix: s => `wiki:history/${s}` },
    { dir: 'data/wiki/knowledge',  prefix: s => `wiki:knowledge/${s}` },
  ],
  aiscroll: [
    { dir: 'data/tech/ai',         prefix: s => `tech:ai/${s}` },
    { dir: 'data/tech/vibecoding', prefix: s => `tech:vibecoding/${s}` },
  ],
}

function tokenize(text) {
  const out = new Set()
  const matches = String(text || '').toLowerCase().match(/[a-z0-9가-힣]{2,}/g) || []
  for (const m of matches) out.add(m)
  return out
}

// keywords는 배열 또는 콤마 문자열 두 형식이 공존한다
function keywordsText(raw) {
  if (Array.isArray(raw)) return raw.join(' ')
  return String(raw || '').replace(/,/g, ' ')
}

function articleText(json) {
  const headings = (Array.isArray(json.content) ? json.content : [])
    .filter(b => b && b.type === 'heading').map(b => b.value).join(' ')
  return {
    kw: tokenize(keywordsText(json.keywords)),
    title: tokenize(json.title),
    rest: tokenize(`${json.summary || ''} ${headings}`),
  }
}

function resolveTargetPath(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p)
  if (!existsSync(abs)) { console.error(`not found: ${abs}`); process.exit(2) }
  return abs
}

const targetPath = resolveTargetPath(fileArg)
const target = JSON.parse(readFileSync(targetPath, 'utf8'))
const site = target.site
  || (targetPath.replace(/\\/g, '/').includes('/data/tech/') ? 'aiscroll' : 'gamerscroll')
const pools = POOLS[site] || POOLS.gamerscroll
const t = articleText(target)

const candidates = []
for (const pool of pools) {
  const dir = path.join(REPO_ROOT, pool.dir)
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const full = path.join(dir, f)
    if (path.resolve(full) === path.resolve(targetPath)) continue
    let json
    try { json = JSON.parse(readFileSync(full, 'utf8')) } catch { continue }
    if (!json.slug) continue
    if (!includeDrafts && json.status !== 'approved') continue

    const candTokens = tokenize(`${json.title || ''} ${keywordsText(json.keywords)} ${json.summary || ''}`)
    let score = 0
    for (const tok of t.kw)    if (candTokens.has(tok)) score += 3
    for (const tok of t.title) if (candTokens.has(tok)) score += 2
    for (const tok of t.rest)  if (candTokens.has(tok)) score += 1
    if (score === 0) continue

    candidates.push({
      ref: pool.prefix(json.slug),
      title: json.title || json.slug,
      date: String(json.date || '').slice(0, 10) || '(no date)',
      score,
    })
  }
}

// 점수 우선, 동점은 최신순
candidates.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))

console.log(`\n[suggest-related] ${path.relative(REPO_ROOT, targetPath)} (site: ${site}) — 후보 ${candidates.length}개 중 상위 ${topN}`)
for (const c of candidates.slice(0, topN)) {
  console.log(`  ${String(c.score).padStart(3)}  ${c.date}  "${c.ref}"  — ${c.title.slice(0, 60)}`)
}
if (candidates.length === 0) console.log('  (겹치는 후보 없음 — 키워드/제목 확인)')
console.log('\nrelatedDocs에는 상위에서 주제 인접한 3–4개를 골라 넣는다 (파일 실재는 이미 보장됨).')
