#!/usr/bin/env node
/**
 * audit-meta-keywords.js
 *
 * Scan every article JSON under data/ and reports/, compute the fraction of
 * declared keywords that appear in title + description.
 *
 * Default mode: substring match (fast, but high false-positive on long-tail
 * keywords that legitimately live in body, not title).
 * `--morph`: kiwipiepy noun overlap match — single-noun keyphrases require 100%
 * match, multi-noun keyphrases require >= overlap (default 0.5). Recommended
 * for true SEO audit (proven 5/277 flagged, ~3 s on 277 articles).
 *
 * Usage:
 *   node scripts/audit-meta-keywords.js [--min 0.3] [--show-pass]
 *   node scripts/audit-meta-keywords.js --morph [--overlap 0.5]
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ROOTS = [
  path.join(REPO_ROOT, 'data', 'tech', 'ai'),
  path.join(REPO_ROOT, 'data', 'tech', 'vibecoding'),
  path.join(REPO_ROOT, 'data', 'tech', 'normal'),
  path.join(REPO_ROOT, 'data', 'wiki'),
  path.join(REPO_ROOT, 'reports', 'ranking'),
  path.join(REPO_ROOT, 'reports', 'issue'),
  path.join(REPO_ROOT, 'reports', 'hotpick'),
  path.join(REPO_ROOT, 'reports', 'insight'),
];

const args = process.argv.slice(2);
let minRatio = 0.30;
let showPass = false;
let useMorph = false;
let morphOverlap = 0.50; // multi-noun keyword passes when >= 50% of its nouns appear in meta
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min') minRatio = Number(args[++i]);
  else if (args[i] === '--show-pass') showPass = true;
  else if (args[i] === '--morph') useMorph = true;
  else if (args[i] === '--overlap') morphOverlap = Number(args[++i]);
}

function* walkJson(root) {
  if (!fs.existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith('.json')) yield full;
    }
  }
}

function splitKeywords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

function ratioInText(keywords, text) {
  if (keywords.length === 0) return null;
  const haystack = (text || '').toLowerCase();
  const hits = keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
  return { hits: hits.length, total: keywords.length, missed: keywords.filter((kw) => !haystack.includes(kw.toLowerCase())) };
}

function loadEntries() {
  const entries = [];
  for (const root of ROOTS) {
    for (const file of walkJson(root)) {
      let json;
      try { json = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch { continue; }
      if (json.status && json.status !== 'approved' && json.status !== 'draft') continue;
      const koKeywords = splitKeywords(json.keywords);
      if (koKeywords.length > 0) {
        entries.push({ file, lang: 'ko', keywords: koKeywords, text: `${json.title || ''} ${json.summary || ''}`.trim() });
      }
      const enKeywords = splitKeywords(json.keywordsEn);
      if (enKeywords.length > 0) {
        entries.push({ file, lang: 'en', keywords: enKeywords, text: `${json.titleEn || ''} ${json.summaryEn || ''}`.trim() });
      }
    }
  }
  return entries;
}

function relPath(p) {
  return path.relative(REPO_ROOT, p).replace(/\\/g, '/');
}

async function runSubstring() {
  const entries = loadEntries();
  const failures = [];
  const passes = [];
  const fileSet = new Set();
  for (const e of entries) {
    fileSet.add(e.file);
    const r = ratioInText(e.keywords, e.text);
    const ratio = r.hits / r.total;
    const row = { file: relPath(e.file), lang: e.lang, hits: r.hits, total: r.total, ratio, missed: r.missed };
    if (ratio < minRatio) failures.push(row);
    else passes.push(row);
  }
  return { failures, passes, totalFiles: fileSet.size };
}

function morphAnalyzeAll(texts) {
  if (texts.length === 0) return [];
  const { spawnSync } = require('node:child_process');
  const morphScript = path.join(__dirname, 'morph_analyze.py');
  const pyBin = process.env.PYTHON_BIN || 'python';
  const result = spawnSync(pyBin, [morphScript], {
    input: Buffer.from(JSON.stringify({ texts }), 'utf8'),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = (result.stderr || Buffer.alloc(0)).toString('utf8').slice(-400);
    throw new Error(`morph_analyze.py exit ${result.status}: ${err}`);
  }
  const json = JSON.parse(result.stdout.toString('utf8'));
  return json.results || [];
}

function lowerSet(arr) {
  const s = new Set();
  for (const v of arr) s.add(String(v).toLowerCase());
  return s;
}

async function runMorph() {
  const entries = loadEntries();
  const fileSet = new Set();
  const allTexts = [];
  for (const e of entries) {
    fileSet.add(e.file);
    e._textIdx = allTexts.length;
    allTexts.push(e.text);
    e._kwStart = allTexts.length;
    for (const kw of e.keywords) allTexts.push(kw);
  }
  process.stderr.write(`[audit] morph-analyzing ${allTexts.length} texts (${entries.length} entries / ${fileSet.size} articles)\n`);
  const t0 = Date.now();
  const morph = morphAnalyzeAll(allTexts);
  process.stderr.write(`[audit] morph done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const failures = [];
  const passes = [];
  for (const e of entries) {
    const metaNouns = lowerSet((morph[e._textIdx]?.nouns) || []);
    let hits = 0;
    const missed = [];
    for (let i = 0; i < e.keywords.length; i++) {
      const kwNouns = ((morph[e._kwStart + i]?.nouns) || []).map((s) => s.toLowerCase());
      if (kwNouns.length === 0) {
        // Keyword has no extractable nouns (e.g. all-particle or all-symbol); fall back to substring.
        const kwLower = e.keywords[i].toLowerCase();
        if (e.text.toLowerCase().includes(kwLower)) hits++;
        else missed.push(e.keywords[i]);
        continue;
      }
      const matched = kwNouns.filter((n) => metaNouns.has(n)).length;
      const required = kwNouns.length === 1 ? 1 : Math.ceil(kwNouns.length * morphOverlap);
      if (matched >= required) hits++;
      else missed.push(e.keywords[i]);
    }
    const ratio = hits / e.keywords.length;
    const row = { file: relPath(e.file), lang: e.lang, hits, total: e.keywords.length, ratio, missed };
    if (ratio < minRatio) failures.push(row);
    else passes.push(row);
  }
  return { failures, passes, totalFiles: fileSet.size };
}

(async () => {
const { failures, passes, totalFiles } = useMorph
  ? await runMorph()
  : await runSubstring();
const total = totalFiles;

failures.sort((a, b) => a.ratio - b.ratio || a.file.localeCompare(b.file));

const mode = useMorph ? `morph (overlap=${morphOverlap})` : 'substring';
console.log(`\nAudited ${total} articles via ${mode}. Threshold: keyword-in-meta >= ${(minRatio * 100).toFixed(0)}%.\n`);
if (showPass) {
  for (const p of passes) {
    console.log(`  PASS [${p.lang}] ${p.file}  -- ${p.hits}/${p.total} (${(p.ratio * 100).toFixed(0)}%)`);
  }
  console.log('');
}
if (failures.length === 0) {
  console.log('No flagged articles.');
} else {
  console.log(`Flagged: ${failures.length}\n`);
  for (const f of failures) {
    const sample = f.missed.slice(0, 4).join(', ');
    const extra = f.missed.length > 4 ? ` (+${f.missed.length - 4})` : '';
    console.log(`  [${f.lang}] ${f.file}  -- ${f.hits}/${f.total} (${(f.ratio * 100).toFixed(0)}%)`);
    console.log(`        miss: ${sample}${extra}`);
  }
}
process.exit(failures.length > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
