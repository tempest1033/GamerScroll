// Cloudflare Pages middleware: country-based auto-routing for AIScroll.
// KR visitors hitting English paths get a 302 to the /ko/ equivalent.
// Bots, non-KR visitors, and direct /ko/ visitors pass through unchanged.

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const country = request.headers.get("CF-IPCountry") || "";
  const path = url.pathname;

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
