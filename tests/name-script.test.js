'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fitsEdition, ownLanguage, toSimplified } = require('../src/rank/name-script');

test('Traditional → Simplified converts characters and phrases, mixed-form names included', () => {
  for (const [from, to] of [
    ['王者榮耀', '王者荣耀'], ['心動小鎮', '心动小镇'], ['楓之谷M', '枫之谷M'],
    ['代號鳶-沉浸式劇情卡牌手遊', '代号鸢-沉浸式剧情卡牌手游'],
    ['暗影紀元-魔幻冒险之旅', '暗影纪元-魔幻冒险之旅'], ['夜行猫 - 放置生存搜打撤遊戲', '夜行猫 - 放置生存搜打撤游戏'],
    ['明日之後', '明日之后'], ['一目瞭然', '一目了然'], ['乾淨', '干净'],
  ]) assert.equal(toSimplified(from), to, from);
});

test('Simplified, shared and non-Chinese text is left as it is', () => {
  for (const name of ['原神', '明日方舟', '王者荣耀', '明日之后', '皇后', '乾坤', 'MONOPOLY GO! (大富翁 GO!)', 'Heartopia', '王者荣耀😀', '𠮷野家']) assert.equal(toSimplified(name), name, name);
});

test('a Han alias is the zh-cn edition\'s own language only when the conversion leaves it unchanged', () => {
  for (const name of ['心动小镇', '明日方舟', '明日之后']) assert.equal(ownLanguage(name, 'zh-cn'), true, name);
  for (const name of ['心動小鎮', '明日之後', '暗影紀元-魔幻冒险之旅', 'Heartopia', 'アークナイツ', '두근두근타운']) assert.equal(ownLanguage(name, 'zh-cn'), false, name);
  assert.equal(ownLanguage('心動小鎮', 'zh-tw'), true);
  assert.equal(ownLanguage('心动小镇', 'zh-tw'), false);
});

test('punctuation of the kana blocks is not kana: a Chinese name with ・ belongs in zh-cn, a name with kana letters does not', () => {
  for (const name of ['三國志・戰略版', '三国志・战略版', 'Liquid Sort Puzzle・Color Match', '樱坂46・日向坂46']) assert.equal(fitsEdition(name, 'zh-cn'), true, name);
  for (const name of ['リネージュM', '信長の野望 覇道', 'ドラゴンクエスト・タクト', '悪魔執事と黒い猫']) assert.equal(fitsEdition(name, 'zh-cn'), false, name);
  assert.equal(toSimplified('三國志・戰略版'), '三国志・战略版');
  assert.equal(ownLanguage('三国志・战略版', 'zh-cn'), true);
  assert.equal(ownLanguage('三國志・戰略版', 'zh-cn'), false);
  for (const code of ['en', 'ko', 'zh-tw']) assert.equal(fitsEdition('三國志・戰略版', code), false, `${code} keeps its rule`);
  assert.equal(fitsEdition('三國志・戰略版', 'ja'), true);
});

test('Japanese shinjitai in a Han-only name becomes Simplified, through Traditional', () => {
  for (const [from, to] of [
    ['三國志 真戦', '三国志 真战'], ['三国志 真戦', '三国志 真战'], ['戦国戦輝', '战国战辉'], ['刀剣乱舞ONLINE', '刀剑乱舞ONLINE'],
    ['崩壊3rd', '崩坏3rd'], ['恋姫†大戦', '恋姬†大战'], ['聖闘士星矢', '圣斗士星矢'], ['産業革命', '产业革命'], ['桜花', '樱花'], ['呪術高専', '咒术高专'],
  ]) assert.equal(toSimplified(from), to, from);
  for (const name of ['三国志 真戦', '戦国', '刀剣乱舞']) assert.equal(ownLanguage(name, 'zh-cn'), false, `${name} has a shinjitai form left`);
  assert.equal(ownLanguage('三国志 真战', 'zh-cn'), true);
});

test('the shinjitai step leaves valid Chinese alone (characters and words Japanese writes differently)', () => {
  for (const name of ['研究', '欠缺', '暴露', '先端', '萌娘', '新郎', '翻译', '花瓶', '芸豆', '概念', '谨慎', '叙事']) assert.equal(toSimplified(name), name, name);
  assert.equal(toSimplified('並行世界'), '并行世界');
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
