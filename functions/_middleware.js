// Cloudflare Pages middleware for AIScroll (aiscroll.io) only.
// The AIScroll deploy ships this file as functions/_middleware.js (see .github/workflows/ai-build.yml).
// GamerScroll has its own middleware in functions/_middleware.js; the two share no code.
//
// Job: send visitors from Korea to the /ko/ tree. Everyone else, bots, static files and visitors who opted
// out with ?lang=en stay on the English tree at the root.

const BOT_UA_RE = /(?:^|[^a-z])(?:googlebot|bingbot|baiduspider|duckduckbot|yandexbot|naverbot|yeti|facebookexternalhit|twitterbot|whatsapp|slackbot|applebot|petalbot|sogou|seznambot|ahrefsbot|semrushbot|mj12bot|crawler|spider|scrapy|wget|curl)/;

function isStaticPath(path) {
  return (
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
  );
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const country = request.headers.get("CF-IPCountry") || "";
  const path = url.pathname;
  const host = (request.headers.get("host") || url.hostname || "").toLowerCase();

  // Country routing applies on the production host only (not on *.pages.dev previews).
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
  if (isStaticPath(path)) return next();

  // Bot UA pass-through — search engines always see the English tree for indexing.
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  if (BOT_UA_RE.test(ua)) return next();

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
