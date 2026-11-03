'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { routesJson, redirectsText } = require('../src/build/routing');

// Cloudflare Pages _routes.json matching: `*` spans `/`; a trailing `/*` also matches the prefix itself.
const matches = (rule, p) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(p)
  || (rule.endsWith('/*') && p === rule.slice(0, -2));
const reachesFunctions = (routes, p) => routes.include.some((r) => matches(r, p)) && !routes.exclude.some((r) => matches(r, p));

const plan = (genres, publishers, monthly = ['2026-10']) => ({ genres: ['all', ...genres], publisherHub: true, publishers, monthly, records: true });
const plans = {
  en: plan(['rpg', 'idle'], ['bilibili']),
  ja: plan(['rpg', 'idle'], ['bilibili', 'ｶﾅ-pub']),
  'zh-cn': plan(['rpg'], []),
  ko: plan(['rpg', 'idle'], ['bilibili']),
  'zh-tw': plan(['rpg'], ['bilibili'], []),
};
const prefixes = { en: '', ja: '/ja', 'zh-cn': '/zh-cn', ko: '/ko', 'zh-tw': '/zh-tw' };

test('removed localized market pages are redirected by static rules because the middleware never sees them', () => {
  const routes = routesJson();
  const rules = new Map(redirectsText(plans, prefixes).trim().split('\n').map((l) => { const [from, to, status] = l.split(' '); return [from, { to, status }]; }));
  // the localized rankings tree is bypassed by Functions → the middleware cannot redirect there
  assert.equal(reachesFunctions(routes, '/zh-cn/rankings/genres/idle/'), false);
  assert.equal(reachesFunctions(routes, '/games/x/'), true);
  assert.equal(reachesFunctions(routes, '/zh-cn/games/x/'), true);
  // zh-cn: idle genre and bilibili publisher gone → nearest built parent
  assert.deepEqual(rules.get('/zh-cn/rankings/genres/idle/'), { to: '/zh-cn/rankings/genres/', status: '301' });
  assert.deepEqual(rules.get('/zh-cn/rankings/publishers/bilibili/'), { to: '/zh-cn/rankings/publishers/', status: '301' });
  // zh-tw builds no monthly page at all → the month falls back to /rankings/
  assert.deepEqual(rules.get('/zh-tw/rankings/monthly/2026-10/'), { to: '/zh-tw/rankings/', status: '301' });
  assert.deepEqual(rules.get('/zh-tw/rankings/monthly/'), { to: '/zh-tw/rankings/', status: '301' });
  // unicode slug also gets its percent-encoded form
  assert.deepEqual(rules.get('/zh-cn/rankings/publishers/%EF%BD%B6%EF%BE%85-pub/'), { to: '/zh-cn/rankings/publishers/', status: '301' });
  // built pages and the unprefixed edition (middleware) get no static rule
  assert.equal(rules.has('/ja/rankings/genres/idle/'), false);
  assert.equal([...rules.keys()].some((from) => !/^\/(ja|zh-cn|ko|zh-tw)\//.test(from)), false);
  // every rule sits in a path Functions skips (otherwise the middleware would already handle it) and never loops
  for (const [from, { to }] of rules) {
    assert.equal(reachesFunctions(routes, from), false, from);
    assert.notEqual(from, to);
    assert.ok(!rules.has(to), `redirect target ${to} is itself redirected`);
  }
});
