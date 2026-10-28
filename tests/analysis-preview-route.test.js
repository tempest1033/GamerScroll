'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateGamePage } = require('../src/templates/pages/game');
const game = { name: 'Preview test', slug: 'preview-test', platforms: [], names: {} };
test('analysis route fails closed without explicit preview and bundle', () => {
  assert.equal(generateGamePage(game, undefined, { active: 'analysis' }), null);
  assert.equal(generateGamePage(game, undefined, {
    localPreview: true, active: 'analysis', generateAnalysisTabs: () => 'tabs'
  }), null);
});
