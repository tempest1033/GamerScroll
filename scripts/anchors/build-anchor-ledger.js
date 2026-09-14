'use strict';

// Rebuild docs/research/anchors/{anchors.jsonl,sources.json} from
//   1) the two legacy 2026-09-10 research JSON files (one-time import, kept for provenance)
//   2) every docs/research/anchors/manual/*.json file (ongoing monthly additions)
// Deterministic: re-running produces the same ledger. Rows are never edited in place;
// corrections go into a manual file with the same id, which overrides the legacy row.
const fs = require('node:fs');
const path = require('node:path');
const S = require('./lib/anchor-schema');

const LEGACY_A = path.join(S.ROOT, 'docs/research/game-revenue-benchmarks-2026-09-10.json');
const LEGACY_B = path.join(S.ROOT, 'docs/research/major-market-revenue-anchors-2026-09-10.json');
const LEGACY_DATE = '2026-09-10';
const storeMap = { app_store: 'app_store', ios: 'app_store', google_play: 'google_play', android: 'google_play', one_store: 'one_store', unconfirmed_for_this_report: 'unconfirmed' };
const monthRange = m => { const [y, mo] = m.split('-').map(Number); const end = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return { kind: 'month', start: `${m}-01`, end: `${m}-${String(end).padStart(2, '0')}` }; };
const qual = q => q === 'nearly' ? 'nearly' : q === 'more_than' || q === '>' ? 'more_than' : q === 'approximately' ? 'approximately' : null;

function importLegacyA(a, sources) {
  for (const [k, v] of Object.entries(a.sources)) sources[k] = { ...v, imported_from: 'game-revenue-benchmarks-2026-09-10.json' };
  const rows = [];
  const base = (o, extra) => ({ game: o.game, provider: a.sources[o.source]?.provider || 'unknown', source_id: o.source,
    currency: 'USD', unit_multiplier: 1e6, amount: o.amount, qualifier: qual(o.qualifier), added_on: LEGACY_DATE,
    identity_status: o.identity_status ? 'unresolved' : undefined, flags: [o.status, o.note].filter(Boolean),
    legacy_ref: 'game-revenue-benchmarks-2026-09-10.json', ...evidencePolicy(o.status), ...extra });
  for (const o of a.monthly_global.observations) rows.push(base(o, { geography: 'WW', stores: ['app_store', 'google_play'], period: monthRange(o.month), metric: 'consumer_spend', fee_basis: 'gross' }));
  for (const o of a.regional_spending.observations) rows.push(base(o, { geography: o.country, stores: o.stores.map(s => storeMap[s]),
    period: o.month ? monthRange(o.month) : { kind: 'unresolved', label: o.period_label }, metric: 'consumer_spend', fee_basis: 'gross',
    notes: o.overlaps }));
  for (const o of a.global_weekly.observations) rows.push(base(o, { geography: 'WW', stores: ['app_store', 'google_play'], period: { kind: 'week', label: 'first week of September 2026' }, metric: 'consumer_spend', fee_basis: 'gross', notes: `published rank ${o.reported_period_rank}` }));
  for (const o of a.global_daily.observations) rows.push(base(o, { geography: 'WW', stores: ['app_store', 'google_play'], period: { kind: 'day', start: o.date, end: o.date }, metric: 'consumer_spend', fee_basis: 'gross', flags: ['timezone unspecified'] }));
  for (const o of a.korea_cumulative_pending.observations) rows.push(base(o, { geography: 'KR', stores: ['app_store', 'google_play'], period: { kind: 'cumulative', start: o.release_date, end: null, label: o.period_label }, metric: 'consumer_spend', fee_basis: 'unspecified' }));
  for (const o of a.us_store_weekly_peaks_pending.observations) rows.push(base(o, { geography: 'US', stores: [storeMap[o.store]], period: { kind: 'week', label: o.period_label }, metric: 'weekly_peak', fee_basis: 'unspecified',
    store_ids: o.store === 'app_store' ? { ios: [o.app_id], aos: [] } : { ios: [], aos: [o.app_id] } }));
  for (const o of a.issuer_financials_separate.observations) rows.push(base(o, { geography: 'WW', stores: ['app_store', 'google_play', 'web_shop'], period: { kind: 'quarter', start: '2026-04-01', end: '2026-06-30', label: 'Q2 2026 issuer filing' }, metric: 'issuer_revenue', fee_basis: 'unspecified' }));
  return rows;
}

function importLegacyB(b, sources) {
  for (const [k, v] of Object.entries(b.sources)) sources[k] = { ...v, imported_from: 'major-market-revenue-anchors-2026-09-10.json' };
  const rows = [];
  for (const g of b.amount_groups) {
    const col = name => g.columns.indexOf(name);
    const fee = g.fee_basis === 'gross' || g.fee_basis === 'gross_player_spending_as_described' ? 'gross' : 'unspecified';
    for (const r of g.rows) {
      const game = r[col('game_as_published')];
      const amount = r[col('amount')];
      const period = g.period ? (g.period.start && g.period.end ? { kind: g.period.kind || periodKind(g.period.start, g.period.end), start: g.period.start, end: g.period.end, label: g.period.label || null }
        : { kind: g.period.start && !g.period.end ? 'ytd' : 'unresolved', start: g.period.start || null, end: null, label: g.period.label || null })
        : col('period_start') >= 0 ? { kind: 'month', start: r[col('period_start')], end: r[col('period_end')] } : { kind: 'unresolved' };
      const notes = [col('published_rank') >= 0 ? `published rank ${r[col('published_rank')]}` : null, col('derivation') >= 0 && r[col('derivation')] ? `derived: ${r[col('derivation')]}` : null, col('week_label') >= 0 ? r[col('week_label')] : null].filter(Boolean).join('; ') || undefined;
      rows.push({ game, geography: g.country === 'GLOBAL' ? 'WW' : g.country, stores: g.stores.map(s => storeMap[s] || s), period, amount, currency: g.currency,
        unit_multiplier: g.unit_multiplier, metric: col('week_label') >= 0 ? 'weekly_peak' : 'consumer_spend', fee_basis: fee,
        qualifier: qual(col('operator') >= 0 ? r[col('operator')] : null), provider: b.sources[g.source]?.provider || 'unknown', source_id: g.source,
        flags: [g.eligibility].filter(Boolean), ...evidencePolicy(g.eligibility), notes, added_on: LEGACY_DATE, legacy_ref: `major-market-revenue-anchors-2026-09-10.json#${g.id}` });
    }
  }
  return rows;
}

function evidencePolicy(status) {
  if (!status) return { evidence_role: 'benchmark', review_status: 'clear' };
  const policy = require('./lib/legacy-evidence-status.json')[status];
  if (!policy) throw new Error(`Unmapped legacy evidence status: ${status}`);
  return { ...policy };
}

function periodKind(start, end) {
  if (start === end) return 'day';
  const startDate = new Date(`${start}T00:00:00Z`);
  const lastDay = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  if (start.endsWith('-01') && end === lastDay) return 'month';
  if (start.endsWith('-01-01') && end === `${start.slice(0, 4)}-12-31`) return 'year';
  return 'range';
}

function importMarketEvidence(relative, sources, addedOn) {
  const evidence = JSON.parse(fs.readFileSync(path.join(S.ROOT, relative), 'utf8'));
  for (const [id, source] of Object.entries(evidence.sources)) {
    if (sources[id] && sources[id].url !== source.url) throw new Error(`Conflicting source ${id}`);
    sources[id] = source;
  }
  return [...evidence.monthlyMarkets.map(row => ({ ...row, metric: 'market_total',
    period: { kind: 'month', ...evidence.period } })),
  ...evidence.subperiodAmounts.map(row => ({ ...row,
    period: { kind: 'range', ...evidence.sources[row.source].period } }))].map(row => {
    const source = evidence.sources[row.source];
    return {
      game: row.game || '(market)', geography: row.geography || source.geography,
      stores: row.stores || source.stores, period: row.period,
      amount: row.amount, currency: evidence.currency, unit_multiplier: 1e6,
      metric: row.metric, fee_basis: source.feeBasis, tax_basis: source.taxBasis || 'unspecified',
      qualifier: row.qualifier || null, provider: source.provider, source_id: row.source,
      evidence_role: 'benchmark', review_status: 'clear',
      added_on: addedOn, notes: row.derivation || source.amountEvidence,
      legacy_ref: relative
    };
  });
}

function applySourceRevisions(sources, revisions) {
  const updated = { ...sources };
  for (const [url, modified] of revisions) {
    if (typeof modified !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(modified)
      || modified < '0001-01-01' || !Number.isFinite(Date.parse(`${modified}T00:00:00Z`))
      || new Date(`${modified}T00:00:00Z`).toISOString().slice(0, 10) !== modified) {
      throw new Error(`Invalid source revision date for ${url}: ${modified}`);
    }
    const ids = Object.keys(updated).filter(id => updated[id].url === url);
    if (!ids.length) throw new Error(`Source revision URL is not registered: ${url}`);
    for (const id of ids) {
      const previous = updated[id].page_modified_on || '';
      updated[id] = { ...updated[id], page_modified_on: previous > modified ? previous : modified };
    }
  }
  return updated;
}

function main() {
  let sources = {};
  const sourceRevisions = [];
  let rows = [];
  if (fs.existsSync(LEGACY_A)) rows.push(...importLegacyA(JSON.parse(fs.readFileSync(LEGACY_A, 'utf8')), sources));
  if (fs.existsSync(LEGACY_B)) rows.push(...importLegacyB(JSON.parse(fs.readFileSync(LEGACY_B, 'utf8')), sources));
  rows = rows.map(S.normalize);
  const byId = new Map();
  function addRow(r) {
    if (!byId.has(r.id)) { byId.set(r.id, r); return; }
    const prior = byId.get(r.id);
    if (prior.amount * prior.unit_multiplier !== r.amount * r.unit_multiplier) {
      throw new Error(`Conflicting amounts for complete observation scope ${r.id}`);
    }
    prior.provenance_refs = [...new Set([...(prior.provenance_refs || []),
      prior.legacy_ref, prior.manual_file, r.legacy_ref, r.manual_file].filter(Boolean))];
    prior.legacy_ids = [...new Set([...(prior.legacy_ids || []), ...(r.legacy_ids || [])])];
  }
  for (const r of rows) {
    addRow(r);
  }
  const manualFiles = fs.existsSync(S.MANUAL_DIR) ? fs.readdirSync(S.MANUAL_DIR).filter(f => f.endsWith('.json')).sort() : [];
  for (const f of manualFiles) {
    const m = JSON.parse(fs.readFileSync(path.join(S.MANUAL_DIR, f), 'utf8'));
    sourceRevisions.push(...Object.entries(m.source_revisions || {}));
    for (const [k, v] of Object.entries(m.sources || {})) { if (sources[k] && sources[k].url !== v.url) throw new Error(`source id ${k} reused with different url in ${f}`); sources[k] = v; }
    if (m.market_evidence_file) {
      for (const raw of importMarketEvidence(m.market_evidence_file, sources, m.added_on)) {
        addRow(S.normalize({ ...raw, manual_file: f }));
      }
    }
    // compact_rows: [source_id, "YYYY-MM", game, amount, qualifier] expanded with row_defaults (monthly figures).
    const compact = (m.compact_rows || []).map(([source_id, month, game, amount, qualifier]) =>
      ({ ...(m.row_defaults || {}), source_id, game, amount, qualifier: qualifier ?? null, period: monthRange(month) }));
    // row_defaults also fill fields a plain row leaves out (period labels shared by a whole file).
    const plain = (m.rows || []).map(raw => ({ ...(m.row_defaults || {}), ...raw }));
    for (const raw of [...plain, ...compact]) {
      const source = sources[raw.source_id] || {};
      const r = S.normalize({ evidence_role: source.evidence_role, review_status: source.review_status,
        ...raw, added_on: raw.added_on || m.added_on, manual_file: f });
      addRow(r);
    }
  }
  sources = applySourceRevisions(sources, sourceRevisions);
  const all = [...byId.values()];
  // Same amount for the same game/geo/period/metric republished by another outlet is one observation.
  const seen = new Map();
  for (const r of all) {
    const key = JSON.stringify([r.provider, r.game_key, r.geography, r.period.kind, r.period.start,
      r.period.end, r.period.start && r.period.end ? null : r.period.label, r.metric, r.amount * r.unit_multiplier, r.currency,
      r.stores, r.fee_basis, r.tax_basis, r.qualifier]);
    if (seen.has(key)) {
      const primary = seen.get(key);
      primary.overlaps_with = [...new Set([...primary.overlaps_with, r.id])];
      r.overlaps_with = [...new Set([...r.overlaps_with, primary.id])];
      r.duplicate_of = primary.id;
      r.fit = { usable: false, reasons: [`duplicate_of:${primary.id}`] };
    } else seen.set(key, r);
  }
  for (const row of all) {
    row.overlaps_with = [...new Set(row.overlaps_with.flatMap(id => {
      const resolved = S.resolveAnchorId(all, id);
      return resolved.status === 'resolved' ? resolved.ids : [id];
    }))];
  }
  const errors = all.flatMap(r => S.validate(r, sources).map(e => `${r.id}: ${e}`));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  S.writeSources(sources);
  const sorted = S.writeLedger(all);
  const usable = sorted.filter(r => r.fit.usable);
  console.log(JSON.stringify({ rows: sorted.length, usable: usable.length, sources: Object.keys(sources).length, manualFiles,
    usableByGeoMonth: usable.reduce((acc, r) => { const k = `${r.geography} ${r.period.start?.slice(0, 7)}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {}) }, null, 2));
}
module.exports = { applySourceRevisions };
if (require.main === module) main();
