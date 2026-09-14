#!/usr/bin/env node
'use strict';

/**
 * 글로벌(전 국가) 모바일 게임 순위 수집 → snapshots/global/ 압축 저장.
 *
 * 국가마다 iOS(viewTop) 매출·인기 200위, Android(google-play-scraper) 매출·인기 200위를 받는다.
 * 앱 메타(제목·개발사·아이콘)는 사전(apps.json)에 없는 앱만 조회한다.
 *
 * Usage:
 *   node scripts/collect-global-rankings.js [--concurrency 10] [--only KR,JP] [--dry-run] [--out <dir>]
 */

const path = require('path');
const fs = require('fs');
const { STOREFRONTS, NO_ANDROID, COUNTRY_CODES } = require('../src/crawlers/storefronts');
const store = require('../scripts/lib/global-rankings');
const { createAppleClient } = require('./lib/global-ranking-requests');

const VIEWTOP = 'https://itunes.apple.com/WebObjects/MZStore.woa/wa/viewTop?genreId=6014&popId=';
const CHART = { grossing: '38', free: '27' };
const TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 3000;
const MAX = 200;

function parseArgs(argv) {
  const o = { concurrency: 10, only: null, dryRun: false, out: store.DEFAULT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--concurrency') o.concurrency = Math.max(1, Number(argv[++i]) || 10);
    else if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--out') o.out = path.resolve(argv[++i]);
  }
  return o;
}

function kstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(label, fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); } catch (error) {
      if (attempt === 2 || (error.status && error.status < 500) || error.name === 'AbortError') {
        error.message = `${label}: ${error.message}`;
        throw error;
      }
      await sleep(RETRY_DELAY_MS * 2 ** attempt);
    }
  }
}

async function fetchIosIds(apple, cc, chart) {
  const data = await apple(VIEWTOP + CHART[chart], { 'X-Apple-Store-Front': `${STOREFRONTS[cc]},29` });
  const ids = data?.pageData?.segmentedControl?.segments?.[0]?.pageData?.selectedChart?.adamIds;
  if (!Array.isArray(ids)) throw new Error('Missing adamIds in Apple response');
  return ids.slice(0, MAX).map(String);
}

async function lookupIosMeta(apple, ids, cc) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const data = await apple(`https://itunes.apple.com/lookup?id=${batch.join(',')}&country=${cc.toLowerCase()}&entity=software`);
    for (const r of data.results || []) {
      if (r.wrapperType && r.wrapperType !== 'software') continue;
      out[`ios:${r.trackId}`] = { t: r.trackName || '', d: r.artistName || '', i: r.artworkUrl100 || r.artworkUrl60 || '' };
    }
  }
  return out;
}

async function fetchAndroid(gplay, cc, chart) {
  const collection = chart === 'grossing' ? gplay.collection.GROSSING : gplay.collection.TOP_FREE;
  const apps = await gplay.list({
    collection, category: gplay.category.GAME, country: cc.toLowerCase(), lang: 'en', num: MAX,
    requestOptions: { timeout: { request: TIMEOUT_MS }, retry: { limit: 0 } }
  });
  return apps.slice(0, MAX).map((a) => ({ id: a.appId, t: a.title || '', d: a.developer || '', i: a.icon || '' }));
}

async function collectCountry(gplay, apple, cc, apps, selectedKeys = null) {
  const lists = {};
  const newMeta = {};
  const errors = [];
  const charts = {};
  const lower = cc.toLowerCase();
  const success = (key, ids) => {
    lists[key] = ids;
    charts[key] = {
      status: ids.length ? 'ok' : 'empty', count: ids.length,
      observedAt: new Date().toISOString()
    };
  };
  const failure = (key, e) => {
    charts[key] = {
      status: e.deferred ? 'deferred' : 'error', count: 0, error: e.message,
      checkedAt: new Date().toISOString()
    };
    errors.push(`${key}: ${e.message}`);
  };

  for (const chart of ['grossing', 'free']) {
    const key = `ios_${lower}_${chart}`;
    if (selectedKeys && !selectedKeys.has(key)) continue;
    try {
      success(key, await fetchIosIds(apple, cc, chart));
    } catch (e) { failure(key, e); }
  }

  if (!NO_ANDROID.has(cc)) {
    for (const chart of ['grossing', 'free']) {
      const key = `aos_${lower}_${chart}`;
      if (selectedKeys && !selectedKeys.has(key)) continue;
      try {
        const rows = await withRetry(`aos ${cc} ${chart}`, () => fetchAndroid(gplay, cc, chart));
        success(key, rows.map((r) => r.id));
        for (const r of rows) if (!apps[`aos:${r.id}`]) newMeta[`aos:${r.id}`] = { t: r.t, d: r.d, i: r.i };
      } catch (e) { failure(key, e); }
    }
  }

  return { cc, lists, newMeta, errors, charts };
}

function summarizeRun(results, countries, previous = {}) {
  const charts = {};
  for (const cc of countries) {
    for (const platform of ['ios', ...(!NO_ANDROID.has(cc) ? ['aos'] : [])]) {
      for (const chart of ['grossing', 'free']) {
        const key = `${platform}_${cc.toLowerCase()}_${chart}`;
        charts[key] = { status: 'error', count: 0, error: 'No collection result' };
      }
    }
  }
  for (const r of results) Object.assign(charts, r.charts);
  for (const [key, chart] of Object.entries(charts)) {
    if (chart.status !== 'ok') chart.lastSuccess = previous[key]?.lastSuccess || null;
  }
  const entries = Object.values(charts);
  const collected = entries.filter((r) => r.status === 'ok').length;
  return {
    status: collected === entries.length ? 'complete' : collected ? 'partial' : 'failed',
    // 부분 수집으로 국가 비중이 바뀐 점수를 만들지 않는다. 과거 순위로 보충하지도 않는다.
    scoreEligible: entries.length > 0 && collected === entries.length,
    countries, expected: entries.length, collected,
    short: entries.filter((r) => r.status === 'ok' && r.count < MAX).length,
    charts
  };
}

function reportMarkdown(report) {
  const lines = [
    '## Global rankings collection',
    `- Status: **${report.status}**`,
    `- Charts: ${report.collected}/${report.expected}`,
    `- Eligible for a same-run score: ${report.scoreEligible ? 'yes' : 'no (incomplete coverage)'}`,
    `- Nonempty charts below 200 rows: ${report.short} (not automatically a failure)`,
    `- Metadata errors: ${report.metadataErrors.length}`,
    '', '| Chart | Status | Last success | Details |', '| --- | --- | --- | --- |'
  ];
  for (const [key, r] of Object.entries(report.charts)) {
    if (r.status !== 'ok') {
      const last = r.lastSuccess;
      const timestamp = last ? last.observedAt || `${last.date} ${last.time} KST (snapshot time)` : 'none';
      lines.push(`| ${key} | ${r.status} | ${timestamp} | ${String(r.error || 'Empty response').replace(/[|\r\n]/g, ' ')} |`);
    }
  }
  return lines.join('\n') + '\n';
}

async function collectPlanned({ gplay, apple, countries, apps, previous, concurrency }) {
  const expected = Object.keys(summarizeRun([], countries).charts);
  const priority = new Set(expected.filter((key) => previous[key]?.status !== 'ok'));
  const regular = new Set(expected.filter((key) => !priority.has(key)));
  const results = [];
  // 누락 차트 전용 단계를 먼저 끝낸다. 같은 나라의 정상 차트까지 먼저 요청하지 않는다.
  for (const selectedKeys of [priority, regular]) {
    const pending = countries.filter((cc) => [...selectedKeys].some((key) => key.split('_')[1] === cc.toLowerCase()));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      while (next < pending.length) {
        const cc = pending[next++];
        results.push(await collectCountry(gplay, apple, cc, apps, selectedKeys));
      }
    }));
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const gplay = (await import('google-play-scraper')).default;
  const countries = opts.only ? COUNTRY_CODES.filter((c) => opts.only.includes(c)) : COUNTRY_CODES;
  if (!countries.length) throw new Error('No supported countries selected');
  const { date, time } = kstNow();
  const apps = store.loadApps(opts.out);
  const apple = createAppleClient();
  const previous = store.readCollectionState(Object.keys(summarizeRun([], countries).charts), opts.out);
  const t0 = Date.now();

  console.log(`global rankings: ${countries.length} countries, concurrency ${opts.concurrency}, ${date} ${time} KST`);

  const results = await collectPlanned({
    gplay, apple, countries, apps, previous, concurrency: opts.concurrency
  });

  const lists = {};
  let newApps = 0, listCount = 0, rowCount = 0;
  const failed = [];
  for (const r of results) {
    for (const [k, v] of Object.entries(r.lists)) {
      lists[k] = v;
      if (v.length) listCount++;
      rowCount += v.length;
    }
    for (const [k, v] of Object.entries(r.newMeta)) if (!apps[k]) { apps[k] = v; newApps++; }
    if (r.errors.length) failed.push(`${r.cc}: ${r.errors.join(' | ')}`);
  }

  // 순위 요청을 먼저 끝내고, 남은 Apple 요청 예산으로 메타데이터를 보강한다.
  const report = summarizeRun(results, countries, previous);
  report.startedAt = new Date(t0).toISOString();
  report.metadataErrors = [];
  for (const r of results) {
    const ids = [...new Set(['grossing', 'free'].flatMap((chart) => r.lists[`ios_${r.cc.toLowerCase()}_${chart}`] || []))];
    const unknown = ids.filter((id) => !apps[`ios:${id}`]);
    if (!unknown.length) continue;
    try {
      const meta = await lookupIosMeta(apple, unknown, r.cc);
      for (const [key, value] of Object.entries(meta)) if (!apps[key]) { apps[key] = value; newApps++; }
    } catch (e) { report.metadataErrors.push({ country: r.cc, error: e.message }); }
  }
  report.finishedAt = new Date().toISOString();
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  lists ${listCount}, rows ${rowCount}, new apps ${newApps}, dict ${Object.keys(apps).length}, ${sec}s`);
  for (const f of failed) console.log(`  ! ${f}`);
  console.log(`  status ${report.status}: ${report.collected}/${report.expected}, short ${report.short}, metadata errors ${report.metadataErrors.length}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, reportMarkdown(report));

  if (report.status !== 'complete') process.exitCode = 1;
  if (opts.dryRun) { console.log('  dry-run: 저장 생략'); return; }

  if (newApps) store.saveApps(apps, opts.out);
  const saved = store.appendRun(date, time, lists, opts.out, report);
  console.log(`  saved ${store.dayPath(date, opts.out)} → ${(saved.bytes / 1024).toFixed(1)}KB (ids ${saved.ids}, lists ${saved.lists})`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });

module.exports = { collectCountry, collectPlanned, summarizeRun, reportMarkdown };
