'use strict';

// Research-only panel: every ledger-labelled August game with resolved store identities,
// measured against the archived five-market grossing charts. Nothing is written to production.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readLedger, ROOT } = require('../anchors/lib/anchor-schema');

const ARCHIVE = path.join(ROOT, 'snapshots/rankings');
const MARKET = 'data/rank-models/global-chart-2026-v0.3.json';
const PERIOD = { start: '2026-08-01', end: '2026-08-31' };

function labelRows(ledger, period = PERIOD) {
  return ledger.filter((row) => row.metric === 'consumer_spend'
    && row.period.start === period.start && row.period.end === period.end
    && row.currency === 'USD' && ['gross', 'net'].includes(row.fee_basis)
    && row.mapping_status === 'mapped' && !row.duplicate_of
    && row.stores.every((store) => store === 'app_store' || store === 'google_play'));
}

function readChartFile(file) {
  const match = path.basename(file).match(/^(\d{4}-\d{2}-\d{2})_(ios|aos)_([a-z]{2})_grossing\.csv$/);
  if (!match) throw new Error(`Unexpected archive name: ${file}`);
  const [, date, store, country] = match;
  const buffer = fs.readFileSync(file);
  const lines = buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.shift() !== 'time,rank,id,title') throw new Error(`Unexpected archive header: ${file}`);
  const snapshots = new Map();
  for (const line of lines.filter(Boolean)) {
    const row = line.match(/^(\d{2}:\d{2}),(\d+),([^,]+),/);
    if (!row) throw new Error(`Unexpected archive row: ${file}`);
    const [, time, rankText, id] = row;
    const rank = Number(rankText);
    if (!(rank >= 1 && rank <= 200)) throw new Error(`Rank outside the chart depth: ${file} ${rank}`);
    if (!snapshots.has(time)) snapshots.set(time, new Map());
    const snapshot = snapshots.get(time);
    if (snapshot.has(id)) throw new Error(`Duplicate app in one snapshot: ${file} ${time} ${id}`);
    snapshot.set(id, rank);
  }
  return { date, store, country, snapshots,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

function buildPanel({ period = PERIOD, archive = ARCHIVE, marketPath = MARKET } = {}) {
  const ledger = readLedger();
  const labels = labelRows(ledger, period);
  if (!labels.length) throw new Error('No labelled August rows with resolved identities');
  const market = JSON.parse(fs.readFileSync(path.join(ROOT, marketPath), 'utf8'));
  const marketByCountry = new Map(market.countries.map((row) => [row.country.toLowerCase(), row]));
  const games = [];
  const byKey = new Map();
  for (const row of labels) {
    if (!byKey.has(row.game_key)) {
      byKey.set(row.game_key, games.length);
      games.push({ key: row.game_key, storeIds: row.store_ids, labels: [] });
    }
    const game = games[byKey.get(row.game_key)];
    for (const storefront of ['ios', 'aos']) {
      game.storeIds[storefront] = [...new Set([...(game.storeIds[storefront] || []),
        ...((row.store_ids || {})[storefront] || [])])];
    }
    game.labels.push({ anchorId: row.id, amountUsdMillion: row.amount_usd_m, geography: row.geography,
      stores: row.stores, feeBasis: row.fee_basis, qualifier: row.qualifier, sourceId: row.source_id,
      provider: row.provider, evidenceRole: row.evidence_role, usableForGrossFit: row.fit.usable });
  }
  const lookup = new Map();
  for (const [index, game] of games.entries()) {
    for (const storefront of ['ios', 'aos']) {
      for (const id of game.storeIds[storefront]) {
        const key = `${storefront}:${id}`;
        if (lookup.has(key)) throw new Error(`Ambiguous app identity across games: ${key}`);
        lookup.set(key, index);
      }
    }
  }
  const files = fs.readdirSync(archive)
    .filter((file) => /_grossing\.csv$/.test(file) && file.slice(0, 10) >= period.start && file.slice(0, 10) <= period.end)
    .sort();
  if (!files.length) throw new Error('No archived grossing charts for the period');
  const charts = new Map();
  const hashes = [];
  for (const file of files) {
    const { date, store, country, snapshots, sha256 } = readChartFile(path.join(archive, file));
    hashes.push({ file, sha256 });
    const key = `${store}_${country}`;
    if (!charts.has(key)) {
      const row = marketByCountry.get(country);
      if (!row) throw new Error(`Country missing from the market table: ${country}`);
      const share = row.storeShares[store === 'aos' ? 'android' : 'ios'];
      if (!(share > 0)) throw new Error(`Invalid store share: ${key}`);
      charts.set(key, { key, country: country.toUpperCase(),
        store: store === 'ios' ? 'app_store' : 'google_play',
        annualMarketProxyUsd: row.marketProxyUsd * share,
        marketProxyStatus: market.status, observations: [] });
    }
    const storefront = store === 'ios' ? 'ios' : 'aos';
    for (const [time, snapshot] of [...snapshots].sort()) {
      const depth = Math.max(...snapshot.values());
      const ranks = games.map(() => null);
      for (const [id, rank] of snapshot) {
        const index = lookup.get(`${storefront}:${id}`);
        if (index === undefined) continue;
        ranks[index] = ranks[index] === null ? rank : Math.min(ranks[index], rank);
      }
      charts.get(key).observations.push({ at: `${date}T${time}`, returnedRows: snapshot.size, depth, ranks });
    }
  }
  return {
    schemaVersion: 1, productionEnabled: false, period,
    rankScope: 'game_grossing', rankLimit: 200,
    absentGameMeaning: 'below_returned_chart_depth; never zero revenue and never an imputed rank',
    familyRule: 'Several store ids of one game family collapse to their best observed rank in a snapshot, never a sum of ranks.',
    labelSemantics: 'Gross and net rows are kept as published. Net rows are never divided by a fee factor here.',
    games, charts: [...charts.values()].sort((a, b) => a.key.localeCompare(b.key)),
    provenance: { ledger: 'docs/research/anchors/anchors.jsonl', marketModel: marketPath, archiveHashes: hashes },
  };
}

if (require.main === module) {
  const { values } = require('node:util').parseArgs({ options: {
    output: { type: 'string' }, market: { type: 'string' },
  } });
  const output = values.output || 'reports/rank-models/august-label-panel-2026-09-11.json';
  const panel = buildPanel(values.market ? { marketPath: values.market } : {});
  fs.writeFileSync(path.join(ROOT, output), `${JSON.stringify(panel)}\n`);
  console.log(JSON.stringify({
    output, marketModel: panel.provenance.marketModel, games: panel.games.length,
    labels: panel.games.reduce((sum, game) => sum + game.labels.length, 0),
    grossLabels: panel.games.reduce((sum, game) =>
      sum + game.labels.filter((label) => label.feeBasis === 'gross').length, 0),
    charts: panel.charts.length,
    observations: panel.charts.reduce((sum, chart) => sum + chart.observations.length, 0),
    archiveFiles: panel.provenance.archiveHashes.length,
  }));
}

module.exports = { buildPanel, labelRows, readChartFile };
