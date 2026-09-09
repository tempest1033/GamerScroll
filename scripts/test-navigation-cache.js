const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { buildServiceWorker } = require('../src/build/service-worker');
const { prefetchUrl } = require('../src/runtime/navigation-prefetch');

function fixture() {
  const origin = 'https://gamerscroll.com';
  const stores = new Map();
  const events = new Map();
  const requests = [];
  let now = 100000;
  let offline = false;
  let responseHeaders = { 'content-type': 'text/html' };
  const key = request => typeof request === 'string' ? new URL(request, origin).href : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { store.set(key(request), response.clone()); },
        async delete(request) { return store.delete(key(request)); },
        async keys() { return [...store.keys()].map(url => new Request(url)); },
        async addAll() {}
      };
    },
    async match(request) {
      for (const store of stores.values()) {
        if (store.has(key(request))) return store.get(key(request)).clone();
      }
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const self = {
    location: { origin },
    clients: { async claim() {} },
    skipWaiting() {},
    addEventListener(name, callback) { events.set(name, callback); }
  };
  vm.runInNewContext(buildServiceWorker({ version: 'gamerscroll-test', precache: [] }), {
    self, caches, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
    Date: { now: () => now },
    async fetch(request) {
      requests.push(key(request));
      if (offline) throw new Error('offline');
      return new Response(`response-${requests.length}`, { headers: responseHeaders });
    }
  });
  async function run(name, event) {
    let result;
    const work = [];
    events.get(name)({
      ...event,
      respondWith(value) { result = value; },
      waitUntil(value) { work.push(value); }
    });
    const response = await result;
    await Promise.all(work);
    return response;
  }
  return {
    requests, caches,
    advance(ms) { now += ms; },
    offline() { offline = true; },
    headers(value) { responseHeaders = value; },
    prefetch(path) {
      return run('message', { source: { url: origin + '/' }, data: { type: 'gs-prefetch', url: new URL(path, origin).href } });
    },
    navigate(path) {
      return run('fetch', { request: new Request(new URL(path, origin), { headers: { accept: 'text/html' } }) });
    },
    asset(path) { return run('fetch', { request: new Request(new URL(path, origin)) }); },
    activate() { return run('activate', {}); }
  };
}

test('prefetch only admits canonical public same-origin documents', () => {
  const origin = 'https://gamerscroll.com';
  for (const path of ['/', '/games/', '/rankings/jp/', '/steam/730/', '/reports/', '/magazine/ranking/example/']) {
    assert.equal(prefetchUrl(path, origin), origin + path);
  }
  for (const path of ['/games/?q=test', '/games/#initial-A', '/assets/image.png', '/account/', 'https://outside.test/games/', 'https://user:pass@gamerscroll.com/games/']) {
    assert.equal(prefetchUrl(path, origin), null);
  }
});

test('an intent-prefetched document is consumed once without a second navigation fetch', async () => {
  const f = fixture();
  await f.prefetch('/rankings/');
  const response = await f.navigate('/rankings/');
  assert.equal(await response.text(), 'response-1');
  assert.equal(response.headers.has('x-gs-prefetched-at'), false);
  assert.equal(f.requests.length, 1);
  await f.navigate('/rankings/');
  assert.equal(f.requests.length, 2);
});

test('prefetch expires quickly, excludes private responses, and caps stored documents', async () => {
  const f = fixture();
  await f.prefetch('/rankings/');
  f.advance(20001);
  assert.equal(await (await f.navigate('/rankings/')).text(), 'response-2');
  f.headers({ 'content-type': 'text/html', 'cache-control': 'private, no-store' });
  await f.prefetch('/games/');
  await f.navigate('/games/');
  assert.equal(f.requests.length, 4);
  f.headers({ 'content-type': 'text/html' });
  for (let i = 0; i < 7; i++) await f.prefetch(`/steam/${i}/`);
  assert.equal((await (await f.caches.open('gamerscroll-test-prefetch')).keys()).length, 4);
});

test('immutable assets avoid revalidation while mutable data and query-specific offline pages stay correct', async () => {
  const f = fixture();
  await f.asset('/assets/layout-runtime.js?v=12345678');
  await f.asset('/assets/layout-runtime.js?v=12345678');
  assert.equal(f.requests.length, 1);
  await f.asset('/rankings/grossing-ios.json');
  await f.asset('/rankings/grossing-ios.json');
  assert.equal(f.requests.length, 3);
  await f.navigate('/games/?q=one');
  f.offline();
  assert.equal(await (await f.navigate('/games/?q=one')).text(), 'response-4');
  assert.equal((await f.navigate('/games/?q=two')).status, 503);
});

test('activation retains only this build without deleting unrelated caches', async () => {
  const f = fixture();
  await f.caches.open('gamerscroll-old-static');
  await f.caches.open('other-app-cache');
  await f.caches.open('gamerscroll-test-static');
  await f.activate();
  assert.deepEqual(await f.caches.keys(), ['other-app-cache', 'gamerscroll-test-static']);
});
