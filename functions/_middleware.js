// Cloudflare Pages middleware for GamerScroll (gamerscroll.com) only: edition routing + legacy redirects.
// AIScroll has its own middleware in functions-aiscroll/_middleware.js; the two share no code.

import marketPlan from "./_lib/market-plan.js";
import { loadGameRedirects, gameSlugOf } from "./_lib/game-redirects.js";

let aiscrollArticleIndexPromise = null;
const MARKET_PLANS_TTL_MS = 5 * 60 * 1000;
let marketPlans = null;
let marketPlansAt = 0;
let marketPlansLoading = null;

// Per-edition market page plan written by the build (docs/games-data/_pages.json). null = unavailable (routing then ignores it).
// Re-read after a short TTL so a stale plan, or a deploy that was briefly missing the file, recovers without a new isolate;
// a failed refresh keeps the last good plan.
async function loadMarketPlans(context, url) {
  if (marketPlans && Date.now() - marketPlansAt < MARKET_PLANS_TTL_MS) return marketPlans;
  if (!marketPlansLoading) {
    marketPlansLoading = (async () => {
      try {
        const res = await context.env.ASSETS.fetch(new Request(new URL("/games-data/_pages.json", url)));
        if (res.ok) {
          marketPlans = await res.json();
          marketPlansAt = Date.now();
        }
      } catch {
        // keep the previous plan
      } finally {
        marketPlansLoading = null;
      }
    })();
  }
  await marketPlansLoading;
  return marketPlans;
}

// Path (without edition prefix) of the page in an edition: itself, or its nearest built parent when the edition does not build it.
// Pages built nowhere are not ours to redirect (they stay a plain 404).
function marketTarget(plans, code, bare) {
  const withSlash = bare.endsWith("/") ? bare : bare + "/";
  if (!plans || !plans[code] || !marketPlan.isMarketPath(withSlash)) return null;
  if (marketPlan.available(plans[code], withSlash)) return null;
  if (!marketPlan.builtSomewhere(plans, withSlash)) return null;
  return marketPlan.nearestBuilt(plans[code], withSlash);
}

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
// Regional search engines get their market's edition (they ignore hreflang and index root URLs as-is).
// Googlebot/Bingbot and all other bots are deliberately absent: they keep 200 on root URLs.
const GS_SEARCH_ENGINE_LOCALE = { yeti: "ko", naverbot: "ko", daumoa: "ko", baiduspider: "zh-cn", sogou: "zh-cn", "360spider": "zh-cn" };
const GS_SEARCH_ENGINE_RE = new RegExp(`(?:^|[^a-z])(${Object.keys(GS_SEARCH_ENGINE_LOCALE).join("|")})`);
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

// The 16 ranking articles of the removed magazine (all Korean, about the Korean market; published 2026-01..2026-09) and
// the chart each one covered: a month of the Korean mobile revenue ranking ("YYYY-MM"), the Korean subculture ranking,
// or the Steam ranking. Any other /magazine/ranking/ URL never existed and stays 410.
const GS_RANKING_ARTICLES = {
  "mobile-january-2026-kr": "2026-01",
  "mobile-february-2026-kr": "2026-02",
  "mobile-june-2026-kr": "2026-06",
  "mobile-july-2026-kr": "2026-07",
  "lunar-new-year-2026-kr": "2026-02",
  "subculture-january-2026-kr": "subculture",
  "subculture-february-2026-kr": "subculture",
  "subculture-april-2026-kr": "subculture",
  "subculture-may-2026-kr": "subculture",
  "subculture-june-2026-kr": "subculture",
  "subculture-july-2026-kr": "subculture",
  "subculture-august-2026-kr": "subculture",
  "endfield-vs-dragonsword-new-year-2026": "subculture",
  "steam-january-2026": "steam",
  "steam-february-2026": "steam",
  "steam-april-2026": "steam"
};
// Successor of a ranking article in the edition the URL belongs to (the unprefixed URLs were the Korean site).
// Steam has the same page in every edition. The monthly and subculture pages of another edition show that edition's
// own market, so there the successor is the edition's Korean revenue ranking (/rankings/kr/).
function rankingArticleTarget(path, prefix, plans) {
  const m = /^\/magazine\/ranking\/([^/]+)\/?$/.exec(path);
  const chart = m && Object.prototype.hasOwnProperty.call(GS_RANKING_ARTICLES, m[1]) ? GS_RANKING_ARTICLES[m[1]] : null;
  if (!chart) return null;
  const edition = prefix || "ko";
  if (chart === "steam") return `/${edition}/steam/`;
  if (edition !== "ko") return `/${edition}/rankings/kr/`;
  return "/ko" + marketPlan.nearestBuilt(plans && plans.ko, chart === "subculture" ? "/rankings/genres/subculture/" : `/rankings/monthly/${chart}/`);
}

// Edition a root URL is served in for this visitor: { locale, cookie } (cookie = Set-Cookie value when ?locale= chose it),
// or null for bots, which stay on the URL they asked for. Regional search engines always get their market's edition.
function gsEditionChoice(request, url, country) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  const engine = ua.match(GS_SEARCH_ENGINE_RE);
  if (engine) return { locale: GS_SEARCH_ENGINE_LOCALE[engine[1]], cookie: null };
  if (BOT_UA_RE.test(ua)) return null;
  const queryLocale = url.searchParams.get("locale");
  const hasQuery = GS_LOCALES.includes(queryLocale);
  const cookieMatch = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)gs_locale=([a-z-]+)(?:;|$)/);
  const cookieLocale = cookieMatch && GS_LOCALES.includes(cookieMatch[1]) ? cookieMatch[1] : null;
  return {
    locale: (hasQuery && queryLocale) || cookieLocale || GS_COUNTRY_LOCALE[country] || "en",
    cookie: hasQuery ? `gs_locale=${queryLocale}; Max-Age=31536000; Path=/; SameSite=Lax; Secure` : null
  };
}

// A game page asked for on the www host or by a retired slug: one redirect that settles host, edition and slug together,
// instead of a hop for each. 302 when the visitor's edition is part of it (per visitor, never cached), otherwise 301.
async function gameRedirect(context, url, path, www, country) {
  const prefix = gsLocalePrefixOf(path);
  const slug = gameSlugOf(prefix ? path.slice(prefix.length + 1) : path);
  if (!slug) return null;
  // With the map unreadable the slug may be a retired one, so no host or edition redirect may confirm it:
  // the same 503 the game route gives (functions/_lib/game-route.js).
  const redirects = context.env && context.env.ASSETS ? await loadGameRedirects(context.env, url) : {};
  if (!redirects) return new Response("Game data unavailable", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  const moved = Object.prototype.hasOwnProperty.call(redirects, slug) ? redirects[slug] : null;
  if (!www && !moved) return null;
  const page = `/games/${encodeURIComponent(moved || slug)}/${url.search}`;
  const choice = prefix ? null : gsEditionChoice(context.request, url, country);
  const local = Boolean(choice && choice.locale !== "en");
  const headers = new Headers({ Location: `https://gamerscroll.com${local ? "/" + choice.locale : prefix ? "/" + prefix : ""}${page}` });
  if (local) headers.set("Cache-Control", "private, no-store");
  if (choice && choice.cookie) headers.append("Set-Cookie", choice.cookie);
  return new Response(null, { status: local ? 302 : 301, headers });
}

async function handleGamerScrollLegacyRedirect(url, fullPath, loadPlans) {
  // Removed-section rules apply at the root and under any locale prefix.
  const prefix = gsLocalePrefixOf(fullPath);
  const path = prefix ? fullPath.slice(prefix.length + 1) || "/" : fullPath;

  if (path.startsWith("/magazine/ranking/")) {
    const target = rankingArticleTarget(path, prefix, await loadPlans());
    if (target) return Response.redirect(url.origin + target, 301);
  }
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
    const www = host.startsWith("www.");
    const gameHop = await gameRedirect(context, url, path, www, country);
    if (gameHop) return gameHop;
    // Removed-section rules run before the host hop and build their targets on the bare host, so a www URL of a
    // removed page reaches its successor (or its 410) in one step.
    // Path and search are assigned, never resolved as a reference: "//host/..." must stay a path of this site.
    let bare = url;
    if (www) {
      bare = new URL("https://gamerscroll.com/");
      bare.pathname = path;
      bare.search = url.search;
    }
    const legacyRedirect = await handleGamerScrollLegacyRedirect(bare, path, () => loadMarketPlans(context, url));
    if (legacyRedirect) return legacyRedirect;
    // www -> non-www 301: consolidate to the canonical bare host so Google does
    // not crawl both hosts and split indexing signals.
    if (www) {
      return Response.redirect(bare.href, 301);
    }
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
    const plans = await loadMarketPlans(context, url);
    // A market page this edition does not build (removed genre/publisher/month, or the edition's market lacks data): 301 to its nearest built parent.
    const ownPrefix = gsLocalePrefixOf(path);
    const removedTarget = marketTarget(plans, ownPrefix || "en", ownPrefix ? path.slice(ownPrefix.length + 1) || "/" : path);
    if (removedTarget) return Response.redirect(`${url.origin}${ownPrefix ? "/" + ownPrefix : ""}${removedTarget}${url.search}`, 301);
    if (ownPrefix) return next();
    // RSS 피드는 리포트 섹션과 함께 없어졌다 (2026-10): 404 대신 410
    if (path === "/rss.xml" || path === "/feed" || path === "/feed/") return goneResponse();
    if (gsIsStaticPath(path)) return next();
    const choice = gsEditionChoice(request, url, country);
    if (!choice || GS_LOCALE_EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) return next();

    if (choice.locale !== "en") {
      const headers = new Headers({
        Location: `/${choice.locale}${marketTarget(plans, choice.locale, path) || path}${url.search}`,
        "Cache-Control": "private, no-store"
      });
      if (choice.cookie) headers.append("Set-Cookie", choice.cookie);
      return new Response(null, { status: 302, headers });
    }
    const response = await next();
    if (!choice.cookie) return response;
    try {
      const cloned = new Response(response.body, response);
      cloned.headers.append("Set-Cookie", choice.cookie);
      return cloned;
    } catch {
      return response;
    }
  }

  // Any other host (e.g. *.pages.dev previews): no routing.
  return next();
}
