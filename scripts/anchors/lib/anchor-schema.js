'use strict';

// Revenue anchor ledger: one row per published amount observation.
// Rows are inputs for internal calibration only; nothing here is published on the site.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const LEDGER_DIR = path.join(ROOT, 'docs', 'research', 'anchors');
const LEDGER = path.join(LEDGER_DIR, 'anchors.jsonl');
const SOURCES = path.join(LEDGER_DIR, 'sources.json');
const MANUAL_DIR = path.join(LEDGER_DIR, 'manual');

const STORES = new Set(['app_store', 'google_play', 'one_store', 'android_third_party', 'web_shop', 'unconfirmed']);
const PERIOD_KINDS = new Set(['month', 'week', 'day', 'range', 'quarter', 'year', 'ytd', 'cumulative', 'unresolved']);
// downloads: install counts (currency COUNT, amount in millions via unit_multiplier 1e6); no fee basis applies.
const METRICS = new Set(['consumer_spend', 'weekly_peak', 'publisher_total', 'market_total', 'issuer_revenue', 'downloads']);
const FEE = new Set(['gross', 'net', 'unspecified']);
const QUALIFIERS = new Set([null, 'more_than', 'less_than', 'approximately', 'nearly']);
const CURRENCIES = new Set(['USD', 'KRW', 'CNY', 'JPY', 'EUR', 'COUNT']);

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

function legacyId(row) {
  const p = row.period.start || slug(row.period.label || row.period.kind);
  return `${row.source_id}:${slug(row.game)}:${row.geography}:${p}:${row.metric}`.toLowerCase();
}

function makeId(row) {
  const period = row.period || {};
  const scope = [
    row.source_id, slug(row.game), row.geography,
    period.kind, period.start || slug(period.label || 'unresolved'), period.end || 'open',
    row.metric, [...new Set(row.stores || [])].sort().join('+') || 'unknown-store',
    row.currency, row.fee_basis, row.tax_basis || 'unspecified', row.qualifier || 'point'
  ];
  return `v2:${scope.join(':')}`.toLowerCase();
}

function resolveAnchorId(rows, id) {
  const exact = rows.filter(row => row.id === id);
  const matches = exact.length ? exact : rows.filter(row => (row.legacy_ids || []).includes(id));
  return { status: matches.length === 1 ? 'resolved' : matches.length ? 'ambiguous' : 'missing',
    ids: matches.map(row => row.id) };
}

// Observation-level eligibility only; geographic/temporal panel alignment is separate.
function fitEligibility(row) {
  const reasons = [];
  if (row.duplicate_of) reasons.push(`duplicate_of:${row.duplicate_of}`);
  if (!['benchmark', 'candidate'].includes(row.evidence_role)) reasons.push(`evidence_role:${row.evidence_role}`);
  if (row.review_status !== 'clear') reasons.push(`review_status:${row.review_status}`);
  if (row.metric !== 'consumer_spend') reasons.push(`metric:${row.metric}`);
  if (row.fee_basis !== 'gross') reasons.push(`fee_basis:${row.fee_basis}`);
  if (row.currency !== 'USD') reasons.push(`currency:${row.currency}`);
  if (!row.period.start || !row.period.end) reasons.push('period_incomplete');
  if (['ytd', 'cumulative', 'unresolved'].includes(row.period.kind)) reasons.push(`period_kind:${row.period.kind}`);
  if (row.qualifier) reasons.push(`qualifier:${row.qualifier}`);
  if (!row.stores.length || !row.stores.every(s => s === 'app_store' || s === 'google_play')) reasons.push('stores_outside_two_store_model');
  if (row.identity_status === 'unresolved') reasons.push('identity:unresolved_in_source');
  // Missing store-id mapping is tracked separately (mapping_status); it is fixable in identities.json.
  return { usable: reasons.length === 0, reasons };
}

let identityCache = null;
function readIdentities() {
  if (identityCache) return identityCache;
  const file = path.join(LEDGER_DIR, 'identities.json');
  identityCache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { games: {}, aliases: {} };
  return identityCache;
}
function resolveIdentity(game) {
  const ids = readIdentities();
  const canonical = ids.aliases[game] || game;
  const entry = ids.games[canonical];
  return entry ? { canonical, store_ids: { ios: entry.ios, aos: entry.aos }, status: entry.status } : { canonical, store_ids: null, status: null };
}

function normalize(row) {
  const r = { ...row };
  if (r.stores !== undefined && !Array.isArray(r.stores)) throw new TypeError('stores must be an array');
  if (r.period !== undefined && (!r.period || typeof r.period !== 'object' || Array.isArray(r.period))) {
    throw new TypeError('period must be an object');
  }
  r.stores = [...new Set(r.stores || [])].sort();
  r.period = { kind: 'unresolved', start: null, end: null, label: null, ...(r.period || {}) };
  r.qualifier = r.qualifier ?? null;
  r.unit_multiplier = r.unit_multiplier ?? 1e6;
  r.amount_usd_m = r.currency === 'USD' ? r.amount * r.unit_multiplier / 1e6 : null;
  r.overlaps_with = r.overlaps_with || [];
  r.flags = r.flags || [];
  r.evidence_role = r.evidence_role || 'reference';
  r.review_status = r.review_status || 'pending';
  const ident = resolveIdentity(r.game);
  r.game_key = ident.canonical;
  if (!r.store_ids && ident.store_ids) r.store_ids = ident.store_ids;
  r.mapping_status = !['consumer_spend', 'weekly_peak', 'downloads'].includes(r.metric) ? 'not_applicable' : r.store_ids ? 'mapped' : 'unmapped';
  r.identity_status = r.identity_status || 'as_published';
  r.tax_basis = r.tax_basis || 'unspecified';
  const canonicalId = makeId(r);
  r.legacy_ids = [...new Set([...(r.legacy_ids || []), legacyId(r),
    ...(r.id && r.id !== canonicalId ? [r.id] : [])])].filter(id => id !== canonicalId);
  r.id = canonicalId;
  r.schema_version = 2;
  r.fit = fitEligibility(r);
  return r;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate(row, sources) {
  const e = [];
  const period = row.period && typeof row.period === 'object' ? row.period : {};
  const req = ['id', 'game', 'geography', 'stores', 'period', 'amount', 'currency', 'metric', 'fee_basis', 'provider', 'source_id', 'added_on'];
  for (const k of req) if (row[k] === undefined || row[k] === null || row[k] === '') e.push(`missing ${k}`);
  if (!/^(WW|[A-Z]{2})$/.test(row.geography || '')) e.push(`geography ${row.geography}`);
  if (!Array.isArray(row.stores) || !row.stores.length || !row.stores.every(s => STORES.has(s))) e.push(`stores ${row.stores}`);
  if (!PERIOD_KINDS.has(period.kind)) e.push(`period.kind ${period.kind}`);
  for (const k of ['start', 'end']) if (period[k]) {
    const value = period[k];
    if (!validDate(value)) {
      e.push(`period.${k} ${value}`);
    }
  }
  if (period.start && period.end && period.start > period.end) e.push('period start after end');
  if (!Number.isFinite(row.amount) || !(row.amount > 0)) e.push(`amount ${row.amount}`);
  if (!Number.isFinite(row.unit_multiplier) || !(row.unit_multiplier > 0)) e.push(`unit_multiplier ${row.unit_multiplier}`);
  if (row.currency === 'USD' && !Number.isFinite(row.amount_usd_m)) e.push(`amount_usd_m ${row.amount_usd_m}`);
  if (!CURRENCIES.has(row.currency)) e.push(`currency ${row.currency}`);
  if (!METRICS.has(row.metric)) e.push(`metric ${row.metric}`);
  if (!FEE.has(row.fee_basis)) e.push(`fee_basis ${row.fee_basis}`);
  if (!QUALIFIERS.has(row.qualifier)) e.push(`qualifier ${row.qualifier}`);
  if (!['benchmark', 'candidate', 'reference'].includes(row.evidence_role)) e.push(`evidence_role ${row.evidence_role}`);
  if (!['clear', 'pending', 'conflicted'].includes(row.review_status)) e.push(`review_status ${row.review_status}`);
  if (sources && !sources[row.source_id]) e.push(`unknown source ${row.source_id}`);
  return e;
}

function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}
function writeLedger(rows) {
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  if (fs.existsSync(LEDGER)) {
    const original = fs.readFileSync(LEDGER, 'utf8');
    const prior = original.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    if (prior.some(row => row.schema_version !== 2)) {
      // Preserve the exact pre-migration ledger once; never overwrite recovery evidence.
      fs.writeFileSync(path.join(LEDGER_DIR, 'anchors.pre-scope-v2.jsonl'), original, { flag: 'wx' });
    }
  }
  const sorted = [...rows].sort((a, b) => (a.period.start || '9999').localeCompare(b.period.start || '9999') || a.id.localeCompare(b.id));
  fs.writeFileSync(LEDGER, sorted.map(r => JSON.stringify(r)).join('\n') + '\n');
  return sorted;
}
function readSources() { return fs.existsSync(SOURCES) ? JSON.parse(fs.readFileSync(SOURCES, 'utf8')) : {}; }
function writeSources(s) { fs.mkdirSync(LEDGER_DIR, { recursive: true }); fs.writeFileSync(SOURCES, JSON.stringify(s, null, 2) + '\n'); }

module.exports = { readIdentities, resolveIdentity, ROOT, LEDGER_DIR, LEDGER, SOURCES, MANUAL_DIR, slug, makeId, legacyId, resolveAnchorId, normalize, validate, validDate, fitEligibility, readLedger, writeLedger, readSources, writeSources };

