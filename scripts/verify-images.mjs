#!/usr/bin/env node
// verify-images.mjs — 기사 JSON의 thumbnail + 본문 image.src를 wsrv.nl 프록시로 일괄 검증.
//
// 스킬 워크플로의 수작업 curl 체크(Windows /dev/null 함정 포함)를 대체한다:
//   node scripts/verify-images.mjs <article.json> [...more.json]
//
// 판정: HTTP 200 + body > 1000 bytes = PASS.
//   - 4xx/5xx           → FAIL (업스트림이 프록시 경유 404를 반환하는 케이스 포함)
//   - 200 + ~79 bytes   → FAIL (wsrv silent empty body)
// 로컬 경로(/assets/...)는 빌드 파이프라인이 처리하므로 SKIP.
// exit 0 = 전부 통과, exit 1 = 실패 존재.

import { readFileSync } from 'node:fs'

const MIN_BYTES = 1000

function collectImageUrls(json) {
  const urls = []
  if (json.thumbnail) urls.push({ field: 'thumbnail', url: json.thumbnail })
  for (const key of ['content', 'contentEn']) {
    const blocks = Array.isArray(json[key]) ? json[key] : []
    blocks.forEach((b, i) => {
      if (b && b.type === 'image' && b.src) urls.push({ field: `${key}[${i}]`, url: b.src })
    })
  }
  return urls
}

async function checkViaProxy(url) {
  const proxied = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=960&output=webp`
  try {
    const res = await fetch(proxied, { redirect: 'follow' })
    const buf = await res.arrayBuffer()
    return { status: res.status, bytes: buf.byteLength }
  } catch (e) {
    return { status: 0, bytes: 0, error: e?.message || String(e) }
  }
}

async function main() {
  const files = process.argv.slice(2).filter(a => !a.startsWith('-'))
  if (files.length === 0) {
    console.error('usage: node scripts/verify-images.mjs <article.json> [...more.json]')
    process.exit(2)
  }

  let failures = 0
  for (const file of files) {
    let json
    try { json = JSON.parse(readFileSync(file, 'utf8')) } catch (e) {
      console.error(`FAIL  ${file} — JSON parse error: ${e.message}`)
      failures++
      continue
    }
    const targets = collectImageUrls(json)
    if (targets.length === 0) {
      console.log(`WARN  ${file} — 이미지 필드 없음 (thumbnail/body image 미기재)`)
      continue
    }
    console.log(`\n${file} — ${targets.length}개 이미지 검증`)
    const results = await Promise.all(targets.map(async t => ({ ...t, ...(t.url.startsWith('/')
      ? { skip: true }
      : await checkViaProxy(t.url)) })))
    for (const r of results) {
      if (r.skip) {
        console.log(`  SKIP  ${r.field} — 로컬 경로 (${r.url})`)
        continue
      }
      const ok = r.status === 200 && r.bytes >= MIN_BYTES
      if (!ok) failures++
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.field} — ${r.status} ${r.bytes}B ${r.error ? `(${r.error})` : ''} ${r.url.slice(0, 90)}`)
    }
  }

  console.log(failures === 0 ? '\n모든 이미지 프록시 검증 통과' : `\n실패 ${failures}건 — 다른 업스트림으로 교체 후 재검증`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
