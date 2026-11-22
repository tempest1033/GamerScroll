'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fitsEdition, fitsScript, ownLanguage } = require('../src/rank/name-script');

test('zh-cn keeps names shared with TW and rejects Traditional-only and mixed-form names', () => {
  for (const name of ['原神', '明日方舟', '王者荣耀', '心动小镇', '三角洲行动', 'MONOPOLY GO! (大富翁 GO!)']) assert.equal(fitsEdition(name, 'zh-cn'), true, name);
  for (const name of ['王者榮耀', '心動小鎮', '三角洲行動', '楓之谷M', '夜行猫 - 放置生存搜打撤遊戲', '拍賣大師 -拍賣經營游戏']) assert.equal(fitsEdition(name, 'zh-cn'), false, name);
  assert.equal(fitsEdition('夜行猫 - 放置生存搜打撤遊戲', 'zh-tw'), false, 'a mixed name fits neither Chinese edition');
});

test('Traditional forms that are valid Simplified (GB 2312) are never treated as Traditional', () => {
  for (const name of ['乾坤', '著名', '皇后', '台球']) assert.equal(fitsEdition(name, 'zh-cn'), true, name);
});

test('an own-language alias is Han that fits the Chinese edition; a name in the other form is still readable script', () => {
  assert.equal(ownLanguage('心动小镇', 'zh-cn'), true);
  assert.equal(ownLanguage('明日方舟', 'zh-cn'), true);
  assert.equal(ownLanguage('心動小鎮', 'zh-cn'), false);
  assert.equal(ownLanguage('心動小鎮', 'zh-tw'), true);
  assert.equal(ownLanguage('Heartopia', 'zh-cn'), false);
  assert.equal(ownLanguage('アークナイツ', 'zh-cn'), false);
  assert.equal(fitsScript('心動小鎮', 'zh-cn'), true);
  assert.equal(fitsScript('두근두근타운', 'zh-cn'), false);
});

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
