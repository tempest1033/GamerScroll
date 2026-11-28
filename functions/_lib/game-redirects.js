// Redirect maps read from the static assets. A failed read is not cached, so the next request tries again; the last good map
// is kept meanwhile. A loader returns null while no map has ever been read: a key is then neither known current nor known moved.
const TTL_MS = 5 * 60 * 1000;
function assetMap(assetPath) {
  let cache = null; // { at, value }
  return async (env, url) => {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
    try {
      const response = await env.ASSETS.fetch(new Request(new URL(assetPath, url)));
      if (response.ok) {
        const value = await response.json();
        if (value && typeof value === 'object') cache = { at: Date.now(), value };
      }
    } catch {
      // keep the previous map
    }
    return cache ? cache.value : null;
  };
}

// Retired game slug → current slug (docs/games-data/_redirects.json, written by scripts/generate-game-pages.js).
// Shared by the middleware (which settles host, edition and slug in one redirect) and the game route.
export const loadGameRedirects = assetMap('/games-data/_redirects.json');

// Steam app ID → slug of the game page that carries its Steam record (docs/games-data/_steam.json, src/build/editions.js).
export const loadSteamPages = assetMap('/games-data/_steam.json');

// Slug of a game detail path (/games/<slug>[/]), NFC-decoded; null for the hub, files under /games/ and malformed encodings.
export function gameSlugOf(barePath) {
  const match = /^\/games\/([^/]+)\/?$/.exec(barePath);
  if (!match || match[1].includes('.')) return null;
  try { return decodeURIComponent(match[1]).normalize('NFC'); } catch { return null; }
}

// App ID of a Steam record path (/steam/<appid>[/]); null for the hub and anything else.
export function steamAppOf(barePath) {
  const match = /^\/steam\/(\d+)\/?$/.exec(barePath);
  return match ? match[1] : null;
}
