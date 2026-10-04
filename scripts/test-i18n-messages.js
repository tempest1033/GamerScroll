'use strict';

// Message dictionaries: every edition carries the same keys as en (the fallback), placeholders match, nothing the
// templates reference is missing, and messages are safe to embed in HTML attributes and inline scripts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EDITIONS, setEdition, t, href, localizeHtml, editionPath } = require('../src/i18n');

const root = path.resolve(__dirname, '..');
const dictionaries = Object.fromEntries(EDITIONS.map((e) => [e.code, require(`../src/i18n/messages/${e.code}.js`)]));
const en = dictionaries.en;
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

for (const edition of EDITIONS) {
  const dictionary = dictionaries[edition.code];
  assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(en).sort(), `${edition.code}: same keys as en`);
  for (const [key, value] of Object.entries(dictionary)) {
    assert.equal(typeof value, 'string', `${edition.code}.${key} is a string`);
    assert.equal(placeholders(value), placeholders(en[key]), `${edition.code}.${key}: placeholders match en`);
    // Embedded in attributes and inline scripts: no raw backslash/backtick/template opener, and quotes only inside markup messages.
    assert.ok(!/\\|`|\$\{/.test(value), `${edition.code}.${key}: unsafe character`);
    if (!/^\s*</.test(value)) assert.ok(!/["']/.test(value), `${edition.code}.${key}: ASCII quote outside markup`);
  }
}
// Page-scoped dictionaries (messages/game/<code>.js) get the same checks against game/en.js.
const gameDictionaries = Object.fromEntries(EDITIONS.map((e) => [e.code, require(`../src/i18n/messages/game/${e.code}.js`)]));
const gameEn = gameDictionaries.en;
for (const edition of EDITIONS) {
  const dictionary = gameDictionaries[edition.code];
  assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(gameEn).sort(), `game/${edition.code}: same keys as game/en`);
  for (const [key, value] of Object.entries(dictionary)) {
    assert.equal(typeof value, 'string', `game/${edition.code}.${key} is a string`);
    assert.equal(placeholders(value), placeholders(gameEn[key]), `game/${edition.code}.${key}: placeholders match game/en`);
    assert.ok(!/\\|`|\$\{/.test(value), `game/${edition.code}.${key}: unsafe character`);
    if (!/^\s*</.test(value)) assert.ok(!/["']/.test(value), `game/${edition.code}.${key}: ASCII quote outside markup`);
    assert.ok(!(key in dictionaries[edition.code]), `game/${edition.code}.${key} does not shadow a base key`);
  }
}
const merged = { ...en, ...gameEn };
assert.ok(Object.values(gameEn).every((value) => !/[\uAC00-\uD7A3]/.test(value)), 'game/en has no Hangul');
assert.ok(Object.values(gameDictionaries.ko).some((value) => /[\uAC00-\uD7A3]/.test(value)), 'game/ko is Korean');
assert.ok(Object.values(en).every((value) => !/[\uAC00-\uD7A3]/.test(value)), 'en has no Hangul');
assert.ok(Object.values(dictionaries.ko).some((value) => /[\uAC00-\uD7A3]/.test(value)), 'ko is Korean');

// Every literal t('key') in the templates and rank layer resolves.
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!/ai-blog|aiscroll/.test(full)) walk(full); } else if (entry.name.endsWith('.js')) files.push(full);
  }
})(path.join(root, 'src'));
const missing = [];
for (const file of files) {
  if (/aiscroll|ai-blog|[\\/]i18n[\\/]/.test(file)) continue;
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?<![\w.])(?:t|tt)\('([a-z0-9_-]+\.[a-z0-9_.-]+)'/g)) if (!(match[1] in merged)) missing.push(`${path.relative(root, file)}: ${match[1]}`);
}
assert.deepEqual(missing, [], 'keys used in source exist in en');

// Fallback to en, then to the key itself.
setEdition('ja');
assert.equal(t('layout.close'), dictionaries.ja['layout.close']);
assert.equal(t('no.such.key'), 'no.such.key');
setEdition('ko');
assert.equal(t('layout.close'), dictionaries.ko['layout.close']);
assert.equal(t('home.updated', { p0: 'X' }), dictionaries.ko['home.updated'].replace('{p0}', 'X'));

// Link prefixing
setEdition('en');
assert.equal(href('/rankings/'), '/rankings/');
setEdition('zh-tw');
assert.equal(href('/rankings/'), '/zh-tw/rankings/');
assert.equal(href('/'), '/zh-tw/');
assert.equal(href('/assets/layout-core.js'), '/assets/layout-core.js');
assert.equal(href('https://example.com/games/'), 'https://example.com/games/');
assert.equal(editionPath('ja', '/ko/games/x/'), '/ja/games/x/');
assert.equal(localizeHtml('<a href="/games/x/">a</a> <a href="/">h</a> fetch(\'/games/search-index.json\') `/games/${slug}/` <a href="/assets/a.js">'), '<a href="/zh-tw/games/x/">a</a> <a href="/zh-tw/">h</a> fetch(\'/zh-tw/games/search-index.json\') `/zh-tw/games/${slug}/` <a href="/assets/a.js">');

console.log(`i18n messages ok: ${Object.keys(en).length} keys × ${EDITIONS.length} editions`);
