'use strict';

// Normalize archived observations without treating censored/unknown ranks as revenue zero.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { readLedger, ROOT, validDate } = require('./lib/anchor-schema');

function load(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/^\uFEFF/, ''));
}

function buildPanel({ rankReference = null, additionalRankReferences = [],
  observationPeriod = { start: '2026-08-01', end: '2026-08-31' }, observationGames = null } = {}) {
  assert(validDate(observationPeriod.start) && validDate(observationPeriod.end)
    && observationPeriod.start <= observationPeriod.end, 'Valid inclusive observation dates required');
  const calendarDays = (Date.parse(observationPeriod.end) - Date.parse(observationPeriod.start)) / 86400000 + 1;
  const periodDates = Array.from({ length: calendarDays }, (_, i) =>
    new Date(Date.parse(observationPeriod.start) + i * 86400000).toISOString().slice(0, 10));
  assert(observationGames || observationPeriod.start === '2026-08-01' && observationPeriod.end === '2026-08-31',
    'Non-August observation panels require an explicit identity-only game list; August labels cannot be silently reused');
  for (const reference of [rankReference, ...additionalRankReferences].filter(Boolean)) {
    assert(reference.period.start === observationPeriod.start && reference.period.end === observationPeriod.end,
      'Rank reference period must match the observation panel');
  }
  const legacyPath = 'reports/rank-models/august-monthly-features-2026-09-10.json';
  const marketPath = 'data/rank-models/global-chart-2026-v0.3.json';
  const legacy = load(legacyPath);
  const market = load(marketPath);
  const countryMap = new Map(market.countries.map(row => [row.country.toLowerCase(), row]));
  const ledger = readLedger();
  const games = observationGames ? observationGames.map(game => ({
    key: game.key, storeIds: game.storeIds, identityStatus: game.identityStatus, reference: null
  })) : legacy.identities.map((identity, index) => {
    const anchors = ledger.filter(row => row.game_key === identity.name && row.geography === 'WW'
      && row.source_id === 'S01' && row.period.start === '2026-08-01'
      && row.period.end === '2026-08-31' && row.metric === 'consumer_spend');
    assert.equal(anchors.length, 1, `Unique reference required: ${identity.name}`);
    const anchor = anchors[0];
    assert(anchor.fit.usable && anchor.amount_usd_m === legacy.targetsMillion[index]);
    return { key: identity.name, storeIds: identity.ids, identityStatus: identity.status,
      reference: { anchorId: anchor.id, amount: anchor.amount_usd_m, unit: 'USD_million',
        geography: anchor.geography, stores: anchor.stores, feeBasis: anchor.fee_basis,
        taxBasis: 'unspecified', provider: anchor.provider, period: anchor.period } };
  });
  for (const reference of [rankReference, ...additionalRankReferences].filter(Boolean)) {
    for (const row of reference.rows) {
      let game = games.find(item => item.key === row.game);
      if (!game) {
        assert(row.storeIds && Array.isArray(row.storeIds.ios) && Array.isArray(row.storeIds.aos));
        game = { key: row.game, storeIds: row.storeIds,
          identityStatus: row.identityStatus || 'archive titles matched; vendor regional-family aggregation provisional',
          reference: null };
        games.push(game);
      }
      if (row.storeIds) {
        for (const store of ['ios', 'aos']) {
          game.storeIds[store] = [...new Set([...game.storeIds[store], ...row.storeIds[store]])];
        }
      }
      const rank = { rank: row.rank, publishedName: row.publishedName || row.game,
        geography: reference.geography, provider: reference.provider,
        sourceUrl: reference.sourceUrl, imageUrl: reference.imageUrl };
      if (reference.geography === 'WW') {
        assert(!game.rankReference, `Duplicate global rank reference: ${row.game}`);
        game.rankReference = rank;
      } else {
        game.regionalRankReferences ||= [];
        assert(!game.regionalRankReferences.some(item => item.geography === reference.geography),
          `Duplicate regional rank reference: ${row.game}`);
        game.regionalRankReferences.push(rank);
      }
    }
  }
  const lookup = new Map();
  games.forEach((game, index) => {
    for (const [store, ids] of Object.entries(game.storeIds)) for (const id of ids) {
      const key = `${store}:${id}`;
      assert(!lookup.has(key), `Ambiguous app identity: ${key}`);
      lookup.set(key, index);
    }
  });
  const directory = path.join(ROOT, 'snapshots/rankings');
  const files = fs.readdirSync(directory)
    .filter(file => /^\d{4}-\d{2}-\d{2}_(ios|aos)_[a-z]{2}_grossing\.csv$/.test(file)
      && file.slice(0, 10) >= observationPeriod.start && file.slice(0, 10) <= observationPeriod.end).sort();
  assert(files.length > 0, 'No matching archived rankings');
  const chartMap = new Map(), hashes = [];
  for (const file of files) {
    const [, date, store, country] = file.match(/^(\d{4}-\d{2}-\d{2})_(ios|aos)_([a-z]{2})_grossing\.csv$/);
    assert(validDate(date), `Invalid archive date: ${file}`);
    assert(countryMap.has(country));
    const key = `${store}_${country}`;
    if (!chartMap.has(key)) {
      const row = countryMap.get(country);
      const share = row.storeShares[store === 'aos' ? 'android' : 'ios'];
      assert(Number.isFinite(share) && share > 0);
      chartMap.set(key, { key, country: country.toUpperCase(),
        store: store === 'ios' ? 'app_store' : 'google_play',
        annualMarketProxyUsd: row.marketProxyUsd * share,
        marketProxyStatus: market.status, observations: [] });
    }
    const buffer = fs.readFileSync(path.join(directory, file));
    hashes.push({ file, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
    const lines = buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    assert.equal(lines.shift(), 'time,rank,id,title');
    const snapshots = new Map();
    for (const line of lines.filter(Boolean)) {
      const match = line.match(/^(\d{2}:\d{2}),(\d+),([^,]+),/);
      assert(match, `Invalid CSV prefix: ${file}`);
      const [, time, rankText, id] = match;
      assert(Number(time.slice(0, 2)) < 24 && Number(time.slice(3, 5)) < 60,
        `Invalid archive time: ${file} ${time}`);
      const rank = Number(rankText);
      assert(rank >= 1 && rank <= 200);
      if (!snapshots.has(time)) snapshots.set(time, {
        rankSet: new Set(), appSet: new Set(), gameRanks: games.map(() => []) });
      const snapshot = snapshots.get(time);
      assert(!snapshot.rankSet.has(rank) && !snapshot.appSet.has(id), `${file} ${time}`);
      snapshot.rankSet.add(rank); snapshot.appSet.add(id);
      const gameIndex = lookup.get(`${store}:${id}`);
      if (gameIndex !== undefined) snapshot.gameRanks[gameIndex].push(rank);
    }
    for (const [time, snapshot] of snapshots) {
      const depth = Math.max(...snapshot.rankSet);
      chartMap.get(key).observations.push({
        at: `${date}T${time}:00`, returnedRows: snapshot.rankSet.size, depth,
        completeToDepth: snapshot.rankSet.size === depth,
        gameRanks: snapshot.gameRanks
      });
    }
  }
  const charts = [...chartMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const chart of charts) {
    chart.observations.sort((a, b) => a.at.localeCompare(b.at));
    const dates = [...new Set(chart.observations.map(row => row.at.slice(0, 10)))];
    chart.observedDates = dates;
    chart.missingDates = periodDates.filter(date => !dates.includes(date));
  }
  const regionalAnchors = observationGames ? [] : ledger.filter(row => games.some(game => game.key === row.game_key)
    && row.geography !== 'WW' && row.period.start === '2026-08-01'
    && row.period.end === '2026-08-31' && row.fit.usable && row.metric === 'consumer_spend');
  return {
    schemaVersion: 1, status: 'exploratory_scope_mismatch', productionEnabled: false,
    period: { ...observationPeriod, calendarDays },
    observationOnly: Boolean(observationGames),
    observationTimezone: 'Asia/Seoul',
    timestampPrecisionMinutes: 30,
    timestampMeaning: 'Archive writer floors its wall clock to a 30-minute bucket; not the store ranking update time.',
    rankSemantics: 'Position in the returned scraper array; original upstream rank and metadata omissions were not independently persisted.',
    rankScope: 'game_grossing', rankLimit: 200,
    absentGameMeaning: 'not_in_returned_chart; not evidence of zero revenue or non-release',
    missingChartMeaning: 'unobserved; never imputed as a rank',
    curveNormalizationMeaning: 'If normalized over ranks 1..200, shares are conditional on the modeled chart, not the entire market.',
    source: observationGames ? null : legacy.source, rankReference, additionalRankReferences, games, charts, regionalAnchors,
    provenance: { legacyFeatures: legacyPath, marketModel: marketPath,
      ledger: 'docs/research/anchors/anchors.jsonl', archiveHashes: hashes }
  };
}

if (require.main === module) {
  const { values } = require('node:util').parseArgs({ options: {
    'rank-reference': { type: 'string', multiple: true }, output: { type: 'string' },
    start: { type: 'string' }, end: { type: 'string' }, 'games-from-panel': { type: 'string' }
  } });
  assert(!values['rank-reference'] || values.output, 'Expanded panels require a distinct explicit output path');
  assert((!values.start && !values.end && !values['games-from-panel']) || values.output,
    'Alternate observation panels require a distinct explicit output path');
  const references = (values['rank-reference'] || []).map(load);
  const panel = buildPanel({ rankReference: references[0] || null, additionalRankReferences: references.slice(1),
    ...(values.start || values.end ? { observationPeriod: { start: values.start, end: values.end } } : {}),
    observationGames: values['games-from-panel'] ? load(values['games-from-panel']).games : null });
  if (values['games-from-panel']) panel.provenance.identityPanel = values['games-from-panel'];
  const output = path.join(ROOT, values.output || 'reports/rank-models/normalized-august-panel-2026-09-10.json');
  fs.writeFileSync(output, JSON.stringify(panel) + '\n');
  console.log(JSON.stringify({ output, games: panel.games.length, charts: panel.charts.length,
    files: panel.provenance.archiveHashes.length,
    observations: panel.charts.reduce((sum, chart) => sum + chart.observations.length, 0) }));
}

module.exports = { buildPanel };
