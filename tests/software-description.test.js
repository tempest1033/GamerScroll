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
