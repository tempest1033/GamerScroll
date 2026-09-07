#!/usr/bin/env node
// Set or clear the `noindex` flag on magazine article JSONs (reports/<type>/<slug>.json).
//
// Usage:
//   node scripts/set-noindex.mjs --type issue --from <slugs.json>      # JSON array of slugs
//   node scripts/set-noindex.mjs --type issue slug-a slug-b [--unset]
//
// The GamerScroll builder emits <meta name="robots" content="noindex, follow">
// for flagged articles and drops them from sitemap.xml and rss.xml. Pages stay
// built and linked, so the flag is reversible with --unset.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TYPES = ['issue', 'insight', 'hotpick', 'ranking']

function parseArgs(argv) {
  const opts = { type: null, from: null, unset: false, slugs: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--type') opts.type = argv[++i]
    else if (a === '--from') opts.from = argv[++i]
    else if (a === '--unset') opts.unset = true
    else opts.slugs.push(a)
  }
  return opts
}

// Keep the file's BOM, line endings, and trailing newline; place `noindex` right after `status`.
function rewrite(file, set) {
  const raw = readFileSync(file, 'utf8')
  const bom = raw.charCodeAt(0) === 0xFEFF ? '\uFEFF' : ''
  const text = bom ? raw.slice(1) : raw
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const trailing = /\r?\n$/.test(text) ? eol : ''
  const data = JSON.parse(text)
  if (set ? data.noindex === true : !('noindex' in data)) return false

  const out = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'noindex') continue
    out[key] = value
    if (set && key === 'status') out.noindex = true
  }
  if (set && !('noindex' in out)) out.noindex = true

  writeFileSync(file, bom + JSON.stringify(out, null, 2).replace(/\n/g, eol) + trailing, 'utf8')
  return true
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!TYPES.includes(opts.type)) {
    console.error(`--type must be one of ${TYPES.join('|')}`)
    process.exit(1)
  }
  const slugs = [...opts.slugs]
  if (opts.from) slugs.push(...JSON.parse(readFileSync(opts.from, 'utf8')))
  if (slugs.length === 0) {
    console.error('no slugs given (positional or --from <slugs.json>)')
    process.exit(1)
  }

  const dir = path.join(ROOT, 'reports', opts.type)
  let changed = 0
  let missing = 0
  for (const slug of slugs) {
    const file = path.join(dir, `${slug}.json`)
    if (!existsSync(file)) {
      console.warn(`missing: ${slug}`)
      missing++
      continue
    }
    if (rewrite(file, !opts.unset)) changed++
  }
  console.log(`${opts.unset ? 'unset' : 'set'} noindex (${opts.type}): ${changed} changed, ${slugs.length - changed - missing} unchanged, ${missing} missing`)
}

main()
