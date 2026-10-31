'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');
const { generateGamesHubPage } = require('../src/templates/pages/games-hub');

test('games hub A-Z list links only the listed games', () => {
  i18n.setEdition('ko');
  const games = {
    'Listed game': { slug: 'listed-game', icon: '', developer: 'Dev' },
    'Short history game': { slug: 'short-history-game', icon: '', developer: 'Dev' }
  };
  const html = generateGamesHubPage({ games, listedSlugs: new Set(['listed-game']) });
  const items = [...html.matchAll(/<a href="([^"]+)" class="game-item">/g)].map((m) => m[1]);
  assert.deepEqual(items, ['/ko/games/listed-game/']);
  i18n.setEdition('en');
});

test('a game with only regional store IDs keeps its rank history', () => {
  const { collectRankData } = require('../src/build/game-data');
  const S = { COUNTRIES: { kr: 'KR', tw: 'TW' }, seriesOf: (c, s, id) => (c === 'tw' && id === '42' ? [null, 3, 2] : [null, null, null]), hourlyRanks: () => null };
  assert.deepEqual(collectRankData(S, { ios_tw: '42' }).s, { tw: { ios: { o: 1, v: [3, 2] } } });
  assert.equal(collectRankData(S, { steam: 730 }), null);
});
