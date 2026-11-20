const assert = require('node:assert/strict');
const vm = require('node:vm');
const i18n = require('../src/i18n');
const { generateHead } = require('../src/templates/components/head');

// The Offerwall may show on metrics pages (/analysis/ of any edition) and nowhere else.
// Each edition's head is checked as built: localizeHtml rewrites quoted site paths in inline scripts too.

// Runs the guard for a pathname. enumAfter = number of timer ticks before Google defines MessageTypeEnum
// (0 = already defined at the call, Infinity = never).
function suppressed(guard, pathname, enumAfter = 0) {
  const window = {};
  const timers = [];
  vm.runInNewContext(guard, { window, location: { pathname }, setTimeout: (fn) => { timers.push(fn); } });
  const fn = window.googlefc && window.googlefc.controlledMessagingFunction;
  if (!fn) return null;
  const define = () => { window.googlefc.MessageTypeEnum = { OFFERWALL: 'offerwall' }; };
  if (enumAfter === 0) define();
  let call = null;
  fn({ proceed: (...args) => { assert.equal(call, null, 'proceed is called once'); call = args; } });
  for (let tick = 1; timers.length && tick <= 1000; tick++) {
    if (tick === enumAfter) define();
    timers.shift()();
  }
  return JSON.parse(JSON.stringify(call));   // arrays built inside the vm context have another realm's prototype
}

for (const edition of i18n.EDITIONS) {
  i18n.setEdition(edition.code);
  const head = i18n.localizeHtml(generateHead({}));
  const guard = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(code => code.includes('controlledMessagingFunction'));
  assert.ok(guard, `${edition.code}: head carries the Offerwall guard`);
  assert.ok(head.indexOf(guard) < head.indexOf("s.src = 'https://pagead2.googlesyndication.com"), `${edition.code}: guard runs before the AdSense script loads`);

  for (const path of ['/', '/ko/', '/rankings/', '/ja/games/some-game/', '/games/analysis/', '/zh-tw/rankings/monthly/', '/ko/ko/analysis/', '/ja/ko/analysis/some-game/', '/analysis']) {
    assert.deepEqual(suppressed(guard, path), [false, ['offerwall']], `${edition.code}: ${path} suppresses only the Offerwall`);
  }
  for (const path of ['/analysis/', '/ko/analysis/', '/ja/analysis/', '/zh-cn/analysis/some-game/', '/zh-tw/analysis/', '/analysis/some-game/']) {
    assert.equal(suppressed(guard, path), null, `${edition.code}: ${path} leaves messaging to Google`);
  }
  assert.deepEqual(suppressed(guard, '/ko/', 3), [false, ['offerwall']], `${edition.code}: waits for MessageTypeEnum defined after the call`);
  assert.deepEqual(suppressed(guard, '/ko/', Infinity), [true], `${edition.code}: proceeds as usual when MessageTypeEnum never arrives`);
}
console.log('PASS offerwall guard');
