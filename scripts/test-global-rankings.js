'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAppleClient } = require('./lib/global-ranking-requests');
const { collectCountry, collectPlanned, summarizeRun, reportMarkdown } = require('./collect-global-rankings');
const store = require('./lib/global-rankings');

function clientWith(responses) {
  let clock = 0;
  const calls = [];
  const client = createAppleClient({
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => {
      calls.push(clock);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }
  });
  return { client, calls };
}

test('Apple requests are paced across concurrent countries', async () => {
  const { client, calls } = clientWith([new Response('{}'), new Response('{}'), new Response('{}')]);
  await Promise.all([client('a'), client('b'), client('c')]);
  assert.deepEqual(calls, [0, 1000, 2000]);
});

test('403 stops queued Apple requests without retrying or bypassing the refusal', async () => {
  const { client, calls } = clientWith([new Response('', { status: 403 })]);
  const results = await Promise.allSettled([client('a'), client('b')]);
  assert.equal(results[0].reason.status, 403);
  assert.equal(results[1].reason.deferred, true);
  assert.equal(calls.length, 1);
});

test('429 pauses all Apple requests and honors Retry-After', async () => {
  const { client, calls } = clientWith([
    new Response('', { status: 429, headers: { 'Retry-After': '90' } }),
    new Response('{}'), new Response('{}')
  ]);
  await Promise.all([client('a'), client('b')]);
  assert.deepEqual(calls, [0, 90000, 91000]);
});

test('an excessive Retry-After defers the run instead of retrying early', async () => {
  const { client, calls } = clientWith([
    new Response('', { status: 429, headers: { 'Retry-After': '300' } })
  ]);
  await assert.rejects(client('a'), { status: 429 });
  await assert.rejects(client('b'), { deferred: true });
  assert.equal(calls.length, 1);
});

test('repeated throttling has a bounded retry count', async () => {
  const { client, calls } = clientWith([
    new Response('', { status: 429 }), new Response('', { status: 429 }), new Response('', { status: 429 })
  ]);
  await assert.rejects(client('a'), { status: 429 });
  await assert.rejects(client('b'), { deferred: true });
  assert.deepEqual(calls, [0, 60000, 180000]);
});

test('temporary server errors recover without stopping other queued charts', async () => {
  const { client, calls } = clientWith([
    new Response('', { status: 503 }), new Response('{"ok":true}'), new Response('{}')
  ]);
  assert.deepEqual(await client('a'), { ok: true });
  await client('b');
  assert.deepEqual(calls, [0, 3000, 4000]);
});

const appleChart = (ids) => ({
  pageData: { segmentedControl: { segments: [{ pageData: { selectedChart: { adamIds: ids } } }] } }
});

test('collection distinguishes short, empty, malformed and successful charts', async () => {
  const apple = async (url) => url.endsWith('38') ? appleChart(['1', '2']) : appleChart([]);
  const gplay = { collection: { GROSSING: 'grossing', TOP_FREE: 'free' }, category: { GAME: 'game' },
    list: async () => [{ appId: 'example.game', title: 'Game' }] };
  const result = await collectCountry(gplay, apple, 'US', {});
  const report = summarizeRun([result], ['US']);
  report.metadataErrors = [];
  assert.equal(report.status, 'partial');
  assert.equal(report.collected, 3);
  assert.equal(report.short, 3);
  assert.equal(report.charts.ios_us_free.status, 'empty');
  assert.match(reportMarkdown(report), /ios_us_free.*empty/);
  const malformed = await collectCountry(gplay, async () => ({}), 'CN', {});
  assert.equal(malformed.charts.ios_cn_grossing.status, 'error');
  assert.equal(summarizeRun([malformed], ['CN']).expected, 2);
});

test('a missing country result is not silently removed from the denominator', () => {
  const report = summarizeRun([], ['US', 'CN', 'RU']);
  assert.equal(report.expected, 8);
  assert.equal(report.status, 'failed');
});

test('nonempty short charts can form a complete run', () => {
  const charts = {
    ios_cn_grossing: { status: 'ok', count: 153 },
    ios_cn_free: { status: 'ok', count: 200 }
  };
  assert.equal(summarizeRun([{ charts }], ['CN']).status, 'complete');
});

test('snapshots preserve historical ranks and record failures without stale same-time data', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerscroll-global-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = 'ios_cn_grossing';
  store.appendRun('2026-01-01', '01:00', { [key]: ['1'] }, dir);
  store.appendRun('2026-01-01', '02:00', { [key]: ['2'] }, dir);
  const report = summarizeRun([], ['CN']);
  store.appendRun('2026-01-01', '02:00', {}, dir, report);
  const day = store.readDay('2026-01-01', dir);
  assert.deepEqual(day.lists[key].times, ['01:00']);
  assert.equal(day.runs['02:00'].status, 'failed');
  assert.deepEqual(store.expandDay(day), [{ key, time: '01:00', rank: 1, id: '1' }]);
  store.appendRun('2026-01-02', '01:00', {}, dir, report);
  assert.equal(store.readDay('2026-01-02', dir).runs['01:00'].collected, 0);
});

test('failed charts are collected before healthy charts, even within the same country', async () => {
  const calls = [];
  const apple = async (url, headers) => {
    calls.push(`${headers['X-Apple-Store-Front']}:${url.endsWith('38') ? 'grossing' : 'free'}`);
    return appleChart(['1']);
  };
  const previous = {
    ios_cn_grossing: { status: 'ok' }, ios_cn_free: { status: 'ok' },
    ios_ru_grossing: { status: 'ok' }, ios_ru_free: { status: 'error' }
  };
  const results = await collectPlanned({
    gplay: {}, apple, countries: ['CN', 'RU'], apps: {}, previous, concurrency: 2
  });
  assert.equal(calls[0], '143469,29:free');
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls).size, 4);
  const report = summarizeRun(results, ['CN', 'RU'], previous);
  assert.equal(report.scoreEligible, true);
  assert.ok(report.charts.ios_ru_free.observedAt);
});

test('state crosses day boundaries and partial country runs without losing last success', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerscroll-global-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = 'ios_cn_grossing';
  store.appendRun('2026-01-01', '23:00', { [key]: ['1'] }, dir);
  const previous = store.readCollectionState([key], dir);
  assert.equal(previous[key].status, 'ok');
  const report = summarizeRun([], ['CN'], previous);
  store.appendRun('2026-01-02', '01:00', {}, dir, report);
  store.appendRun('2026-01-02', '02:00', {}, dir, summarizeRun([], ['RU']));
  const state = store.readCollectionState([key], dir);
  assert.equal(state[key].status, 'error');
  assert.deepEqual(state[key].lastSuccess, { date: '2026-01-01', time: '23:00', count: 1, observedAt: null });
  const next = summarizeRun([], ['CN'], state);
  assert.equal(next.scoreEligible, false);
  assert.deepEqual(next.charts[key].lastSuccess, state[key].lastSuccess);
  assert.equal(next.charts[key].count, 0);
});
