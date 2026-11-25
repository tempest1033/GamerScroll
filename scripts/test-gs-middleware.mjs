import assert from "node:assert/strict";
import { onRequest } from "../functions/_middleware.js";
import { onRequest as onAiRequest } from "../functions-aiscroll/_middleware.js";

async function call(url, { country, ua, cookie } = {}) {
  const u = new URL(url);
  const headers = new Headers({ host: u.host });
  if (country) headers.set("CF-IPCountry", country);
  if (ua) headers.set("User-Agent", ua);
  if (cookie) headers.set("Cookie", cookie);
  return onRequest({ request: new Request(url, { headers }), next: async () => new Response("ok", { status: 200 }) });
}
const loc = (r) => new URL(r.headers.get("location"), "https://gamerscroll.com").pathname + new URL(r.headers.get("location"), "https://gamerscroll.com").search;

let n = 0;
async function t(name, fn) { await fn(); n++; console.log("ok -", name); }
const pass = (r) => assert.equal(r.status, 200);
const G = "https://gamerscroll.com";

await t("KR / -> /ko/", async () => { const r = await call(G + "/", { country: "KR" }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/"); assert.equal(r.headers.get("cache-control"), "private, no-store"); });
await t("KR /rankings/?x=1", async () => { const r = await call(G + "/rankings/?x=1", { country: "KR" }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/rankings/?x=1"); });
await t("US / pass", async () => pass(await call(G + "/", { country: "US" })));
await t("DE / pass", async () => pass(await call(G + "/", { country: "DE" })));
await t("no header pass", async () => pass(await call(G + "/")));
for (const [c, p] of [["JP", "/ja/"], ["CN", "/zh-cn/"], ["TW", "/zh-tw/"]]) {
  await t(`${c} -> ${p}`, async () => { const r = await call(G + "/", { country: c }); assert.equal(r.status, 302); assert.equal(loc(r), p); });
}
await t("KR cookie en pass", async () => pass(await call(G + "/", { country: "KR", cookie: "a=b; gs_locale=en" })));
await t("US cookie ja -> /ja/", async () => { const r = await call(G + "/rankings/", { country: "US", cookie: "gs_locale=ja" }); assert.equal(loc(r), "/ja/rankings/"); });
await t("US ?locale=ko redirect + cookie", async () => {
  const r = await call(G + "/rankings/?locale=ko", { country: "US" });
  assert.equal(r.status, 302); assert.equal(loc(r), "/ko/rankings/?locale=ko");
  assert.equal(r.headers.get("set-cookie"), "gs_locale=ko; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
});
await t("KR ?locale=en pass + cookie", async () => { const r = await call(G + "/?locale=en", { country: "KR" }); pass(r); assert.match(r.headers.get("set-cookie"), /^gs_locale=en;/); });
await t("KR /ko/rankings/ pass", async () => pass(await call(G + "/ko/rankings/", { country: "KR" })));
await t("KR /ko pass", async () => pass(await call(G + "/ko", { country: "KR" })));
await t("Googlebot KR pass", async () => pass(await call(G + "/", { country: "KR", ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" })));
await t("KR /games/foo/ -> /ko/games/foo/", async () => { const r = await call(G + "/games/foo/", { country: "KR" }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/games/foo/"); });
await t("KR /games/ hub -> /ko/games/", async () => { const r = await call(G + "/games/", { country: "KR" }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/games/"); });
await t("JP Hangul slug keeps encoding", async () => { const r = await call(G + "/games/%EB%A9%94%EC%9D%B4%ED%94%8C/?x=1", { country: "JP" }); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/ja/games/%EB%A9%94%EC%9D%B4%ED%94%8C/?x=1"); });
await t("US /games/foo/ pass", async () => pass(await call(G + "/games/foo/", { country: "US" })));
await t("KR /ko/games/foo/ pass", async () => pass(await call(G + "/ko/games/foo/", { country: "KR" })));
await t("Googlebot KR /games/foo/ pass", async () => pass(await call(G + "/games/foo/", { country: "KR", ua: "Googlebot/2.1" })));
await t("KR /games/search-index.json pass", async () => pass(await call(G + "/games/search-index.json", { country: "KR" })));
await t("KR data.json pass", async () => { pass(await call(G + "/rankings/data.json", { country: "KR" })); pass(await call(G + "/steam/data.json", { country: "KR" })); });
await t("KR assets/robots/sitemap pass", async () => { for (const p of ["/assets/a.js", "/robots.txt", "/sitemap-1.xml", "/favicon.ico"]) pass(await call(G + p, { country: "KR" })); });
await t("KR .html redirects", async () => assert.equal((await call(G + "/rankings/index.html", { country: "KR" })).status, 302));
await t("/magazine/issue/x/ 410", async () => assert.equal((await call(G + "/magazine/issue/x/", { country: "KR" })).status, 410));
await t("/magazine 410", async () => assert.equal((await call(G + "/magazine")).status, 410));
await t("ranking articles -> their successor in the edition of the URL (unprefixed = the Korean site)", async () => {
  for (const [from, to] of [
    ["/magazine/ranking/mobile-february-2026-kr/", "/ko/rankings/monthly/2026-02/"],
    ["/magazine/ranking/lunar-new-year-2026-kr/", "/ko/rankings/monthly/2026-02/"],
    ["/magazine/ranking/subculture-august-2026-kr/", "/ko/rankings/genres/subculture/"],
    ["/magazine/ranking/endfield-vs-dragonsword-new-year-2026/", "/ko/rankings/genres/subculture/"],
    ["/magazine/ranking/steam-april-2026", "/ko/steam/"],
    ["/ko/magazine/ranking/mobile-july-2026-kr/", "/ko/rankings/monthly/2026-07/"],
    ["/ja/magazine/ranking/steam-april-2026/", "/ja/steam/"],
    ["/ja/magazine/ranking/mobile-june-2026-kr/", "/ja/rankings/kr/"],
    ["/zh-tw/magazine/ranking/subculture-may-2026-kr/", "/zh-tw/rankings/kr/"],
  ]) {
    const r = await call(G + from, { country: "KR" }); assert.equal(r.status, 301, from); assert.equal(loc(r), to, from);
  }
});
await t("every article of the historical inventory redirects; URLs that never existed stay 410", async () => {
  const inventory = ["endfield-vs-dragonsword-new-year-2026", "lunar-new-year-2026-kr", "mobile-february-2026-kr", "mobile-january-2026-kr", "mobile-july-2026-kr", "mobile-june-2026-kr", "steam-april-2026", "steam-february-2026", "steam-january-2026", "subculture-april-2026-kr", "subculture-august-2026-kr", "subculture-february-2026-kr", "subculture-january-2026-kr", "subculture-july-2026-kr", "subculture-june-2026-kr", "subculture-may-2026-kr"];
  for (const slug of inventory) assert.equal((await call(`${G}/magazine/ranking/${slug}/`)).status, 301, slug);
  for (const p of ["/magazine/ranking/mobile-march-2026-kr/", "/magazine/ranking/steam-march-2026/", "/magazine/ranking/constructor/", "/magazine/ranking/"]) assert.equal((await call(G + p)).status, 410, p);
});

// Game URLs: host, edition and retired slug settle in one redirect (through the whole middleware, with the redirect map as an asset).
const OLD = "/games/monopoly-go-%EB%AA%A8%EB%85%B8%ED%8F%B4%EB%A6%AC-go/";
const ASSETS = { fetch: async (req) => (new URL(req.url).pathname === "/games-data/_redirects.json" ? new Response(JSON.stringify({ "monopoly-go-모노폴리-go": "monopoly-go" })) : new Response("nope", { status: 404 })) };
async function hop(url, { country, ua, cookie } = {}) {
  const u = new URL(url);
  const headers = new Headers({ host: u.host });
  if (country) headers.set("CF-IPCountry", country);
  if (ua) headers.set("User-Agent", ua);
  if (cookie) headers.set("Cookie", cookie);
  const r = await onRequest({ request: new Request(url, { headers }), env: { ASSETS }, next: async () => new Response("ok", { status: 200 }) });
  return [r.status, r.headers.get("location"), r.headers.get("cache-control")];
}
const W = "https://www.gamerscroll.com";
await t("retired slug, Googlebot: one 301", async () => assert.deepEqual(await hop(G + OLD, { country: "KR", ua: "Googlebot/2.1" }), [301, "https://gamerscroll.com/games/monopoly-go/", null]));
await t("retired slug, US visitor: one 301", async () => assert.deepEqual(await hop(G + OLD + "?x=1", { country: "US" }), [301, "https://gamerscroll.com/games/monopoly-go/?x=1", null]));
await t("retired slug, KR visitor: one 302 to the Korean page under its current slug", async () => assert.deepEqual(await hop(G + OLD, { country: "KR" }), [302, "https://gamerscroll.com/ko/games/monopoly-go/", "private, no-store"]));
await t("retired slug, Yeti: one 302 to the Korean page", async () => assert.deepEqual(await hop(G + OLD, { ua: "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)" }), [302, "https://gamerscroll.com/ko/games/monopoly-go/", "private, no-store"]));
await t("retired slug under an edition prefix: one 301 within that edition", async () => assert.deepEqual(await hop(G + "/ja" + OLD, { country: "KR" }), [301, "https://gamerscroll.com/ja/games/monopoly-go/", null]));
await t("www + retired slug, Googlebot: one 301 to the bare host and current slug", async () => assert.deepEqual(await hop(W + OLD, { ua: "Googlebot/2.1" }), [301, "https://gamerscroll.com/games/monopoly-go/", null]));
await t("www + edition prefix + retired slug: one 301", async () => assert.deepEqual(await hop(W + "/ko" + OLD), [301, "https://gamerscroll.com/ko/games/monopoly-go/", null]));
await t("www + retired slug, JP visitor: one 302 to the Japanese page", async () => assert.deepEqual(await hop(W + OLD, { country: "JP" }), [302, "https://gamerscroll.com/ja/games/monopoly-go/", "private, no-store"]));
await t("www + current slug, KR visitor: one 302", async () => assert.deepEqual(await hop(W + "/games/monopoly-go/", { country: "KR" }), [302, "https://gamerscroll.com/ko/games/monopoly-go/", "private, no-store"]));
await t("current slug on the bare host is untouched", async () => { assert.deepEqual(await hop(G + "/games/monopoly-go/", { country: "US" }), [200, null, null]); assert.deepEqual(await hop(G + "/ko/games/monopoly-go/", { country: "KR" }), [200, null, null]); });
await t("www + ranking article: one 301 to the successor on the bare host", async () => {
  assert.deepEqual(await hop(W + "/ja/magazine/ranking/steam-april-2026/", { ua: "Googlebot/2.1" }), [301, "https://gamerscroll.com/ja/steam/", null]);
  assert.deepEqual(await hop(W + "/magazine/ranking/steam-april-2026", { country: "KR" }), [301, "https://gamerscroll.com/ko/steam/", null]);
  assert.deepEqual(await hop(W + "/zh-tw/magazine/ranking/subculture-may-2026-kr/"), [301, "https://gamerscroll.com/zh-tw/rankings/kr/", null]);
});
await t("www + removed section: 410 without a host hop; www + trends: one 301", async () => {
  assert.equal((await hop(W + "/magazine/ranking/steam-march-2026/"))[0], 410);
  assert.deepEqual(await hop(W + "/ja/trends/"), [301, "https://gamerscroll.com/ja/trending/", null]);
});
await t("www + ordinary page: one 301 to the bare host, query kept", async () => assert.deepEqual(await hop(W + "/ja/steam/?a=1"), [301, "https://gamerscroll.com/ja/steam/?a=1", null]));
await t("a redirect map that cannot be read is null (unknown), not an empty map", async () => {
  const down = { fetch: async () => new Response("down", { status: 500 }) };
  const fresh = await import(new URL("../functions/_lib/game-redirects.js?down", import.meta.url).href);
  assert.equal(await fresh.loadGameRedirects({ ASSETS: down }, new URL(G)), null);
});
await t("www + a path that reads as a network-path reference stays on gamerscroll.com", async () => {
  for (const p of ["//evil.example/", "//evil.example/games/monopoly-go/", "//evil.example/magazine/ranking/steam-april-2026/", "/%2F%2Fevil.example/", "//evil.example/?x=//evil.example"]) {
    const r = await onRequest({ request: new Request(W + p, { headers: { host: "www.gamerscroll.com", "User-Agent": "Googlebot/2.1" } }), env: { ASSETS }, next: async () => new Response("ok", { status: 200 }) });
    if (r.status === 410) continue;
    assert.equal(r.status, 301, p);
    assert.equal(new URL(r.headers.get("location")).host, "gamerscroll.com", p);
    assert.ok(r.headers.get("location").startsWith("https://gamerscroll.com/"), p);
  }
  assert.deepEqual(await hop(W + "//evil.example/a?b=1"), [301, "https://gamerscroll.com//evil.example/a?b=1", null]);
});
// A fresh isolate (own module state) whose redirect map cannot be read: the slug is unknown, so the middleware answers
// 503 before any host or edition redirect could confirm a retired URL.
await t("redirect map unreadable: game URLs get 503 no-store, not a host or edition redirect; other pages are untouched", async () => {
  const { build } = await import("esbuild");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pathToFileURL, fileURLToPath } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "gs-mw-"));
  try {
    const outfile = join(dir, "middleware.mjs");
    await build({ entryPoints: [fileURLToPath(new URL("../functions/_middleware.js", import.meta.url))], bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "silent" });
    const isolate = await import(pathToFileURL(outfile).href);
    let up = false;
    const flaky = { fetch: async (req) => (!up && new URL(req.url).pathname === "/games-data/_redirects.json" ? new Response("down", { status: 500 }) : ASSETS.fetch(req)) };
    const ask = async (url, { country, ua } = {}) => {
      const u = new URL(url);
      const headers = new Headers({ host: u.host });
      if (country) headers.set("CF-IPCountry", country);
      if (ua) headers.set("User-Agent", ua);
      const r = await isolate.onRequest({ request: new Request(url, { headers }), env: { ASSETS: flaky }, next: async () => new Response("ok", { status: 200 }) });
      return [r.status, r.headers.get("location"), r.headers.get("cache-control"), r.headers.get("retry-after")];
    };
    const unavailable = [503, null, "no-store", "60"];
    assert.deepEqual(await ask(W + OLD, { ua: "Googlebot/2.1" }), unavailable, "www + retired slug");
    assert.deepEqual(await ask(W + "/ko" + OLD), unavailable, "www + edition + retired slug");
    assert.deepEqual(await ask(G + OLD, { country: "KR" }), unavailable, "regional visitor on a root retired slug");
    assert.deepEqual(await ask(G + "/games/monopoly-go/", { country: "JP" }), unavailable, "regional visitor on a current slug");
    assert.deepEqual(await ask(G + "/ja" + OLD, { ua: "Googlebot/2.1" }), unavailable, "edition URL");
    assert.deepEqual(await ask(W + "/games/"), [301, "https://gamerscroll.com/games/", null, null], "the hub is not a game page");
    assert.deepEqual((await ask(G + "/rankings/", { country: "US" })).slice(0, 2), [200, null]);
    up = true;
    assert.deepEqual(await ask(W + OLD, { ua: "Googlebot/2.1" }), [301, "https://gamerscroll.com/games/monopoly-go/", null, null], "read again on the next request");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
await t("games hub and files under /games/ are not game pages", async () => { assert.deepEqual(await hop(W + "/games/"), [301, "https://gamerscroll.com/games/", null]); assert.deepEqual(await hop(G + "/games/search-index.json", { country: "KR" }), [200, null, null]); });
await t("/ko/reports/ 410", async () => assert.equal((await call(G + "/ko/reports/", { country: "KR" })).status, 410));
await t("/reports/x 410", async () => assert.equal((await call(G + "/reports/x")).status, 410));
await t("/tech/normal/x 410", async () => assert.equal((await call(G + "/tech/normal/macbook-neo-reviews/")).status, 410));
await t("/wiki 410 (no successor page)", async () => { for (const p of ["/wiki", "/wiki/a", "/wiki/business/x/", "/ko/wiki/history/y/"]) assert.equal((await call(G + p, { country: "KR" })).status, 410, p); });
await t("/upcoming -> /games/", async () => { const r = await call(G + "/upcoming"); assert.equal(r.status, 301); assert.equal(loc(r), "/games/"); });
await t("/tech/foo -> aiscroll", async () => { const r = await call(G + "/tech/foo/"); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "https://aiscroll.io/ko/"); });
const YETI = "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)";
await t("Yeti /steam/ -> /ko/steam/", async () => { const r = await call(G + "/steam/", { ua: YETI }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/steam/"); assert.equal(r.headers.get("cache-control"), "private, no-store"); assert.equal(r.headers.get("set-cookie"), null); });
await t("Yeti /steam/?x=1 keeps query", async () => { const r = await call(G + "/steam/?x=1", { ua: YETI }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/steam/?x=1"); });
await t("Yeti Hangul slug keeps encoding", async () => { const r = await call(G + "/games/%EB%A9%94%EC%9D%B4%ED%94%8C/", { ua: YETI }); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/ko/games/%EB%A9%94%EC%9D%B4%ED%94%8C/"); });
await t("Daumoa -> /ko/", async () => { const r = await call(G + "/", { ua: "Mozilla/5.0 (compatible; Daumoa/4.0)" }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/"); });
await t("Baiduspider -> /zh-cn/", async () => { const r = await call(G + "/steam/", { ua: "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)" }); assert.equal(r.status, 302); assert.equal(loc(r), "/zh-cn/steam/"); });
await t("Yeti /ko/steam/ pass", async () => pass(await call(G + "/ko/steam/", { ua: YETI })));
await t("Yeti robots/sitemap pass", async () => { for (const p of ["/robots.txt", "/sitemap.xml"]) pass(await call(G + p, { ua: YETI })); });
await t("Yeti /magazine/x/ 410", async () => assert.equal((await call(G + "/magazine/x/", { ua: YETI })).status, 410));
await t("Googlebot KR /steam/ pass", async () => pass(await call(G + "/steam/", { country: "KR", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })));
await t("Bingbot KR /steam/ pass", async () => pass(await call(G + "/steam/", { country: "KR", ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" })));
await t("www -> bare 301", async () => { const r = await call("https://www.gamerscroll.com/rankings/?a=1"); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "https://gamerscroll.com/rankings/?a=1"); });
await t("gs middleware leaves aiscroll host alone", async () => { const r = await call("https://aiscroll.io/", { country: "KR" }); assert.equal(r.status, 200); });

// AIScroll 전용 미들웨어
async function callAi(url, { country, ua, cookie } = {}) {
  const u = new URL(url);
  const headers = new Headers({ host: u.host });
  if (country) headers.set("CF-IPCountry", country);
  if (ua) headers.set("User-Agent", ua);
  if (cookie) headers.set("Cookie", cookie);
  return onAiRequest({ request: new Request(url, { headers }), next: async () => new Response("ok", { status: 200 }) });
}
const A = "https://aiscroll.io";
await t("aiscroll KR -> /ko/", async () => { const r = await callAi(A + "/", { country: "KR" }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/"); });
await t("aiscroll KR article keeps path and query", async () => { const r = await callAi(A + "/article/reviews/x/?a=1", { country: "KR" }); assert.equal(r.status, 302); assert.equal(loc(r), "/ko/article/reviews/x/?a=1"); });
await t("aiscroll KR already on /ko/ passes", async () => { const r = await callAi(A + "/ko/about/", { country: "KR" }); assert.equal(r.status, 200); });
await t("aiscroll US stays on root", async () => { const r = await callAi(A + "/", { country: "US" }); assert.equal(r.status, 200); assert.equal(r.headers.get("X-AIScroll-Country"), "US"); });
await t("aiscroll bot from KR is not redirected", async () => { const r = await callAi(A + "/", { country: "KR", ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }); assert.equal(r.status, 200); });
await t("aiscroll static file from KR is not redirected", async () => { for (const p of ["/sitemap.xml", "/rss.xml", "/assets/a.js", "/articles.json", "/robots.txt"]) { const r = await callAi(A + p, { country: "KR" }); assert.equal(r.status, 200, p); } });
await t("aiscroll ?lang=en sets cookie and stays", async () => { const r = await callAi(A + "/?lang=en", { country: "KR" }); assert.equal(r.status, 200); assert.match(r.headers.get("Set-Cookie") || "", /aiscroll_lang=en/); });
await t("aiscroll lang cookie from KR stays", async () => { const r = await callAi(A + "/", { country: "KR", cookie: "aiscroll_lang=en" }); assert.equal(r.status, 200); });
await t("aiscroll middleware ignores other hosts", async () => { const r = await callAi("https://preview.pages.dev/", { country: "KR" }); assert.equal(r.status, 200); assert.equal(r.headers.get("X-AIScroll-Middleware"), null); });

console.log(`${n} passed`);
