'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { trimDescription, cleanDescription } = require('../src/templates/helpers/game-description');
const { fitSentences } = require('../src/templates/helpers/fit-description');

const sentences = ['Short lead.', 'A second sentence that is quite long and pushes the joined text well beyond the one hundred fifty five character limit of a meta description tag.'];

test('meta description keeps whole sentences only, never an ellipsis', () => {
  assert.equal(trimDescription(sentences, ' '), 'Short lead.');
  assert.equal(fitSentences(sentences.join(' ')), 'Short lead.');
  assert.equal(fitSentences('一。' + '二'.repeat(80) + '。'), '一。');
});

test('a first sentence over the limit stays whole; untruncated text is untouched', () => {
  const long = ['x'.repeat(200) + '.'];
  assert.equal(cleanDescription(trimDescription(long, ' '), long, ' '), long[0]);
  assert.equal(cleanDescription('Fine sentence.', ['Fine sentence.'], ' '), 'Fine sentence.');
  assert.equal(cleanDescription('One. Two cut off…', null, ' '), 'One.');
  assert.equal(cleanDescription('No boundary here…', null, ' '), 'No boundary here');
});

test('an over-budget first sentence is replaced by the complete fallback sentence, in both helpers', () => {
  const fallback = 'Short fallback sentence.';
  const long = 'A '.repeat(150) + 'sentence.';
  assert.equal(fitSentences(long, fallback), fallback);
  assert.equal(trimDescription([long, 'Second.'], ' ', fallback), fallback);
  assert.equal(fitSentences('日'.repeat(100) + '。', fallback), fallback);
});

test('structured sentences keep names with punctuation intact', () => {
  const lead = 'MONOPOLY GO! revenue ranking history for the Scopely casual game.';
  const out = trimDescription([lead, 'It is at its all-time high right now: #1 on the United States App Store top-grossing chart for a long stretch.'], ' ', 'x.');
  assert.equal(out, lead);
});

test('prose with "NAME! lowercase" is not split at the name', () => {
  const long = 'MONOPOLY GO! ' + 'revenue ranking history '.repeat(12) + 'end.';
  assert.equal(fitSentences(long, 'Fallback.'), 'Fallback.');
});

test('every site/game fallback description is a complete sentence within the budget in all editions', () => {
  const i18n = require('../src/i18n');
  const { width, MAX_WIDTH } = require('../src/templates/helpers/fit-description');
  for (const edition of i18n.EDITIONS) {
    i18n.setEdition(edition.code);
    const text = i18n.t('head.daily_records_and_analysis_of');
    assert.ok(width(text) <= MAX_WIDTH, `${edition.code}: ${width(text)} columns`);
    assert.match(text, /[.!?。！？]$/);
    for (const key of ['game.seo_desc_mobile', 'game.seo_desc_steam']) assert.ok(width(i18n.t(key, { name: '' })) <= MAX_WIDTH, `${edition.code} ${key}`);
  }
});
