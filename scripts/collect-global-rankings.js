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
const { STOREFRONTS, NO_ANDROID, COUNTRY_CODES } = require('../src/crawlers/storefronts');
const store = require('../scripts/lib/global-rankings');

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
  try { return await fn(); } catch (e1) {
    await sleep(RETRY_DELAY_MS);
    try { return await fn(); } catch (e2) {
      throw new Error(`${label}: ${e2.message}`);
    }
  }
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchIosIds(cc, chart) {
  const data = await fetchJson(VIEWTOP + CHART[chart], { 'X-Apple-Store-Front': `${STOREFRONTS[cc]},29` });
  const ids = data?.pageData?.segmentedControl?.segments?.[0]?.pageData?.selectedChart?.adamIds || [];
  return ids.slice(0, MAX).map(String);
}

async function lookupIosMeta(ids, cc) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const data = await fetchJson(`https://itunes.apple.com/lookup?id=${batch.join(',')}&country=${cc.toLowerCase()}&entity=software`);
    for (const r of data.results || []) {
      if (r.wrapperType && r.wrapperType !== 'software') continue;
      out[`ios:${r.trackId}`] = { t: r.trackName || '', d: r.artistName || '', i: r.artworkUrl100 || r.artworkUrl60 || '' };
    }
  }
  return out;
}

async function fetchAndroid(gplay, cc, chart) {
  const collection = chart === 'grossing' ? gplay.collection.GROSSING : gplay.collection.TOP_FREE;
  const apps = await Promise.race([
    gplay.list({ collection, category: gplay.category.GAME, country: cc.toLowerCase(), lang: 'en', num: MAX }),
    sleep(TIMEOUT_MS).then(() => { throw new Error('timeout'); })
  ]);
  return apps.slice(0, MAX).map((a) => ({ id: a.appId, t: a.title || '', d: a.developer || '', i: a.icon || '' }));
}

async function collectCountry(gplay, cc, apps) {
  const lists = {};
  const newMeta = {};
  const errors = [];
  const lower = cc.toLowerCase();

  for (const chart of ['grossing', 'free']) {
    try {
      const ids = await withRetry(`ios ${cc} ${chart}`, () => fetchIosIds(cc, chart));
      lists[`ios_${lower}_${chart}`] = ids;
      const unknown = ids.filter((id) => !apps[`ios:${id}`] && !newMeta[`ios:${id}`]);
      if (unknown.length) Object.assign(newMeta, await withRetry(`lookup ${cc}`, () => lookupIosMeta(unknown, cc)));
    } catch (e) { errors.push(e.message); }
  }

  if (!NO_ANDROID.has(cc)) {
    for (const chart of ['grossing', 'free']) {
      try {
        const rows = await withRetry(`aos ${cc} ${chart}`, () => fetchAndroid(gplay, cc, chart));
        lists[`aos_${lower}_${chart}`] = rows.map((r) => r.id);
        for (const r of rows) if (!apps[`aos:${r.id}`]) newMeta[`aos:${r.id}`] = { t: r.t, d: r.d, i: r.i };
      } catch (e) { errors.push(e.message); }
    }
  }

  return { cc, lists, newMeta, errors };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const gplay = (await import('google-play-scraper')).default;
  const countries = opts.only ? COUNTRY_CODES.filter((c) => opts.only.includes(c)) : COUNTRY_CODES;
  const { date, time } = kstNow();
  const apps = store.loadApps(opts.out);
  const t0 = Date.now();

  console.log(`global rankings: ${countries.length} countries, concurrency ${opts.concurrency}, ${date} ${time} KST`);

  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, countries.length) }, async () => {
    while (next < countries.length) {
      const cc = countries[next++];
      try { results.push(await collectCountry(gplay, cc, apps)); }
      catch (e) { results.push({ cc, lists: {}, newMeta: {}, errors: [e.message] }); }
    }
  }));

  const lists = {};
  let newApps = 0, listCount = 0, rowCount = 0;
  const failed = [];
  for (const r of results) {
    for (const [k, v] of Object.entries(r.lists)) { lists[k] = v; listCount++; rowCount += v.length; }
    for (const [k, v] of Object.entries(r.newMeta)) if (!apps[k]) { apps[k] = v; newApps++; }
    if (r.errors.length) failed.push(`${r.cc}: ${r.errors.join(' | ')}`);
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  lists ${listCount}, rows ${rowCount}, new apps ${newApps}, dict ${Object.keys(apps).length}, ${sec}s`);
  for (const f of failed) console.log(`  ! ${f}`);

  if (opts.dryRun) { console.log('  dry-run: 저장 생략'); return; }
  if (listCount === 0) { console.error('  수집 결과 없음 — 저장하지 않음'); process.exit(1); }

  if (newApps) store.saveApps(apps, opts.out);
  const saved = store.appendRun(date, time, lists, opts.out);
  console.log(`  saved ${store.dayPath(date, opts.out)} → ${(saved.bytes / 1024).toFixed(1)}KB (ids ${saved.ids}, lists ${saved.lists})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
