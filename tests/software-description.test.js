'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { trimDescription, cleanDescription } = require('../src/templates/helpers/game-description');

const sentences = ['Short lead.', 'A second sentence that is quite long and pushes the joined text well beyond the one hundred fifty five character limit of a meta description tag.'];

test('meta description keeps its ellipsis cut, JSON-LD description never ends with one', () => {
  const meta = trimDescription(sentences, ' ');
  assert.ok(meta.endsWith('…'), 'meta behavior unchanged');
  assert.equal(cleanDescription(meta, sentences, ' '), 'Short lead.');
});

test('a first sentence over the limit stays whole; untruncated text is untouched', () => {
  const long = ['x'.repeat(200) + '.'];
  assert.equal(cleanDescription(trimDescription(long, ' '), long, ' '), long[0]);
  assert.equal(cleanDescription('Fine sentence.', ['Fine sentence.'], ' '), 'Fine sentence.');
  assert.equal(cleanDescription('One. Two cut off…', null, ' '), 'One.');
  assert.equal(cleanDescription('No boundary here…', null, ' '), 'No boundary here');
});
