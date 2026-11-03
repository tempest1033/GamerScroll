import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs-mw-')), 'middleware.mjs');
await esbuild.build({ entryPoints: [path.join(root, 'functions/_middleware.js')], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
const { onRequest } = await import(pathToFileURL(outfile).href);

// zh-cn builds no 'idle' genre, no 'bilibili' publisher; ja builds both; 'zz' is built in ja only.
const plan = (genres, publishers) => ({ genres: ['all', ...genres], publisherHub: true, publishers, monthly: ['2026-10'], records: true });
const plans = { en: plan(['rpg', 'tcg', 'idle'], []), ja: plan(['rpg', 'idle', 'zz'], ['bilibili']), 'zh-cn': plan(['rpg'], []), ko: plan(['rpg', 'idle'], []), 'zh-tw': plan(['rpg'], []) };
const ASSETS = { fetch: async (req) => (new URL(req.url).pathname === '/games-data/_pages.json' ? new Response(JSON.stringify(plans)) : new Response('nope', { status: 404 })) };

async function visit(pathname, { country = '', ua = 'Mozilla/5.0', cookie = '' } = {}) {
  const headers = { host: 'gamerscroll.com', 'CF-IPCountry': country, 'User-Agent': ua };
  if (cookie) headers.Cookie = cookie;
  const res = await onRequest({ request: new Request(`https://gamerscroll.com${pathname}`, { headers }), env: { ASSETS }, next: async () => new Response('page', { status: 200 }) });
  return { status: res.status, location: res.headers.get('location') };
}

test('edition auto-redirect lands on a built page or its nearest built parent', async () => {
  assert.deepEqual(await visit('/rankings/genres/idle/', { country: 'CN' }), { status: 302, location: '/zh-cn/rankings/genres/' });
  assert.deepEqual(await visit('/rankings/genres/rpg/', { country: 'CN' }), { status: 302, location: '/zh-cn/rankings/genres/rpg/' });
  assert.deepEqual(await visit('/rankings/genres/idle/', { country: 'JP' }), { status: 302, location: '/ja/rankings/genres/idle/' });
  assert.deepEqual(await visit('/rankings/genres/tcg/', { ua: 'Mozilla/5.0 (compatible; Baiduspider/2.0)' }), { status: 302, location: '/zh-cn/rankings/genres/' });
});

test('removed market pages 301 to the edition\'s nearest built parent; unknown URLs stay 404-able', async () => {
  assert.deepEqual(await visit('/rankings/genres/zz/', { ua: 'Googlebot' }), { status: 301, location: 'https://gamerscroll.com/rankings/genres/' });
  assert.deepEqual(await visit('/zh-cn/rankings/genres/idle/'), { status: 301, location: 'https://gamerscroll.com/zh-cn/rankings/genres/' });
  assert.deepEqual(await visit('/rankings/publishers/bilibili/'), { status: 301, location: 'https://gamerscroll.com/rankings/publishers/' });
  assert.deepEqual(await visit('/ko/rankings/monthly/2026-11/'), { status: 200, location: null }); // built nowhere → untouched
  assert.deepEqual(await visit('/zh-cn/rankings/genres/idle/?a=1'), { status: 301, location: 'https://gamerscroll.com/zh-cn/rankings/genres/?a=1' });
  assert.equal((await visit('/ja/rankings/genres/zz/')).status, 200);
});


