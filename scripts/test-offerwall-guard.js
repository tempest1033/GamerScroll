const assert = require('node:assert/strict');
const vm = require('node:vm');
const { generateHead } = require('../src/templates/components/head');

// The Offerwall may show on metrics pages (/analysis/ of any edition) and nowhere else.
const head = generateHead({});
const guard = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(code => code.includes('controlledMessagingFunction'));
assert.ok(guard, 'head carries the Offerwall guard');
assert.ok(head.indexOf(guard) < head.indexOf("s.src = 'https://pagead2.googlesyndication.com"), 'guard runs before the AdSense script loads');

function suppressed(pathname) {
  const window = {};
  vm.runInNewContext(guard, { window, location: { pathname } });
  const fn = window.googlefc && window.googlefc.controlledMessagingFunction;
  if (!fn) return null;
  window.googlefc.MessageTypeEnum = { OFFERWALL: 'offerwall' };
  let call = null;
  fn({ proceed: (...args) => { call = args; } });
  return JSON.parse(JSON.stringify(call));   // arrays built inside the vm context have another realm's prototype
}

for (const path of ['/', '/ko/', '/rankings/', '/ja/games/some-game/', '/games/analysis/', '/zh-tw/rankings/monthly/']) {
  assert.deepEqual(suppressed(path), [false, ['offerwall']], `${path} suppresses only the Offerwall`);
}
for (const path of ['/analysis/', '/ko/analysis/', '/zh-cn/analysis/some-game/', '/analysis/some-game/']) {
  assert.equal(suppressed(path), null, `${path} leaves messaging to Google`);
}
console.log('PASS offerwall guard');
