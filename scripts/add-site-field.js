/**
 * Re-applies site:"aiscroll"/"gamerscroll" field to article JSONs.
 * Rule: presence in AIScroll build → aiscroll, otherwise → gamerscroll.
 *
 *   node scripts/add-site-field.js --dry-run
 *   node scripts/add-site-field.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

const EXTRA = {
  issue: new Set([
    'gpt-5-3-garlic-update-rumor',
    'chatgpt-vs-gemini-comparison-2026',
    'gemini-3-hallucination-memory-overfitting',
    'seedance-2-hollywood-shock-next-version',
    'deepseek-v4-launch-march-2026',
    'apple-march-2026-macbook-neo-ai'
  ]),
  wiki: new Set([
    'business/google-genie3-unity-stock-crash',
    'knowledge/kurzweil-singularity-review-2026'
  ]),
  hotpick: new Set(['mac-mini-m4-best-value-2026'])
};

const stats = { aiscroll_added: 0, gamerscroll_added: 0, unchanged: 0, errors: [] };

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  if (DRY_RUN) return;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function patch(filePath, site) {
  try {
    const data = readJson(filePath);
    if (data.site === site) { stats.unchanged++; return; }
    data.site = site;
    writeJson(filePath, data);
    stats[`${site}_added`]++;
  } catch (e) {
    stats.errors.push({ file: path.relative(ROOT, filePath), error: e.message });
  }
}

for (const sub of ['ai', 'vibecoding']) {
  const dir = path.join(ROOT, 'data', 'tech', sub);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    patch(path.join(dir, f), 'aiscroll');
  }
}

const normalDir = path.join(ROOT, 'data', 'tech', 'normal');
if (fs.existsSync(normalDir)) {
  for (const f of fs.readdirSync(normalDir)) {
    if (!f.endsWith('.json')) continue;
    patch(path.join(normalDir, f), 'gamerscroll');
  }
}

const issueDir = path.join(ROOT, 'reports', 'issue');
if (fs.existsSync(issueDir)) {
  for (const f of fs.readdirSync(issueDir)) {
    if (!f.endsWith('.json')) continue;
    const filePath = path.join(issueDir, f);
    try {
      const data = readJson(filePath);
      const slug = data.slug || f.replace(/\.json$/, '');
      const site = (data.isGlobal === true || EXTRA.issue.has(slug)) ? 'aiscroll' : 'gamerscroll';
      if (data.site === site) { stats.unchanged++; continue; }
      data.site = site;
      writeJson(filePath, data);
      stats[`${site}_added`]++;
    } catch (e) {
      stats.errors.push({ file: path.relative(ROOT, filePath), error: e.message });
    }
  }
}

const wikiDir = path.join(ROOT, 'data', 'wiki');
if (fs.existsSync(wikiDir)) {
  for (const cat of fs.readdirSync(wikiDir)) {
    const catDir = path.join(wikiDir, cat);
    let stat; try { stat = fs.statSync(catDir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    for (const f of fs.readdirSync(catDir)) {
      if (!f.endsWith('.json')) continue;
      const slug = f.replace(/\.json$/, '');
      const site = EXTRA.wiki.has(`${cat}/${slug}`) ? 'aiscroll' : 'gamerscroll';
      patch(path.join(catDir, f), site);
    }
  }
}

const hotpickDir = path.join(ROOT, 'reports', 'hotpick');
if (fs.existsSync(hotpickDir)) {
  for (const f of fs.readdirSync(hotpickDir)) {
    if (!f.endsWith('.json')) continue;
    const slug = f.replace(/\.json$/, '');
    const site = EXTRA.hotpick.has(slug) ? 'aiscroll' : 'gamerscroll';
    patch(path.join(hotpickDir, f), site);
  }
}

console.log(JSON.stringify({ dryRun: DRY_RUN, stats }, null, 2));
