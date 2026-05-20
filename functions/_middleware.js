// Cloudflare Pages middleware: AIScroll locale routing + GamerScroll legacy redirects.

let aiscrollArticleIndexPromise = null;

async function resolveAiscrollCategory(slug, fallback = "general") {
  if (!slug) return fallback;
  if (!aiscrollArticleIndexPromise) {
    aiscrollArticleIndexPromise = fetch("https://aiscroll.io/ko/articles-search.json", {
      cf: { cacheTtl: 300, cacheEverything: true }
    })
      .then((res) => (res && res.ok ? res.json() : []))
      .catch(() => []);
  }
  const list = await aiscrollArticleIndexPromise.catch(() => []);
  const found = Array.isArray(list) ? list.find((item) => item && item.slug === slug) : null;
  return (found && found.category) || fallback;
}

async function handleGamerScrollLegacyRedirect(url, path) {
  const match = path.match(/^\/tech\/(ai|vibecoding)\/([^/]+)(\/.*)?$/);
  if (!match) return null;

  const section = match[1];
  const slug = decodeURIComponent(match[2] || "");
  const suffix = match[3] && match[3] !== "/" ? match[3] : "/";
  const category = section === "vibecoding"
    ? "vibecoding"
    : await resolveAiscrollCategory(slug, "general");
  const target = `https://aiscroll.io/ko/article/${category}/${encodeURIComponent(slug)}${suffix}`;
  return Response.redirect(target + url.search, 301);
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const country = request.headers.get("CF-IPCountry") || "";
  const path = url.pathname;
  const host = (request.headers.get("host") || url.hostname || "").toLowerCase();

  if (host.includes("gamerscroll.com")) {
    const legacyRedirect = await handleGamerScrollLegacyRedirect(url, path);
    if (legacyRedirect) return legacyRedirect;
    return next();
  }

  // HARD INVARIANT: KR auto-routing applies only to aiscroll.io.
  // functions/ is at repo root so Cloudflare Pages deploys it for BOTH
  // GamerScroll(docs/) and AIScroll(ai-docs/) projects. Skip on any non-aiscroll host.
  if (!host.includes("aiscroll.io")) return next();

  // Already on /ko/ tree — let it through.
  if (path === "/ko" || path.startsWith("/ko/")) return next();

  // EN opt-out: ?lang=en query sets a 1-year cookie so the preference persists.
  // aiscroll_lang=en cookie also pass-through on subsequent requests.
  if (url.searchParams.get("lang") === "en") {
    const response = await next();
    try {
      const cloned = new Response(response.body, response);
      cloned.headers.append("Set-Cookie", "aiscroll_lang=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
      return cloned;
    } catch {
      return response;
    }
  }
  const cookie = request.headers.get("Cookie") || "";
  if (/(?:^|;\s*)aiscroll_lang=en(?:;|$)/.test(cookie)) return next();

  // Skip static assets / API-ish paths from country redirect to keep CDN/SEO predictable.
  if (
    path.startsWith("/assets/") ||
    path.startsWith("/favicon") ||
    path === "/manifest.json" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/rss.xml" ||
    path === "/service-worker.js" ||
    path === "/ads.txt" ||
    path === "/og-image.png" ||
    path.startsWith("/articles") ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|json|xml|txt|map)$/i.test(path)
  ) {
    return next();
  }

  // Bot UA pass-through — search engines always see the English tree for indexing.
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  if (/(?:^|[^a-z])(?:googlebot|bingbot|baiduspider|duckduckbot|yandexbot|naverbot|yeti|facebookexternalhit|twitterbot|whatsapp|slackbot|applebot|petalbot|sogou|seznambot|ahrefsbot|semrushbot|mj12bot|crawler|spider|scrapy|wget|curl)/.test(ua)) {
    return next();
  }

  if (country === "KR") {
    const target = "/ko" + (path === "/" ? "/" : path);
    return Response.redirect(new URL(target + url.search, url.origin).toString(), 302);
  }

  const response = await next();
  // Debug: surface detected country header so we can diagnose middleware reach.
  try {
    const cloned = new Response(response.body, response);
    cloned.headers.set("X-AIScroll-Country", country || "none");
    cloned.headers.set("X-AIScroll-Middleware", "v1");
    return cloned;
  } catch {
    return response;
  }
}
