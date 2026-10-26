'use strict';

/**
 * Display allowlists for the revenue estimate bundle, applied twice: at ingestion (src/build/service-exports.js drops
 * the numbers) and at render (revenue-section.js / revenue-reference.js re-check the page data). Pure, Workers-safe.
 *   revenue numbers   only for tiers beta and wide (the production revenue tiers), per rank band where the record has
 *                     tier_by_band; any other, unknown or missing tier → no numbers ("hidden" note)
 *   download numbers  only for verified, unverified, assumption, partial_store; anything else → "not available"
 */
const REVENUE_TIERS = ['beta', 'wide'];
const DOWNLOAD_TIERS = ['verified', 'unverified', 'assumption', 'partial_store'];
const NULL3 = [null, null, null];

const revenueShown = (tier) => REVENUE_TIERS.includes(tier);
const downloadsShown = (de) => Boolean(de && DOWNLOAD_TIERS.includes(de.t));

// tier_by_band { 'lo-hi': tier } → [[lo, hi, tier]] by rank, or null without one (the market tier then governs).
function bandTiers(byBand) {
  if (!byBand || typeof byBand !== 'object' || Array.isArray(byBand)) return null;
  return Object.entries(byBand).map(([k, v]) => { const m = /^(\d+)-(\d+)$/.exec(k); return m ? [Number(m[1]), Number(m[2]), v] : null; })
    .filter(Boolean).sort((a, b) => a[0] - b[0]);
}
// A rank's band must have a shown tier; off-chart days (rank null) are estimated at the floor, so the lowest band applies.
// A rank outside every band is not shown.
function bandShown(tb, rank) {
  if (!tb) return true;
  const band = rank == null ? tb[tb.length - 1] : tb.find(([lo, hi]) => rank >= lo && rank <= hi);
  return Boolean(band && revenueShown(band[2]));
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Compact store payload (see service-exports.js compactStore) with per-band tiers tb: days in a band that is not shown
// lose their numbers, and so do the week / month / month-to-date totals containing one, and the 14-day revenue total
// when any outlook median rank falls in such a band. Idempotent.
function maskBands(p) {
  if (!p.tb) return p;
  const tb = p.tb;
  const bad = [];
  const d = p.d.map((r, i) => { if (bandShown(tb, r[0])) return r; bad.push(addDays(p.d0, i)); return [r[0], ...NULL3]; });
  const hit = (from, to) => bad.some((x) => x >= from && x <= to);
  const period = (r, from, to) => (hit(from, to) ? [r[0], ...NULL3] : r);
  const mtd = p.mtd ? {
    ...p.mtd,
    d: p.mtd.d.map((r) => (bandShown(tb, r[1]) ? r : [r[0], r[1], ...NULL3])),
    t: p.mtd.d.some((r) => !bandShown(tb, r[1])) || hit(`${p.mtd.m}-01`, p.mtd.th || `${p.mtd.m}-31`) ? null : p.mtd.t,
  } : p.mtd;
  const o = p.o && p.o.t && p.o.d.some((r) => !bandShown(tb, r[3])) ? { ...p.o, t: null } : p.o;
  return { ...p, d, w: p.w.map((r) => period(r, r[0], addDays(r[0], 6))), mo: p.mo.map((r) => period(r, `${r[0]}-01`, `${r[0]}-31`)), mtd, o };
}

// Page-data store payload → what may be rendered: revenue only for shown tiers (per band), downloads only for shown
// tiers ('hidden' kept for its note). Free-chart rank is not an estimate and stays.
function displayStore(p) {
  const de = p.de && (downloadsShown(p.de) || p.de.t === 'hidden') ? p.de : null;
  const { de: _drop, ...rest } = revenueShown(p.t) ? maskBands(p) : { t: 'hidden', ...(p.fr ? { fr: p.fr } : {}) };
  return de ? { ...rest, de } : rest;
}

module.exports = { REVENUE_TIERS, DOWNLOAD_TIERS, revenueShown, downloadsShown, bandTiers, bandShown, maskBands, displayStore };
