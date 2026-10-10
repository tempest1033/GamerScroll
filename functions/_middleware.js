// Cloudflare Pages middleware for GamerScroll (gamerscroll.com) only: edition routing + legacy redirects.
// AIScroll has its own middleware in functions-aiscroll/_middleware.js; the two share no code.

let aiscrollArticleIndexPromise = null;

// AIScroll 검색 인덱스(현재 빌드된 기사 slug→category). 성공 응답만 isolate에 캐시하고
// 실패는 다음 요청에서 다시 시도한다 (실패를 빈 목록으로 캐시하면 모든 슬러그가 "없음"이 됨).
async function loadAiscrollArticleIndex() {
  if (!aiscrollArticleIndexPromise) {
    aiscrollArticleIndexPromise = fetch("https://aiscroll.io/ko/articles-search.json", {
      cf: { cacheTtl: 300, cacheEverything: true }
    })
      .then((res) => (res && res.ok ? res.json() : null))
      .catch(() => null);
  }
  const list = await aiscrollArticleIndexPromise;
  if (!Array.isArray(list)) {
    aiscrollArticleIndexPromise = null;
    return null;
  }
  return list;
}

// slug → category. null = AIScroll에 없는 기사, undefined = 인덱스 조회 실패(판단 불가).
async function resolveAiscrollCategory(slug) {
  if (!slug) return null;
  const list = await loadAiscrollArticleIndex();
  if (!list) return undefined;
  const found = list.find((item) => item && item.slug === slug);
  return found ? (found.category || "news") : null;
}

// 삭제·미발행 기사: 존재하지 않는 페이지로 301 보내 soft-404 체인을 만들지 않고 410으로 닫는다.
function goneResponse() {
  return new Response("Gone", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex"
    }
  });
}

const GS_LOCALE_PREFIXES = ["ko", "ja", "zh-cn", "zh-tw"];
const GS_LOCALES = ["en", ...GS_LOCALE_PREFIXES];
const GS_COUNTRY_LOCALE = { KR: "ko", JP: "ja", CN: "zh-cn", TW: "zh-tw" };
// Path prefixes that never get the edition redirect (none: game pages are localized since they render per edition).
const GS_LOCALE_EXCLUDED_PREFIXES = [];
const BOT_UA_RE = /(?:^|[^a-z])(?:googlebot|bingbot|baiduspider|duckduckbot|yandexbot|naverbot|yeti|facebookexternalhit|twitterbot|whatsapp|slackbot|applebot|petalbot|sogou|seznambot|ahrefsbot|semrushbot|mj12bot|crawler|spider|scrapy|wget|curl)/;

function gsLocalePrefixOf(path) {
  return GS_LOCALE_PREFIXES.find((p) => path === "/" + p || path.startsWith("/" + p + "/")) || null;
}

function gsIsStaticPath(path) {
  return (
    path.startsWith("/assets/") ||
    path.startsWith("/favicon") ||
    path === "/manifest.json" ||
    path === "/robots.txt" ||
    /^\/sitemap[^/]*\.xml$/.test(path) ||
    path === "/rss.xml" ||
    path === "/service-worker.js" ||
    path === "/ads.txt" ||
    /\.(?!html$)[a-z0-9]+$/i.test(path.split("/").pop())
  );
}

async function handleGamerScrollLegacyRedirect(url, fullPath) {
  // Removed-section rules apply at the root and under any locale prefix.
  const prefix = gsLocalePrefixOf(fullPath);
  const path = prefix ? fullPath.slice(prefix.length + 1) || "/" : fullPath;

  if (path === "/magazine" || path.startsWith("/magazine/")) return goneResponse();
  if (path === "/reports" || path.startsWith("/reports/")) return goneResponse();
  if (/^\/tech\/normal\/[^/]+\/?$/.test(path)) return goneResponse();

  // 구 /tech/ai|vibecoding/<slug> → AIScroll 기사 (인덱스로 현재 카테고리 확인).
  const match = path.match(/^\/tech\/(ai|vibecoding)\/([^/]+)(\/.*)?$/);
  if (match) {
    const section = match[1];
    const slug = decodeURIComponent(match[2] || "");
    const suffix = match[3] && match[3] !== "/" ? match[3] : "/";
    const category = await resolveAiscrollCategory(slug);
    if (category === null) return goneResponse();
    // 인덱스 조회 실패 시 기본값: 2026-09 재출발 후 카테고리는 글 종류(news/guides/…)라 섹션과 무관
    const resolved = category || "news";
    const target = `https://aiscroll.io/ko/article/${resolved}/${encodeURIComponent(slug)}${suffix}`;
    return Response.redirect(target + url.search, 301);
  }

  // 잔여 /tech/* (허브 페이지) → AIScroll 홈.
  // 과거 docs/_redirects의 /tech/* 캐치올은 동적 룰 상한으로 항상 죽어 있었음 — 여기서 의도 복원.
  if (path === "/tech" || path.startsWith("/tech/")) {
    return Response.redirect("https://aiscroll.io/ko/", 301);
  }

  // 2026-09-09 위키·출시 게임 섹션 폐기: 옛 URL은 가장 가까운 허브(리포트·게임 DB)로 301.
  if (path === "/wiki" || path.startsWith("/wiki/")) {
    return Response.redirect(`${url.origin}/rankings/`, 301);
  }
  // 2026-10 구 트렌드 섹션(/trend/, /trends/) → 새 트렌딩 페이지 (언어판 접두사 유지)
  if (/^\/trends?(\/|$)/.test(path)) {
    return Response.redirect(`${url.origin}${prefix ? "/" + prefix : ""}/trending/`, 301);
  }
  if (path === "/upcoming" || path === "/upcoming/" || path === "/upcoming.html") {
    return Response.redirect(`${url.origin}/games/`, 301);
  }

  return null;
}

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
    if (gsLocalePrefixOf(path)) return next();
    // RSS 피드는 리포트 섹션과 함께 없어졌다 (2026-10): 404 대신 410
    if (path === "/rss.xml" || path === "/feed" || path === "/feed/") return goneResponse();
    if (gsIsStaticPath(path)) return next();
    const gsUa = (request.headers.get("User-Agent") || "").toLowerCase();
    if (BOT_UA_RE.test(gsUa)) return next();
    if (GS_LOCALE_EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) return next();

    const queryLocale = url.searchParams.get("locale");
    const hasQuery = GS_LOCALES.includes(queryLocale);
    const cookieMatch = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)gs_locale=([a-z-]+)(?:;|$)/);
    const cookieLocale = cookieMatch && GS_LOCALES.includes(cookieMatch[1]) ? cookieMatch[1] : null;
    const preferred = (hasQuery && queryLocale) || cookieLocale || GS_COUNTRY_LOCALE[country] || "en";
    const setCookie = `gs_locale=${queryLocale}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;

    if (preferred !== "en") {
      const headers = new Headers({
        Location: `/${preferred}${path}${url.search}`,
        "Cache-Control": "private, no-store"
      });
      if (hasQuery) headers.append("Set-Cookie", setCookie);
      return new Response(null, { status: 302, headers });
    }
    const response = await next();
    if (!hasQuery) return response;
    try {
      const cloned = new Response(response.body, response);
      cloned.headers.append("Set-Cookie", setCookie);
      return cloned;
    } catch {
      return response;
    }
  }

  // Any other host (e.g. *.pages.dev previews): no routing.
  return next();
}
