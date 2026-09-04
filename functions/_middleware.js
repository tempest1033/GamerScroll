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
  if (match) {
    const section = match[1];
    const slug = decodeURIComponent(match[2] || "");
    const suffix = match[3] && match[3] !== "/" ? match[3] : "/";
    const category = section === "vibecoding"
      ? "vibecoding"
      : await resolveAiscrollCategory(slug, "general");
    const target = `https://aiscroll.io/ko/article/${category}/${encodeURIComponent(slug)}${suffix}`;
    return Response.redirect(target + url.search, 301);
  }

  // tech/normal → 게이머스크롤 매거진 재배치 (2026-08-02): 소스 JSON은 reports/issue·hotpick으로 이동됨.
  const normalMatch = path.match(/^\/tech\/normal\/([^/]+)\/?$/);
  if (normalMatch) {
    const slug = decodeURIComponent(normalMatch[1] || "");
    const type = TECH_NORMAL_MOVED[slug];
    if (type) {
      return Response.redirect(`${url.origin}/magazine/${type}/${encodeURIComponent(slug)}/` + url.search, 301);
    }
  }

  // 잔여 /tech/* (허브·미이관 슬러그) → AIScroll 홈.
  // 과거 docs/_redirects의 /tech/* 캐치올은 동적 룰 상한으로 항상 죽어 있었음 — 여기서 의도 복원.
  if (path === "/tech" || path.startsWith("/tech/")) {
    return Response.redirect("https://aiscroll.io/ko/", 301);
  }

  return null;
}

// 2026-08-02 매거진 재배치 슬러그 맵 (구 /tech/normal/<slug> → /magazine/<type>/<slug>/)
const TECH_NORMAL_MOVED = {
  "intel-core-ultra-200s-plus": "issue",
  "macbook-neo-reviews": "issue",
  "nakwon-last-paradise-cbt": "issue",
  "nvidia-dlss5-controversy": "issue",
  "rewinding-cadence-technical-test": "issue",
  "2d-animation-tech": "hotpick",
  "agile-jira-confluence-game-dev": "hotpick",
  "firebase-serverless-game-backend": "hotpick",
  "game-engine": "hotpick",
  "gantt-chart": "hotpick",
  "python-pandas-data-analysis": "hotpick",
  "version-control-system": "hotpick"
};

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const country = request.headers.get("CF-IPCountry") || "";
  const path = url.pathname;
  const host = (request.headers.get("host") || url.hostname || "").toLowerCase();

  if (host.includes("gamerscroll.com")) {
    // www -> non-www 301: consolidate to the canonical bare host so Google does
    // not crawl both hosts and split indexing signals.
    if (host.startsWith("www.")) {
      return Response.redirect("https://gamerscroll.com" + path + url.search, 301);
    }
    const legacyRedirect = await handleGamerScrollLegacyRedirect(url, path);
    if (legacyRedirect) return legacyRedirect;
    // Privacy data fragment (fetched by layout.js) must not be indexed as a
    // standalone page — it duplicates the real /privacy/ page.
    if (path === "/assets/privacy-content" || path === "/assets/privacy-content.html") {
      const response = await next();
      try {
        const cloned = new Response(response.body, response);
        cloned.headers.set("X-Robots-Tag", "noindex");
        return cloned;
      } catch {
        return response;
      }
    }
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
