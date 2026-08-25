#!/usr/bin/env node
// scripts/polish-article.mjs
//
// Non-interactive Gemini polish pass for a single GamerScroll/AIScroll article JSON.
// Replaces the interactive `polisher` bridge dispatch (SKILL.md Step 2c) with one
// headless `gemini -p` call. The script reads the article, sends ONLY the prose
// surfaces (title / summary / text & heading block values, plus the EN twins for
// dual-language articles) to Gemini, then writes the polished strings back in place.
// image / ad blocks, every non-prose meta field, and markdown link URLs are preserved
// by construction — the model never sees them as editable, and the URL set is verified
// after the call.
//
// Usage:
//   node scripts/polish-article.mjs <article.json> [--model <id>] [--skill <SKILL.md>] [--dry-run]
//
// Default model: gemini-3.1-pro-preview (verified available on the local OAuth CLI tier).

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_SKILL = join(homedir(), '.claude', 'skills', 'gamerscroll-article', 'SKILL.md');

function die(msg) {
  console.error(`[polish] ERROR: ${msg}`);
  process.exit(1);
}

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
let target = null;
let model = DEFAULT_MODEL;
let skillPath = DEFAULT_SKILL;
let dryRun = false;
let reuseOut = false;
let mode = null; // 'kr' | 'dual'; null = auto-detect from contentEn
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--model') model = argv[++i];
  else if (a === '--skill') skillPath = argv[++i];
  else if (a === '--mode') mode = argv[++i];
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--reuse-out') reuseOut = true;
  else if (a === '-h' || a === '--help') {
    console.log('usage: node scripts/polish-article.mjs <article.json> [--mode kr|dual] [--model id] [--skill SKILL.md] [--dry-run]');
    process.exit(0);
  } else if (a.startsWith('--')) die(`unknown flag: ${a}`);
  else target = a;
}
if (!target) die('usage: node scripts/polish-article.mjs <article.json> [--mode kr|dual] [--model id] [--dry-run]');
// check disabled
if (mode && mode !== 'kr' && mode !== 'dual') die(`--mode must be "kr" or "dual" (got: ${mode})`);

// ---- load article ---------------------------------------------------------
const articlePath = resolve(process.cwd(), target);
let art;
try {
  art = JSON.parse(readFileSync(articlePath, 'utf8'));
} catch (e) {
  die(`cannot read/parse ${articlePath}: ${e.message}`);
}
const hasEn = Array.isArray(art.contentEn) && art.contentEn.length > 0;
const dual = mode ? mode === 'dual' : hasEn;
if (dual && !hasEn) die('--mode dual requested but the article has no contentEn[] (not a dual-language article)');

// ---- load rule sources (read at runtime; never hardcode rule text) --------
function readOrDie(p, label) {
  try { return readFileSync(p, 'utf8'); }
  catch (e) { die(`cannot read ${label} (${p}): ${e.message}`); }
}
function extractH2Section(md, header) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith(header));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## (?!#)/.test(lines[i])) { end = i; break; } // stop at the next H2
  }
  return lines.slice(start, end).join('\n').trim();
}
const rubric = readOrDie(join(REPO_ROOT, 'prompts', 'polish-review.md'), 'prompts/polish-review.md');
const phrasing = extractH2Section(readOrDie(skillPath, 'SKILL.md'), '## Korean Phrasing');
if (!phrasing) die(`could not locate the "## Korean Phrasing" section in ${skillPath}`);

// ---- collect polish targets with stable keys ------------------------------
const payload = {};
const slots = []; // { key, write(value) }

function addMeta(key) {
  if (typeof art[key] === 'string' && art[key].trim()) {
    payload[key] = art[key];
    slots.push({ key, write: (v) => { art[key] = v; } });
  }
}
function addBlocks(arrName) {
  const arr = art[arrName];
  if (!Array.isArray(arr)) return;
  arr.forEach((b, i) => {
    if ((b.type === 'text' || b.type === 'heading') && typeof b.value === 'string') {
      const key = `${arrName}[${i}].${b.type}`;
      payload[key] = b.value;
      slots.push({ key, write: (v) => { arr[i].value = v; } });
    }
  });
}

addMeta('title');
addMeta('summary');
addBlocks('content');
if (dual) {
  addMeta('titleEn');
  addMeta('summaryEn');
  addBlocks('contentEn');
}
if (slots.length === 0) die('no polishable title/summary/text/heading fields found');

// markdown-link URL invariant (per Step 2c HARD RULE: keep link URLs intact)
const urlsOf = (s) => (s.match(/\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g) || []).slice().sort();
const beforeUrls = {};
for (const [k, v] of Object.entries(payload)) beforeUrls[k] = urlsOf(v);

// ---- build the prompt -----------------------------------------------------
const dualNote = dual
  ? [
      'This is a DUAL-LANGUAGE article (AIScroll AI/VibeCoding). EN is the primary rendered surface; KR is the GamerScroll mirror. Process in two reasoning steps:',
      '  (1) Polish EN first — tighten titleEn, summaryEn, and every contentEn text block to newspaper-of-record English. Facts and numbers preserved; EN headings may be sharpened but never change topic.',
      '  (2) Treat that polished EN as the source-of-truth and RECREATE the KR from scratch — never translate word-for-word. Write as a Korean reporter would under the phrasing rules below; discard the old KR sentence shapes while keeping every fact.',
      'KR<->EN parity (HARD): same set of facts/claims, same paragraph count per section, similar sentence count, and the same core claim in the titles. Do NOT add evaluative adverbs or PR flourishes the EN side does not carry (avoid e.g. 압도적, 전격, 대대적, 베일을 벗었다, ~하는 셈이다 when EN is a flat statement).',
    ].join('\n')
  : [
      'This is a KR-ONLY article (Korean is the only rendered surface; there is no EN side).',
      'Polish the existing Korean prose so it fully complies with the rules below — tighten sentence shape, remove translation-tone tells, fix verb-noun pairing. This is a POLISH of the existing draft, NOT a from-scratch rewrite: keep the same facts, section structure, and paragraph count, and only improve the wording.',
    ].join('\n');

const prompt = [
  'You are a Korean newspaper-of-record copy editor polishing one article supplied in JSON-extract form.',
  '',
  dualNote,
  '',
  'PRIORITY RUBRIC:',
  rubric,
  '',
  'KOREAN PHRASING RULES (KR side — single source of truth):',
  phrasing,
  '',
  'HARD CONSTRAINTS:',
  '- Polish ONLY the values in the INPUT object below. Return the SAME keys — none added, none dropped.',
  '- Keys ending in ".heading" may be lightly tightened only; the topic must stay intact, and KR/EN headings must mirror each other.',
  '- Preserve every markdown link exactly: keep each [text](url) URL byte-for-byte. You may rephrase the visible link text, never the URL.',
  '- Do NOT alter facts, numbers, proper nouns, or model/version strings (e.g. "Gemini 3.5 Flash", "Opus 4.7", "GPT-5.5").',
  '- Preserve paragraph breaks: keep the "\\n\\n" separators where the input has them.',
  '',
  'OUTPUT FORMAT (STRICT): return ONLY a single JSON object whose keys are exactly the INPUT keys and whose values are the polished strings. No commentary, no markdown code fences.',
  '',
  'INPUT:',
  JSON.stringify(payload, null, 2),
].join('\n');

// ---- call gemini headless -------------------------------------------------
// agy ignores piped stdin in --print mode (verified 2026-08-25: a stdin-only prompt
// comes back as "{}"), so the prompt is handed over as a file for the agent to read and
// the reply is written to a file — this also sidesteps the ~32k Windows argument cap.
const tmpDir = join(REPO_ROOT, '.tmp-polish');
mkdirSync(tmpDir, { recursive: true });
const promptPath = join(tmpDir, 'prompt.txt');
const outPath = join(tmpDir, 'out.json');
writeFileSync(promptPath, prompt, 'utf8');
let res = { stdout: '' };
if (reuseOut && existsSync(outPath)) {
  console.error(`[polish] --reuse-out: reusing ${outPath} (no model call)`);
} else {
  rmSync(outPath, { force: true });
  const instruction = `Read the instruction file at ${promptPath} and carry it out exactly. Write ONLY the resulting JSON object (no commentary, no code fences) as UTF-8 to ${outPath}. Do not print the JSON in your reply.`;
  const cmd = `agy --model "${model}" --output-format json --dangerously-skip-permissions --print-timeout 15m --print "${instruction}"`;
  res = spawnSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  if (res.error) die(`failed to spawn gemini: ${res.error.message}`);
  if (res.status !== 0) die(`gemini exited ${res.status}\n${(res.stderr || '').slice(0, 2000)}`);
}

// ---- parse model output ---------------------------------------------------
function parseModelJson(stdout) {
  let text = stdout;
  // `gemini -o json` wraps the reply in an envelope; unwrap the response field.
  try {
    const env = JSON.parse(stdout);
    if (env && typeof env === 'object' && !Array.isArray(env)) {
      if (typeof env.response === 'string') text = env.response;
      else if (typeof env.output === 'string') text = env.output;
      else if (typeof env.text === 'string') text = env.text;
      else if (Object.keys(payload).every((k) => k in env)) return env; // already our object
    }
  } catch { /* not an envelope — treat stdout as raw model text */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    text = fence[1];
  } else {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s >= 0 && e > s) text = text.slice(s, e + 1);
  }
  try { return JSON.parse(text); }
  catch (e) { die(`could not parse model JSON:\n${e.message}\n--- raw stdout (first 2KB) ---\n${stdout.slice(0, 2000)}`); }
}
const rawReply = existsSync(outPath) ? readFileSync(outPath, 'utf8') : res.stdout;
const polished = parseModelJson(rawReply);

// ---- validate before touching the file ------------------------------------
const inKeys = Object.keys(payload);
const missing = inKeys.filter((k) => !(k in polished));
if (missing.length) die(`model omitted keys: ${missing.join(', ')}`);
const extra = Object.keys(polished).filter((k) => !(k in payload));
if (extra.length) console.error(`[polish] WARN: ignoring unexpected keys from model: ${extra.join(', ')}`);
for (const k of inKeys) {
  if (typeof polished[k] !== 'string' || !polished[k].trim()) die(`model returned empty/non-string value for "${k}"`);
}
const urlIssues = [];
for (const k of inKeys) {
  const before = beforeUrls[k].join('');
  const after = urlsOf(polished[k]).join('');
  if (before !== after) urlIssues.push(`  ${k}: ${beforeUrls[k].length} link(s) -> ${urlsOf(polished[k]).length}`);
}
if (urlIssues.length) die(`markdown link URL set changed (HARD RULE violation), aborting:\n${urlIssues.join('\n')}`);

// ---- write back in place --------------------------------------------------
if (dryRun) {
  console.error('[polish] --dry-run: no file written. Preview:');
  for (const k of inKeys) {
    const v = polished[k];
    console.error(`\n### ${k}\n${v.length > 400 ? v.slice(0, 400) + ' ...' : v}`);
  }
  process.exit(0);
}
for (const s of slots) s.write(polished[s.key]);
writeFileSync(articlePath, JSON.stringify(art, null, 2) + '\n', 'utf8');
rmSync(tmpDir, { recursive: true, force: true });
console.error(`[polish] wrote ${slots.length} polished fields -> ${articlePath}`);
