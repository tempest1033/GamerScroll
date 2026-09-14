const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { buildServiceWorker } = require('../src/build/service-worker');
const { prefetchUrl, navigationPrefetchScript } = require('../src/runtime/navigation-prefetch');

function fixture() {
  const origin = 'https://gamerscroll.com';
  const stores = new Map();
  const events = new Map();
  const requests = [];
  let now = 100000;
  let offline = false;
  let fetchGate;
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
      if (fetchGate) await fetchGate;
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
    hold() {
      let release;
      fetchGate = new Promise(resolve => { release = resolve; });
      return () => { fetchGate = null; release(); };
    },
    advance(ms) { now += ms; },
    offline() { offline = true; },
    headers(value) { responseHeaders = value; },
    prefetch(path) {
      return run('message', { source: { url: origin + '/' }, data: { type: 'gs-prefetch', url: new URL(path, origin).href } });
    },
    navigate(path, cache = 'default') {
      return run('fetch', { request: new Request(new URL(path, origin), { cache, headers: { accept: 'text/html' } }) });
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

test('a fresh document supports repeat navigation without extending its freshness window', async () => {
  const f = fixture();
  await f.prefetch('/rankings/');
  const response = await f.navigate('/rankings/');
  assert.equal(await response.text(), 'response-1');
  assert.equal(response.headers.has('x-gs-prefetched-at'), false);
  assert.equal(f.requests.length, 1);
  await f.navigate('/rankings/');
  assert.equal(f.requests.length, 1);
  f.advance(20001);
  await f.navigate('/rankings/');
  assert.equal(f.requests.length, 2);
});

test('navigation shares an in-flight prefetch and failed prefetch falls back safely', async () => {
  const f = fixture();
  const release = f.hold();
  const prefetch = f.prefetch('/rankings/free/');
  const navigation = f.navigate('/rankings/free/');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.requests.length, 1);
  release();
  await prefetch;
  assert.equal(await (await navigation).text(), 'response-1');
  const failed = fixture();
  failed.offline();
  await failed.prefetch('/rankings/');
  assert.equal((await failed.navigate('/rankings/')).status, 503);
});

test('visited rankings are reused briefly, but reloads and query strings request fresh data', async () => {
  const f = fixture();
  await f.navigate('/rankings/genres/');
  await f.navigate('/rankings/genres/');
  assert.equal(f.requests.length, 1);
  assert.equal(await (await f.navigate('/rankings/genres/', 'reload')).text(), 'response-2');
  for (let i = 0; i < 2; i++) await f.navigate('/rankings/?country=jp');
  assert.equal(f.requests.length, 4);
});

test('ranking menus warm two nearby documents after load, respecting data saver', () => {
  function run(saveData = false, genres = false) {
    const messages = [], callbacks = new Map(), timers = [];
    const anchor = (path, active = false) => ({
      href: 'https://gamerscroll.com' + path, target: '', rel: '',
      hasAttribute: () => false, classList: { contains: () => active }
    });
    vm.runInNewContext(navigationPrefetchScript, {
      URL, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
      location: { origin: 'https://gamerscroll.com', href: 'https://gamerscroll.com/rankings/', pathname: genres ? '/rankings/genres/' : '/rankings/' },
      navigator: { connection: { saveData }, serviceWorker: { controller: { postMessage: m => messages.push(m.url) } } },
      window: { addEventListener: (name, fn) => callbacks.set(name, fn) },
      document: {
        readyState: 'loading', visibilityState: 'visible', addEventListener() {},
        querySelectorAll: selector => selector.includes('subnav')
          ? [anchor('/rankings/', true), anchor('/rankings/free/'), anchor('/rankings/genres/')]
          : [anchor('/rankings/genres/rpg/'), anchor('/rankings/genres/casual-puzzle/')]
      }
    });
    assert.equal(messages.length, 0);
    callbacks.get('load')?.();
    timers.forEach(fn => fn());
    return messages;
  }
  assert.deepEqual(run(), ['https://gamerscroll.com/rankings/free/', 'https://gamerscroll.com/rankings/genres/']);
  assert.deepEqual(run(true), []);
  assert.deepEqual(run(false, true), ['https://gamerscroll.com/rankings/genres/rpg/', 'https://gamerscroll.com/rankings/genres/casual-puzzle/']);
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
