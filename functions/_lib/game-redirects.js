// Retired game slug → current slug (docs/games-data/_redirects.json, written by scripts/generate-game-pages.js).
// Shared by the middleware (which settles host, edition and slug in one redirect) and the game route.
// A failed read is not cached, so the next request tries again; the last good map is kept meanwhile.
// Returns null while no map has ever been read: a slug is then neither known current nor known retired.
const TTL_MS = 5 * 60 * 1000;
let cache = null; // { at, value }

export async function loadGameRedirects(env, url) {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/games-data/_redirects.json', url)));
    if (response.ok) {
      const value = await response.json();
      if (value && typeof value === 'object') cache = { at: Date.now(), value };
    }
  } catch {
    // keep the previous map
  }
  return cache ? cache.value : null;
}

// Slug of a game detail path (/games/<slug>[/]), NFC-decoded; null for the hub, files under /games/ and malformed encodings.
export function gameSlugOf(barePath) {
  const match = /^\/games\/([^/]+)\/?$/.exec(barePath);
  if (!match || match[1].includes('.')) return null;
  try { return decodeURIComponent(match[1]).normalize('NFC'); } catch { return null; }
}
