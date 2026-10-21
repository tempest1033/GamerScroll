'use strict';

/**
 * Short natural-language overview of a game page (2-4 sentences) derived from the per-game data
 * (docs/games-data/<slug>.json). Pure: runs in Node and in the Cloudflare Workers runtime.
 * Every sentence is skipped when its data is missing; wording varies with the actual values.
 */
const { t, has, formatDay, formatNumber, currentEdition } = require('../../i18n');
const { expand, pickCountry } = require('./game-rank-summary');

const COUNTRIES = ['kr', 'jp', 'us', 'cn', 'tw'];
const COUNTRY_KEYS = { kr: 'stats.korea', jp: 'stats.japan', us: 'stats.united_states', cn: 'stats.china', tw: 'stats.taiwan' };
const STORE_KEYS = { ios: 'stats.app_store', android: 'stats.google_play' };

const present = (a) => a.filter((x) => x != null);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rankText = (n) => t('game.desc_rank', { n });

function peakAndTrend(rank, meta, home) {
  const days = meta.days, L = days.length;
  if (!rank || !L) return {};
  const baseCountry = pickCountry(rank, home, L);
  let best = null;
  for (const cc of [baseCountry, ...COUNTRIES.filter((c) => c !== baseCountry)]) {
    for (const store of ['ios', 'android']) {
      const s = expand(rank.s[cc] && rank.s[cc][store], L);
      const v = present(s);
      if (!v.length) continue;
      const m = Math.min(...v);
      if (!best || m < best.rank) best = { rank: m, country: cc, store, date: days[s.indexOf(m)], days: v.length };
    }
  }
  if (!best) return {};

  const ios = expand(rank.s[baseCountry] && rank.s[baseCountry].ios, L), android = expand(rank.s[baseCountry] && rank.s[baseCountry].android, L);
  const useIos = baseCountry === 'cn' || present(ios).length >= present(android).length;
  const base = useIos ? ios : android, store = useIos ? 'ios' : 'android';
  const cur = base[L - 1];
  const lastIdx = base.reduce((acc, x, i) => (x != null ? i : acc), -1);
  const week = present(base.slice(-7)), before = present(base.slice(-14, -7));
  let trend = null;
  if (week.length && before.length) {
    const now = mean(week), prev = mean(before);
    const delta = prev - now;
    const kind = Math.abs(delta) < Math.max(1, prev * 0.1) ? 'flat' : delta > 0 ? 'up' : 'down';
    trend = { kind, now: Math.round(now), prev: Math.round(prev) };
  }
  const marketsNow = COUNTRIES.filter((cc) => ['ios', 'android'].some((s) => {
    const e = rank.s[cc] && rank.s[cc][s];
    return e && expand(e, L)[L - 1] != null;
  }));
  return { best, baseCountry, store, cur, trend, lastDate: lastIdx >= 0 ? days[lastIdx] : null, marketsNow };
}

// Returns the sentences (array of plain strings), possibly empty.
function describeGame(game, meta, home) {
  const name = (game.names && game.names[currentEdition().code]) || game.name;
  const out = [];
  const genres = (game.genres || []).filter((id) => has(`genre.${id}`)).slice(0, 2).map((id) => t(`genre.${id}`));
  const genre = genres.join(' / ');
  const dev = game.developer || '';
  if (genre && dev) out.push(t('game.desc_id_gd', { name, genre, dev }));
  else if (genre) out.push(t('game.desc_id_g', { name, genre }));
  else if (dev) out.push(t('game.desc_id_d', { name, dev }));

  const r = peakAndTrend(game.rank, meta, home);
  const storeName = (s) => t(STORE_KEYS[s]);
  if (r.best) {
    const p = { rank: rankText(r.best.rank), c: t(COUNTRY_KEYS[r.best.country]), store: storeName(r.best.store), date: formatDay(r.best.date), days: r.best.days };
    const atPeak = r.cur != null && r.cur === r.best.rank && r.best.country === r.baseCountry && r.best.store === r.store;
    if (atPeak) out.push(t('game.desc_peak_now', p));
    else out.push(t(r.best.rank === 1 ? 'game.desc_peak_top' : 'game.desc_peak', p));

    const c = t(COUNTRY_KEYS[r.baseCountry]);
    if (r.cur != null && !atPeak) {
      const tr = r.trend;
      out.push(t(tr ? `game.desc_cur_${tr.kind}` : 'game.desc_cur_none', { c, store: storeName(r.store), cur: rankText(r.cur), now: tr ? rankText(tr.now) : '', prev: tr ? rankText(tr.prev) : '' }));
    } else if (r.cur == null && r.lastDate) {
      out.push(t('game.desc_off', { c, store: storeName(r.store), date: formatDay(r.lastDate) }));
    }
  }

  const steam = game.steam || {};
  const history = (game.steamHistory || []).filter((h) => h && h.ccuRank > 0);
  if (!r.best && history.length) {
    const top = history.reduce((a, h) => (h.ccuRank < a.ccuRank ? h : a));
    out.push(t('game.desc_steam_peak', { rank: rankText(top.ccuRank), date: formatDay(top.date) }));
  }
  const parts = [];
  if (steam.rank > 0) parts.push(t('game.desc_steam_ccu', { rank: rankText(steam.rank) }));
  if (steam.salesRank > 0) parts.push(t('game.desc_steam_sales', { rank: rankText(steam.salesRank) }));
  if (steam.currentPlayers > 0) parts.push(t('game.desc_steam_players', { n: formatNumber(steam.currentPlayers) }));
  if (parts.length) out.push(t('game.desc_steam', { list: parts.join(t('game.desc_sep')) }));
  else if (r.marketsNow && r.marketsNow.length > 1) out.push(t('game.desc_markets', { n: r.marketsNow.length, list: r.marketsNow.map((cc) => t(COUNTRY_KEYS[cc])).join(t('game.desc_sep')) }));

  // A data value (e.g. "Co., Ltd.") may already end with the sentence's full stop: never print it twice.
  return out.slice(0, 4).map((s) => s.replace(/([.。])[.。]+$/, '$1'));
}

// Meta description: whole sentences up to the limit (CJK text is denser), hard cut with an ellipsis if the first one is too long.
function trimDescription(sentences, joiner) {
  const limit = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(sentences.join('')) ? 120 : 155; // components/head.js cuts anything over 155 chars with "..."
  let text = '';
  for (const s of sentences) {
    const next = text ? text + joiner + s : s;
    if (next.length > limit) {
      // A short lead sentence alone is a weak description: fill up to the limit with the next sentence, cut with an ellipsis.
      if (text.length < limit * 0.8) text = next.slice(0, limit - 1).trimEnd() + '…';
      break;
    }
    text = next;
  }
  return text;
}

// Script of a name: 'ja' when it has kana, else the most frequent of Hangul / Han / Latin letters ('' if none).
function dominantScript(text) {
  const s = String(text);
  if (/[\u3040-\u30ff]/.test(s)) return 'ja';
  const counts = { ko: (s.match(/[\uac00-\ud7af]/g) || []).length, han: (s.match(/[\u3400-\u9fff]/g) || []).length, latin: (s.match(/[A-Za-z]/g) || []).length };
  const [script, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n ? script : '';
}

module.exports = { describeGame, trimDescription, dominantScript };
