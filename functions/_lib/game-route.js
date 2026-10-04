// Request-time game detail pages: /games/<slug>/ (en) and /<prefix>/games/<slug>/ (ja, zh-cn, ko, zh-tw).
// Data comes from the static assets (docs/games-data/<slug>.json + _meta.json); rendering is the same pure template
// the Node tests use (bundle: scripts/build-game-ssr.js → game-ssr.js). Shared with the AIScroll project's functions/,
// so everything here acts only on the gamerscroll.com host and falls through otherwise.
import { createRenderer, BUNDLE_VERSION } from './game-ssr.js';

const PREFIX = { en: '', ja: '/ja', 'zh-cn': '/zh-cn', ko: '/ko', 'zh-tw': '/zh-tw' };
// The data version only changes with a build (every 30 minutes); the cached page is keyed by it.
const HTML_CACHE_CONTROL = 'public, max-age=300, s-maxage=1800, stale-while-revalidate=600';
const META_TTL_MS = 30 * 1000;

const renderers = new Map(); // edition code → renderer (a module graph per edition, see src/build/game-ssr-entry.js)
let metaCache = null; // { at, value }

function rendererFor(code) {
  if (!renderers.has(code)) renderers.set(code, createRenderer(code));
  return renderers.get(code);
}

async function assetJson(env, url, path) {
  const response = await env.ASSETS.fetch(new Request(new URL(path, url)));
  return response.ok ? response.json() : null;
}

async function loadMeta(env, url) {
  if (metaCache && Date.now() - metaCache.at < META_TTL_MS) return metaCache.value;
  const value = await assetJson(env, url, '/games-data/_meta.json');
  if (value) metaCache = { at: Date.now(), value };
  return value;
}

// The edition's static 404 page (docs/<prefix>/404.html, served by Pages at the extension-less path) with a real 404 status.
async function notFound(env, url, code, method) {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex' };
  let page = await env.ASSETS.fetch(new Request(new URL(`${PREFIX[code]}/404`, url)));
  if (page.status >= 300 && page.status < 400 && page.headers.get('location')) page = await env.ASSETS.fetch(new Request(new URL(page.headers.get('location'), url)));
  const body = page.ok ? await page.text() : 'Not found';
  return new Response(method === 'HEAD' ? null : body, { status: 404, headers });
}

export async function handleGameRequest(context, code) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const host = (request.headers.get('host') || url.hostname).toLowerCase();
  if (!host.includes('gamerscroll.com')) return next();
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();

  const match = url.pathname.slice(PREFIX[code].length).match(/^\/games\/([^/]+)\/?$/);
  if (!match) return next();
  // /games/search-index.json and any other file under /games/ belong to the static assets.
  if (match[1].includes('.')) return next();

  let slug;
  try { slug = decodeURIComponent(match[1]).normalize('NFC'); } catch { return notFound(env, url, code, request.method); }
  if (slug.startsWith('_')) return notFound(env, url, code, request.method);

  const meta = await loadMeta(env, url);
  if (!meta) return new Response('Game data unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}${url.pathname}?v=${meta.version}.${BUNDLE_VERSION}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(request.method === 'HEAD' ? null : cached.body, cached);
    hit.headers.set('X-GS-Cache', 'HIT');
    return hit;
  }

  const game = await assetJson(env, url, `/games-data/${encodeURIComponent(slug)}.json`);
  if (!game) return notFound(env, url, code, request.method);

  let html;
  try { html = rendererFor(code).render(game, meta); } catch (error) {
    return new Response('Render failed', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const response = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': HTML_CACHE_CONTROL, 'Content-Language': code } });
  if (context.waitUntil) context.waitUntil(cache.put(cacheKey, response.clone())); else await cache.put(cacheKey, response.clone());
  const miss = new Response(request.method === 'HEAD' ? null : html, response);
  miss.headers.set('X-GS-Cache', 'MISS');
  return miss;
}
