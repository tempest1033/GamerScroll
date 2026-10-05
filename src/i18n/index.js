'use strict';

/**
 * GamerScroll i18n — five country editions.
 *
 *   t(key, params)        message lookup (current edition, falls back to en, then to the key)
 *   setEdition(code)      switch the current edition (used by the build loop)
 *   href(path)            prefix an internal link for the current edition
 *   localizeHtml(html)    prefix every internal link/path literal of a rendered page or runtime bundle
 *   formatNumber/formatDate/formatCompact   Intl based, follows the current edition
 *
 * Until setEdition() is called the module runs in "legacy" mode: Korean strings and un-prefixed
 * links, which is what the single-edition scripts (e.g. generate-game-pages) expect.
 */

const SITE_ORIGIN = 'https://gamerscroll.com';

// Order is the selector order and is part of the edition contract.
const EDITIONS = [
  { code: 'en', prefix: '', htmlLang: 'en', hreflang: 'en', country: 'us', label: 'United States', ogLocale: 'en_US', intl: 'en-US', flag: 'us' },
  { code: 'ja', prefix: '/ja', htmlLang: 'ja', hreflang: 'ja', country: 'jp', label: '日本', ogLocale: 'ja_JP', intl: 'ja-JP', flag: 'jp' },
  { code: 'zh-cn', prefix: '/zh-cn', htmlLang: 'zh-Hans', hreflang: 'zh-CN', country: 'cn', label: '中国', ogLocale: 'zh_CN', intl: 'zh-CN', flag: 'cn' },
  { code: 'ko', prefix: '/ko', htmlLang: 'ko', hreflang: 'ko', country: 'kr', label: '대한민국', ogLocale: 'ko_KR', intl: 'ko-KR', flag: 'kr' },
  { code: 'zh-tw', prefix: '/zh-tw', htmlLang: 'zh-Hant', hreflang: 'zh-TW', country: 'tw', label: '台灣', ogLocale: 'zh_TW', intl: 'zh-TW', flag: 'tw' },
];
const EDITION_BY_CODE = new Map(EDITIONS.map((e) => [e.code, e]));
const DEFAULT_EDITION = 'en';
const LEGACY_EDITION = 'ko';
const LOCALE_COOKIE = 'gs_locale';

const dictionaries = new Map();
function dictionary(code) {
  // Page-scoped message files (messages/game/<code>.js) are merged into the edition dictionary.
  if (!dictionaries.has(code)) dictionaries.set(code, { ...require(`./messages/${code}.js`), ...require(`./messages/game/${code}.js`) });
  return dictionaries.get(code);
}

let current = EDITION_BY_CODE.get(LEGACY_EDITION);
let legacy = true;

function setEdition(code) {
  const edition = EDITION_BY_CODE.get(code);
  if (!edition) throw new Error(`Unknown edition: ${code}`);
  current = edition;
  legacy = false;
  return edition;
}
const currentEdition = () => current;
const isEditionMode = () => !legacy;
const getEdition = (code) => EDITION_BY_CODE.get(code) || null;

function interpolate(message, params) {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined || params[name] === null ? match : String(params[name])));
}

function lookup(code, key) {
  const own = dictionary(code)[key];
  if (own !== undefined) return own;
  const fallback = dictionary(DEFAULT_EDITION)[key];
  return fallback;
}
const has = (key) => lookup(current.code, key) !== undefined;
function t(key, params) {
  const message = lookup(current.code, key);
  return interpolate(message === undefined ? key : message, params);
}

// ---------- links ----------
// First path segments that belong to the localized site. Assets, CSS and the manifest are shared.
const LOCALIZED_SEGMENTS = ['rankings', 'trending', 'steam', 'games', 'about', 'privacy'];
const SEGMENT_PATTERN = LOCALIZED_SEGMENTS.join('|');
const EDITION_PREFIX_RE = /^\/(ja|zh-cn|ko|zh-tw)(?=\/|$)/;

function stripEditionPrefix(pathname) {
  const stripped = String(pathname || '/').replace(EDITION_PREFIX_RE, '');
  return stripped || '/';
}
const isLocalizedPath = (p) => p === '/' || new RegExp(`^/(?:${SEGMENT_PATTERN})(?:[/?#]|$)`).test(p);
function prefixPath(path, edition = current) {
  const p = String(path || '');
  if (!edition.prefix || !p.startsWith('/') || p.startsWith('//') || !isLocalizedPath(p)) return p;
  return p === '/' ? `${edition.prefix}/` : edition.prefix + p;
}
function href(path) {
  return legacy ? String(path || '') : prefixPath(path);
}
function editionPath(code, pathname) {
  const edition = EDITION_BY_CODE.get(code);
  return prefixPath(stripEditionPrefix(pathname), edition);
}
// hreflang target of a page for another edition.
// Country-scoped pages (/rankings/[cc/], /rankings/free/[cc/], /trending/[cc/]) are clustered by the chart's country:
// an edition serves its home country at the bare path and every other country under /<cc>/, so the same chart lives at
// different paths per edition (ko: /ko/rankings/ = Korea; ja: /ja/rankings/kr/ = Korea). Other pages share one path.
const COUNTRY_SCOPED_RE = /^\/(rankings(?:\/free)?|trending)\/(?:(us|jp|cn|kr|tw)\/)?$/;
function alternatePath(targetCode, pathname, sourceCode) {
  const m = COUNTRY_SCOPED_RE.exec(pathname);
  if (!m) return pathname;
  const source = EDITION_BY_CODE.get(sourceCode) || current;
  const target = EDITION_BY_CODE.get(targetCode);
  const country = m[2] || source.country;
  return target && target.country === country ? `/${m[1]}/` : `/${m[1]}/${country}/`;
}

function absoluteUrl(code, pathname) {
  return SITE_ORIGIN + editionPath(code, pathname);
}

// A quote character directly followed by a localized absolute path, e.g. href="/rankings/", '/games/' or `/games/${slug}/`.
// Also the bare home path in href/action attributes.
const LINK_LITERAL_RE = new RegExp(`(["'\`])(/(?:${SEGMENT_PATTERN})(?:[/?#][^"'\`\\s<>]*)?)(?=["'\`\\s]|$)`, 'g');
const HOME_ATTR_RE = /(\b(?:href|action)=)(["'])\/\2/g;
// A link written as RAW_LINK_MARK + path is already final (e.g. the edition selector's own targets): the mark only
// shields it from prefixing and is removed here.
const RAW_LINK_MARK = '\u0001';
function localizeHtml(html) {
  if (legacy || !current.prefix) return String(html).replace(/\u0001/g, '');
  return String(html)
    .replace(LINK_LITERAL_RE, (match, quote, p) => quote + prefixPath(p))
    .replace(HOME_ATTR_RE, (match, attr, quote) => `${attr}${quote}${current.prefix}/${quote}`)
    .replace(/\u0001/g, '');
}

// ---------- client-side messages ----------
// Source of a `const <name> = (key, params) => text` helper for inline browser code, carrying only the keys that
// the given functions/sources reference as <name>('key'...). Keeps serialized render functions working in the browser.
function clientTranslator(sources, name = 't') {
  const keys = new Set();
  const re = new RegExp(`\\b${name}\\('([\\w.]+)'`, 'g');
  for (const source of [].concat(sources)) for (const match of String(source).matchAll(re)) keys.add(match[1]);
  const dict = {};
  for (const key of keys) { const message = lookup(current.code, key); dict[key] = message === undefined ? key : message; }
  const json = JSON.stringify(dict).replace(/</g, '\\u003c');
  return `const ${name} = (function (m) { return function (k, p) { var s = m[k]; if (s === undefined) s = k; return p ? s.replace(/\\{(\\w+)\\}/g, function (x, n) { return p[n] == null ? x : String(p[n]); }) : s; }; })(${json});`;
}

// Edition search index: /games/search-index.json under each non-English prefix. The English edition cannot use the
// root file (scripts/generate-game-pages.js owns it and writes the DB names there), so it gets its own name.
function searchIndexPath(code = current.code) {
  return !legacy && code === 'en' ? '/games/search-index.en.json' : '/games/search-index.json';
}

// ---------- formatting ----------
// Intl formatters are expensive to construct (a game detail page formats a few hundred dates: building a new
// Intl.DateTimeFormat for each took three quarters of the render time, enough to trip the Cloudflare Pages CPU limit
// under concurrent requests). Build each locale + options combination once and reuse it.
const formatterCache = new Map();
function intlFormatter(Ctor, kind, locale, options) {
  const key = kind + '|' + locale + '|' + (options ? JSON.stringify(options) : '');
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Ctor(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}
const numberFormatter = (options) => intlFormatter(Intl.NumberFormat, 'n', current.intl, options);
const dateFormatter = (options) => intlFormatter(Intl.DateTimeFormat, 'd', current.intl, options);

function formatNumber(value, options) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return numberFormatter(options).format(Number(value));
}
function formatCompact(value, options) {
  return formatNumber(value, { notation: 'compact', maximumFractionDigits: 1, ...options });
}
function formatDate(value, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter({ timeZone: 'UTC', ...options }).format(date);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
// Display forms of machine-readable ISO values; non-dates pass through unchanged.
function formatDay(value) {
  return ISO_DAY.test(String(value ?? '')) ? formatDate(String(value).slice(0, 10)) : (value ?? '');
}
// `numeric` gives the compact locale form (1/1, 1. 1.) for narrow table cells.
function formatMonthDay(value, numeric = false) {
  return ISO_DAY.test(String(value ?? '')) ? formatDate(String(value).slice(0, 10), { month: numeric ? 'numeric' : 'short', day: 'numeric' }) : (value ?? '');
}
function formatYearMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value ?? '')) ? formatDate(`${value}-01`, { year: 'numeric', month: 'long' }) : (value ?? '');
}
// Collection timestamps are shown in KST (CI runs in UTC), formatted for the edition.
function formatStamp(ts, options) {
  const date = new Date(ts);
  if (!ts || Number.isNaN(date.getTime())) return '';
  return dateFormatter({ timeZone: 'Asia/Seoul', ...options }).format(date);
}
const formatDateTime = (ts) => formatStamp(ts, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const formatTime = (ts) => formatStamp(ts, { hour: 'numeric', minute: '2-digit' });

module.exports = {
  alternatePath,
  formatDay,
  formatMonthDay,
  formatYearMonth,
  formatDateTime,
  formatTime,
  SITE_ORIGIN,
  EDITIONS,
  DEFAULT_EDITION,
  LOCALE_COOKIE,
  t,
  has,
  setEdition,
  currentEdition,
  isEditionMode,
  getEdition,
  href,
  prefixPath,
  stripEditionPrefix,
  editionPath,
  absoluteUrl,
  localizeHtml,
  searchIndexPath,
  RAW_LINK_MARK,
  clientTranslator,
  formatNumber,
  formatCompact,
  formatDate,
};
