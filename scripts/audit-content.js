#!/usr/bin/env node
/**
 * audit-content.js
 *
 * Browser-free, server-free pre-publish content SEO linter. Reads article JSON
 * source directly (no rendered HTML, no Lighthouse, no http.server) and runs the
 * content-level checks that don't need a browser, so it's fast enough to sweep
 * the whole catalog (~seconds) or vet a single article before publish.
 *
 * It is the cheap companion to validate-seo.js: validate-seo.js owns the Lighthouse
 * + rendered-HTML structural audits; this owns source-JSON content quality.
 *
 * Checks per article:
 *   meta/site            - `site` field present (HARD rule; missing => excluded from both builds)
 *   meta/sources         - exactly 5 sources (HARD rule)
 *   meta/related-docs    - 3-4 relatedDocs, each target JSON exists on disk
 *   meta/thumbnail       - non-empty thumbnail
 *   meta/summary-len     - summary (and summaryEn) <= 160 chars
 *   meta/dual-language   - AIScroll: titleEn/summaryEn/keywordsEn/contentEn present, keywordsEn != keywords, needTranslate false
 *   body/sections        - 4-8 sections (intro + headings)
 *   body/section-length  - each KO section <= 800 chars
 *   body/anchors         - >= 1 internal link AND >= 1 outbound link in prose
 *   content/paragraph    - no paragraph > 7 sentences (decimal-safe count)
 *   content/sentence     - language-aware: KO chars > 120 / EN words > 45
 *   content/keyphrase     - every keyphrase appears in body (noun overlap)
 *   content/subheading   - 30-75% of headings carry a keyphrase
 *   content/density      - keyphrase density in band (long-tail compounds need only 1 hit)
 *
 * Usage:
 *   node scripts/audit-content.js                      # whole catalog (approved + draft)
 *   node scripts/audit-content.js data/tech/ai/foo.json  # one or more specific files
 *   node scripts/audit-content.js --show-pass          # also print passing checks
 *   node scripts/audit-content.js --quiet              # only the rollup line
 *
 * Exit code 1 if any article has a failing check.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MORPH_SCRIPT = path.join(__dirname, 'morph_analyze.py');
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

// Thresholds mirror validate-seo.js so the two tools agree.
const DENSITY_MIN = 0.005;
const DENSITY_MAX = 0.035;
const SENTENCE_CHARS_MAX = 120;   // Korean
const SENTENCE_WORDS_MAX = 45;    // English
const PARAGRAPH_SENTENCES_MAX = 7;
const SECTION_CHARS_MAX = 800;
const SUMMARY_CHARS_MAX = 160;
const SOURCES_REQUIRED = 5;

const args = process.argv.slice(2);
const showPass = args.includes('--show-pass');
const quiet = args.includes('--quiet');
const fileArgs = args.filter((a) => !a.startsWith('--'));

function relPath(p) { return path.relative(REPO_ROOT, p).replace(/\\/g, '/'); }
function articleFiles() { return fileArgs.map((f) => path.resolve(f)); }

// --- block helpers --------------------------------------------------------
function splitKeywords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}
// Markdown link -> visible anchor text only, approximating the rendered body.
function stripMd(s) { return String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); }
function blocksOf(json, key) { return Array.isArray(json[key]) ? json[key] : []; }
function bodyText(blocks) {
  return blocks.filter((b) => b.type === 'text').map((b) => stripMd(b.value || '')).join('\n');
}
function headingTexts(blocks) {
  return blocks.filter((b) => b.type === 'heading').map((b) => String(b.value || '').trim()).filter(Boolean);
}
function paragraphs(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'text') continue;
    for (const p of String(b.value || '').split(/\n\n+/)) {
      const t = stripMd(p).trim();
      if (t) out.push(t);
    }
  }
  return out;
}
function bodyLinks(blocks) {
  const internal = [], outbound = [];
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const b of blocks) {
    if (b.type !== 'text') continue;
    let m;
    while ((m = re.exec(b.value || ''))) {
      const u = m[1];
      if (/^https?:\/\//i.test(u)) outbound.push(u);
      else if (u.startsWith('/')) internal.push(u);
    }
  }
  return { internal, outbound };
}
// [introLen, section1Len, section2Len, ...] — chars of text between headings.
function sectionCharLengths(blocks) {
  const secs = [];
  let cur = 0;
  for (const b of blocks) {
    if (b.type === 'heading') { secs.push(cur); cur = 0; }
    else if (b.type === 'text') cur += stripMd(b.value || '').length;
  }
  secs.push(cur);
  return secs;
}
// Decimal-safe sentence-terminator count (digits like 2.5 / 63.2 / $0.50 excluded).
function paragraphSentenceCount(p) {
  return (p.match(/(?<!\d)[.!?。？！]+(?!\d)/g) || []).length || 1;
}
function isKoreanText(t) {
  const hangul = (t.match(/[가-힣]/g) || []).length;
  const letters = (t.match(/[A-Za-z가-힣]/g) || []).length;
  return letters === 0 || hangul / letters >= 0.3;
}

// --- morph (Kiwi) batch ---------------------------------------------------
function morphAnalyze(texts) {
  if (texts.length === 0) return [];
  const result = spawnSync(PYTHON_BIN, [MORPH_SCRIPT], {
    input: Buffer.from(JSON.stringify({ texts }), 'utf8'),
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = (result.stderr || Buffer.alloc(0)).toString('utf8').slice(-400);
    throw new Error(`morph_analyze.py exit ${result.status}: ${err}`);
  }
  return (JSON.parse(result.stdout.toString('utf8')).results) || [];
}
function nounList(m) { return ((m && m.nouns) || []).map((n) => String(n).toLowerCase()); }
function nounSet(m) { return new Set(nounList(m)); }

// --- per-article evaluation ----------------------------------------------
function resolveRelatedDoc(ref) {
  // "tech:ai/slug" | "wiki:cat/slug" | "issue:slug" | "hotpick:slug" -> file path
  const [type, rest] = String(ref).split(':');
  if (!rest) return null;
  const map = {
    tech: path.join(REPO_ROOT, 'data', 'tech'),
    wiki: path.join(REPO_ROOT, 'data', 'wiki'),
    issue: path.join(REPO_ROOT, 'reports', 'issue'),
    hotpick: path.join(REPO_ROOT, 'reports', 'hotpick'),
    insight: path.join(REPO_ROOT, 'reports', 'insight'),
    ranking: path.join(REPO_ROOT, 'reports', 'ranking'),
  };
  const base = map[type];
  if (!base) return null;
  return `${path.join(base, rest)}.json`;
}

function densityOk(kwNouns, bodyCounts, bodyTotal) {
  if (kwNouns.length === 0) return { ok: true, ratio: null };
  const counts = kwNouns.map((n) => bodyCounts.get(n) || 0);
  const minHits = Math.min(...counts);
  const ratio = bodyTotal ? minHits / bodyTotal : 0;
  // Long-tail / compound keyphrase (>= 2 nouns): a single appearance is enough,
  // matching the skill's "long-tail passes once" rule (avoids forcing keyword
  // stuffing). Single-noun keyphrases must recur to clear the density floor.
  const ok = kwNouns.length >= 2
    ? (minHits >= 1 && ratio <= DENSITY_MAX)
    : (ratio >= DENSITY_MIN && ratio <= DENSITY_MAX);
  return { ok, ratio };
}

function evalLang(label, body, headings, keyphrases, morph, idx) {
  // morph index layout per lang: [body, ...headings, ...keyphrases]
  const checks = [];
  const bodyMorph = morph[idx.body];
  const bodyCounts = new Map();
  for (const n of nounList(bodyMorph)) bodyCounts.set(n, (bodyCounts.get(n) || 0) + 1);
  const bodyTotal = nounList(bodyMorph).length || 1;

  // keyphrase-in-body
  const kpMorphs = keyphrases.map((_, i) => morph[idx.kw[i]]);
  const missingKp = [];
  for (let i = 0; i < keyphrases.length; i++) {
    const kn = nounList(kpMorphs[i]);
    let present;
    if (kn.length === 0) {
      present = body.toLowerCase().includes(keyphrases[i].toLowerCase());
    } else {
      // Match validate-seo.js: single-noun keyphrase needs 100%, multi-noun >= 50% overlap.
      const matched = kn.filter((n) => bodyCounts.has(n)).length;
      const req = kn.length === 1 ? 1 : Math.ceil(kn.length * 0.5);
      present = matched >= req;
    }
    if (!present) missingKp.push(keyphrases[i]);
  }
  if (keyphrases.length) checks.push({
    name: `content/keyphrase-in-body[${label}]`,
    pass: missingKp.length === 0,
    detail: missingKp.length ? `missing: ${missingKp.join(', ')}` : `${keyphrases.length}/${keyphrases.length} present`,
  });

  // keyphrase-in-subheading 30-75%
  if (keyphrases.length && headings.length) {
    const headSets = headings.map((_, i) => nounSet(morph[idx.head[i]]));
    let withKp = 0;
    for (const hs of headSets) {
      const hit = kpMorphs.some((km) => {
        const kn = nounList(km);
        if (!kn.length) return false;
        const req = kn.length === 1 ? 1 : Math.ceil(kn.length * 0.5);
        return kn.filter((n) => hs.has(n)).length >= req;
      });
      if (hit) withKp++;
    }
    const pct = withKp / headings.length;
    checks.push({
      name: `content/keyphrase-in-subheading[${label}]`,
      pass: pct >= 0.30 && pct <= 0.75,
      detail: `${withKp}/${headings.length} (${Math.round(pct * 100)}%, target 30-75%)`,
    });
  }

  // density
  const densFail = [];
  for (let i = 0; i < keyphrases.length; i++) {
    const r = densityOk(nounList(kpMorphs[i]), bodyCounts, bodyTotal);
    if (!r.ok) densFail.push(keyphrases[i]);
  }
  if (keyphrases.length) checks.push({
    name: `content/density[${label}]`,
    pass: densFail.length === 0,
    detail: densFail.length ? `out of band: ${densFail.join(', ')}` : `${keyphrases.length} kp in band`,
  });

  // sentence length (language-aware)
  const sentences = (bodyMorph && bodyMorph.sentences) || [];
  let longSent, metric;
  if (isKoreanText(body)) {
    longSent = sentences.filter((s) => s.length > SENTENCE_CHARS_MAX).length;
    metric = `chars > ${SENTENCE_CHARS_MAX}`;
  } else {
    const words = (s) => (s.trim().match(/\S+/g) || []).length;
    longSent = sentences.filter((s) => words(s) > SENTENCE_WORDS_MAX).length;
    metric = `words > ${SENTENCE_WORDS_MAX}`;
  }
  if (sentences.length) checks.push({
    name: `content/sentence-length[${label}]`,
    pass: longSent === 0,
    detail: `${longSent}/${sentences.length} ${metric}`,
  });

  return checks;
}

function evalArticle(file, json, morph, morphIdx) {
  const checks = [];
  const isAiscroll = json.site === 'aiscroll';
  const koBlocks = blocksOf(json, 'content');
  const enBlocks = blocksOf(json, 'contentEn');

  // --- metadata (no morph) ---
  checks.push({ name: 'meta/site', pass: !!json.site, detail: json.site || 'MISSING (excluded from both builds)' });

  const srcN = Array.isArray(json.sources) ? json.sources.length : 0;
  checks.push({ name: 'meta/sources', pass: srcN === SOURCES_REQUIRED, detail: `${srcN} (need exactly ${SOURCES_REQUIRED})` });

  const rd = Array.isArray(json.relatedDocs) ? json.relatedDocs : [];
  const rdMissing = rd.map(resolveRelatedDoc).map((p, i) => (p && fs.existsSync(p) ? null : rd[i])).filter(Boolean);
  checks.push({
    name: 'meta/related-docs',
    pass: rd.length >= 3 && rd.length <= 4 && rdMissing.length === 0,
    detail: rd.length === 0 ? 'empty (required 3-4)' : rdMissing.length ? `dead targets: ${rdMissing.join(', ')}` : `${rd.length} ok`,
  });

  checks.push({ name: 'meta/thumbnail', pass: !!(json.thumbnail && String(json.thumbnail).trim()), detail: json.thumbnail ? 'set' : 'MISSING' });

  const sumLen = (json.summary || '').length;
  checks.push({ name: 'meta/summary-len', pass: sumLen > 0 && sumLen <= SUMMARY_CHARS_MAX, detail: `${sumLen} chars (<= ${SUMMARY_CHARS_MAX})` });

  if (isAiscroll) {
    const enSumLen = (json.summaryEn || '').length;
    const kw = splitKeywords(json.keywords).join('|');
    const kwEn = splitKeywords(json.keywordsEn).join('|');
    const dualOk = !!json.titleEn && enSumLen > 0 && enSumLen <= SUMMARY_CHARS_MAX
      && splitKeywords(json.keywordsEn).length > 0 && kw !== kwEn
      && enBlocks.length > 0 && json.needTranslate === false;
    const probs = [];
    if (!json.titleEn) probs.push('titleEn');
    if (!(enSumLen > 0 && enSumLen <= SUMMARY_CHARS_MAX)) probs.push(`summaryEn(${enSumLen})`);
    if (splitKeywords(json.keywordsEn).length === 0) probs.push('keywordsEn');
    else if (kw === kwEn) probs.push('keywordsEn==keywords');
    if (enBlocks.length === 0) probs.push('contentEn');
    if (json.needTranslate !== false) probs.push('needTranslate!=false');
    checks.push({ name: 'meta/dual-language', pass: dualOk, detail: probs.length ? probs.join(', ') : 'complete' });
  }

  // --- structure (no morph) ---
  const headings = headingTexts(koBlocks);
  const sectionCount = headings.length + 1; // + intro
  checks.push({ name: 'body/sections', pass: sectionCount >= 4 && sectionCount <= 8, detail: `${sectionCount} sections (4-8)` });

  const secLens = sectionCharLengths(koBlocks);
  const longSecs = secLens.filter((l) => l > SECTION_CHARS_MAX).length;
  checks.push({ name: 'body/section-length', pass: longSecs === 0, detail: `${longSecs}/${secLens.length} > ${SECTION_CHARS_MAX} chars` });

  const links = bodyLinks(koBlocks);
  checks.push({
    name: 'body/anchors',
    pass: links.internal.length >= 1 && links.outbound.length >= 1,
    detail: `${links.internal.length} internal, ${links.outbound.length} outbound (need >=1 each)`,
  });

  const paras = paragraphs(koBlocks);
  const longParas = paras.filter((p) => paragraphSentenceCount(p) > PARAGRAPH_SENTENCES_MAX).length;
  checks.push({ name: 'content/paragraph-length', pass: longParas === 0, detail: `${longParas}/${paras.length} > ${PARAGRAPH_SENTENCES_MAX} sentences` });

  // --- morph-backed (Kiwi) ---
  checks.push(...evalLang('ko', bodyText(koBlocks), headings, splitKeywords(json.keywords), morph, morphIdx.ko));
  if (isAiscroll && enBlocks.length) {
    checks.push(...evalLang('en', bodyText(enBlocks), headingTexts(enBlocks), splitKeywords(json.keywordsEn), morph, morphIdx.en));
  }

  return checks;
}

// --- morph batch planning -------------------------------------------------
function planMorph(articles) {
  const texts = [];
  const push = (t) => (texts.push(t || ''), texts.length - 1);
  for (const a of articles) {
    const ko = blocksOf(a.json, 'content');
    const koIdx = { body: push(bodyText(ko)), head: headingTexts(ko).map(push), kw: splitKeywords(a.json.keywords).map(push) };
    let enIdx = null;
    if (a.json.site === 'aiscroll') {
      const en = blocksOf(a.json, 'contentEn');
      if (en.length) enIdx = { body: push(bodyText(en)), head: headingTexts(en).map(push), kw: splitKeywords(a.json.keywordsEn).map(push) };
    }
    a.morphIdx = { ko: koIdx, en: enIdx || { body: -1, head: [], kw: [] } };
  }
  return texts;
}

// --- main -----------------------------------------------------------------
(function main() {
  if (fileArgs.length === 0) {
    console.error('Usage: node scripts/audit-content.js <article.json> [more.json ...] [--show-pass]');
    console.error('Pre-publish content linter for a single article (or a few).');
    process.exit(2);
  }
  const files = articleFiles();
  const articles = [];
  for (const file of files) {
    let json;
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error(`  SKIP ${relPath(file)} — invalid JSON`); continue; }
    articles.push({ file, json });
  }
  if (articles.length === 0) { console.log('No articles found.'); process.exit(0); }

  const texts = planMorph(articles);
  if (!quiet) process.stderr.write(`[audit-content] morph-analyzing ${texts.length} texts across ${articles.length} articles...\n`);
  const t0 = Date.now();
  let morph;
  try { morph = morphAnalyze(texts); }
  catch (e) { console.error(`morph failed: ${e.message}`); process.exit(2); }
  if (!quiet) process.stderr.write(`[audit-content] morph done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  // Soft/quality checks are warnings (advisory, tone-preserving); everything
  // else is a blocking policy/structure failure. Exit code reflects blocking only.
  const isWarn = (name) => /^(content\/density|content\/keyphrase-in-subheading|content\/sentence-length|content\/paragraph-length|body\/sections|body\/section-length)/.test(name);
  const single = fileArgs.length > 0;
  const failCounts = new Map();
  let blockingArticles = 0;
  let warnOnlyArticles = 0;

  for (const a of articles) {
    const checks = evalArticle(a.file, a.json, morph, a.morphIdx);
    const fails = checks.filter((c) => !c.pass);
    for (const c of fails) failCounts.set(c.name, (failCounts.get(c.name) || 0) + 1);
    const blockFails = fails.filter((c) => !isWarn(c.name));
    const warnFails = fails.filter((c) => isWarn(c.name));
    if (blockFails.length) blockingArticles++;
    else if (warnFails.length) warnOnlyArticles++;
    if (quiet) continue;
    // Single-file: always print. Catalog: only articles with blocking fails (or --show-pass),
    // so a 290-article sweep stays readable; per-check breakdown carries the rest.
    if (!single && !showPass && blockFails.length === 0) continue;
    if (single && fails.length === 0 && !showPass) { console.log(`\n✓ ${relPath(a.file)} — all checks pass`); continue; }
    const tag = blockFails.length ? '✗' : warnFails.length ? '!' : '✓';
    console.log(`\n${tag} ${relPath(a.file)}`);
    for (const c of checks) {
      if (c.pass && !showPass) continue;
      const lbl = c.pass ? 'PASS' : isWarn(c.name) ? 'WARN' : 'FAIL';
      console.log(`    [${lbl}] ${c.name}  -- ${c.detail}`);
    }
  }

  const sorted = [...failCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n${'-'.repeat(56)}`);
  if (sorted.length) {
    console.log('checks failing (articles affected):');
    for (const [name, n] of sorted) console.log(`  ${isWarn(name) ? 'WARN' : 'FAIL'}  ${String(n).padStart(4)}  ${name}`);
    console.log(`${'-'.repeat(56)}`);
  }
  const clean = articles.length - blockingArticles - warnOnlyArticles;
  console.log(`audited ${articles.length} | clean ${clean} | blocking ${blockingArticles} | warn-only ${warnOnlyArticles}`);
  process.exit(blockingArticles > 0 ? 1 : 0);
})();
