'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fitsEdition } = require('../src/rank/name-script');

test('zh-tw keeps names shared with CN and rejects Simplified-only characters', () => {
  for (const name of ['原神', '原神-六週年', '王者榮耀', '三角洲行動', 'MONOPOLY GO! (大富翁 GO!)']) assert.equal(fitsEdition(name, 'zh-tw'), true, name);
  for (const name of ['王者荣耀', '三角洲行动', '保卫萝卜3']) assert.equal(fitsEdition(name, 'zh-tw'), false, name);
});

test('Hangul, kana and CJK stay out of the other editions', () => {
  assert.equal(fitsEdition('리니지M', 'ja'), false);
  assert.equal(fitsEdition('リネージュM', 'zh-cn'), false);
  assert.equal(fitsEdition('三角洲行动', 'en'), false);
  assert.equal(fitsEdition('リネージュM', 'ja'), true);
  assert.equal(fitsEdition('원신', 'ko'), true);
});

test('Traditional characters valid in Taiwan are never treated as Simplified (OpenCC variants, Big5)', () => {
  for (const name of ['泛舟', '洪水氾濫', '秘密', '群英', '巔峰']) assert.equal(fitsEdition(name, 'zh-tw'), true, name);
});

test('Supplementary-plane characters (emoji, CJK Ext B) do not trigger the Simplified check', () => {
  for (const name of ['王者榮耀😀', '𠮷野家']) assert.equal(fitsEdition(name, 'zh-tw'), true, name);
  assert.equal(fitsEdition('王者荣耀😀', 'zh-tw'), false);
});
