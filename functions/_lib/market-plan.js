'use strict';

// Which market pages (genres, publishers, monthly, records) each edition builds, and where a page that is not built
// should send visitors. One implementation for the build (CommonJS require) and the Pages middleware (bundled import).
// A plan is { genres, publisherHub, publishers, monthly, records } with Set or array members; plans = { <edition code>: plan }.

const has = (collection, value) => (collection instanceof Set ? collection.has(value) : Array.isArray(collection) && collection.includes(value));

const GENRE_RE = /^\/rankings\/genres\/([^/]+)\/$/;
const PUBLISHER_RE = /^\/rankings\/publishers\/([^/]+)\/$/;
const MONTH_RE = /^\/rankings\/monthly\/(\d{4}-\d{2})\/$/;

function decode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// Paths this module governs; every other path is always available.
function isMarketPath(p) {
  return p === '/rankings/genres/' || p === '/rankings/publishers/' || p === '/rankings/monthly/' || p === '/rankings/records/'
    || GENRE_RE.test(p) || PUBLISHER_RE.test(p) || MONTH_RE.test(p);
}

function available(plan, p) {
  let m;
  if (!plan) return true;
  if (p === '/rankings/genres/') return has(plan.genres, 'all');
  if ((m = GENRE_RE.exec(p))) return has(plan.genres, decode(m[1]));
  if (p === '/rankings/publishers/') return Boolean(plan.publisherHub);
  if ((m = PUBLISHER_RE.exec(p))) return has(plan.publishers, decode(m[1]));
  if (p === '/rankings/monthly/') return (plan.monthly instanceof Set ? plan.monthly.size : (plan.monthly || []).length) > 0;
  if ((m = MONTH_RE.exec(p))) return has(plan.monthly, m[1]);
  if (p === '/rankings/records/') return Boolean(plan.records);
  return true;
}

const parentOf = (p) => (GENRE_RE.test(p) ? '/rankings/genres/' : PUBLISHER_RE.test(p) ? '/rankings/publishers/' : MONTH_RE.test(p) ? '/rankings/monthly/' : '/rankings/');

// The page itself, else its nearest built parent in the edition.
function nearestBuilt(plan, p) {
  let target = p;
  while (!available(plan, target)) target = parentOf(target);
  return target;
}

// Built in at least one edition: a URL that used to exist and is now gone from this one (as opposed to a made-up URL).
function builtSomewhere(plans, p) {
  return Object.values(plans).some((plan) => available(plan, p));
}

// Arrays for JSON (docs/games-data/_pages.json, read by the middleware).
function serialize(plan) {
  return { genres: [...plan.genres], publisherHub: plan.publisherHub, publishers: [...plan.publishers], monthly: [...plan.monthly], records: plan.records };
}

module.exports = { isMarketPath, available, parentOf, nearestBuilt, builtSomewhere, serialize };
