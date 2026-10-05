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
await t("/ko/reports/ 410", async () => assert.equal((await call(G + "/ko/reports/", { country: "KR" })).status, 410));
await t("/reports/x 410", async () => assert.equal((await call(G + "/reports/x")).status, 410));
await t("/tech/normal/x 410", async () => assert.equal((await call(G + "/tech/normal/macbook-neo-reviews/")).status, 410));
await t("/wiki/a -> /rankings/", async () => { const r = await call(G + "/wiki/a"); assert.equal(r.status, 301); assert.equal(loc(r), "/rankings/"); });
await t("/upcoming -> /games/", async () => { const r = await call(G + "/upcoming"); assert.equal(r.status, 301); assert.equal(loc(r), "/games/"); });
await t("/tech/foo -> aiscroll", async () => { const r = await call(G + "/tech/foo/"); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "https://aiscroll.io/ko/"); });
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
