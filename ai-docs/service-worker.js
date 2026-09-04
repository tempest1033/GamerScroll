const CACHE_NAME = 'aiscroll-6bff2ec20968';
const STATIC_CACHE = CACHE_NAME + '-static';
const RUNTIME_CACHE = CACHE_NAME + '-runtime';
const PRECACHE_URLS = [
  '/',
  '/styles-core.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/assets/layout-core.js'
];
const STATIC_EXT_RE = /\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|json)$/i;

async function cachePut(cacheName, request, response) {
  if (!response || response.status !== 200) return response;
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl = '') {
  try {
    const response = await fetch(request);
    return cachePut(cacheName, request, response);
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';
  const isHtml = request.mode === 'navigate' || accept.includes('text/html');
  const isStatic = url.pathname.startsWith('/assets/') ||
    url.pathname === '/articles-search.json' ||
    STATIC_EXT_RE.test(url.pathname);

  if (isHtml) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, '/'));
    return;
  }

  if (isStatic) {
    // ?v= 쿼리 또는 hash-named 경로(/x.abcd1234.css)는 immutable → SWR 안전.
    // 그 외 unversioned 경로는 network-first로 신선도 우선 (build 직후 stale CSS/JS 방지).
    const isImmutable = url.searchParams.has('v') || /\.[a-f0-9]{8,}\./i.test(url.pathname);
    if (!isImmutable) {
      event.respondWith(networkFirst(request, STATIC_CACHE));
      return;
    }
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      const revalidate = fetch(request)
        .then((response) => cachePut(STATIC_CACHE, request, response))
        .catch(() => null);

      if (cached) {
        event.waitUntil(revalidate);
        return cached;
      }

      const fresh = await revalidate;
      if (fresh) return fresh;
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })());
    return;
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});
