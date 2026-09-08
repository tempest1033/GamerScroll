'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
// 공식 ID만 변환한다. 게임명이나 홍보 문구로 장르·성향을 추측하지 않는다.
const mapping = {
  '7014': 'rpg', GAME_ROLE_PLAYING: 'rpg',
  '7012': 'casual-puzzle', '7003': 'casual-puzzle', '7019': 'casual-puzzle', '7018': 'casual-puzzle',
  GAME_PUZZLE: 'casual-puzzle', GAME_CASUAL: 'casual-puzzle', GAME_WORD: 'casual-puzzle', GAME_TRIVIA: 'casual-puzzle',
  '7017': 'strategy-defense', GAME_STRATEGY: 'strategy-defense',
  '7016': 'sports-racing', '7013': 'sports-racing', GAME_SPORTS: 'sports-racing', GAME_RACING: 'sports-racing',
  '7001': 'action-shooting', GAME_ACTION: 'action-shooting',
  '7004': 'card-board', '7005': 'card-board', '7006': 'card-board',
  GAME_CARD: 'card-board', GAME_BOARD: 'card-board', GAME_CASINO: 'card-board',
  '7015': 'simulation', GAME_SIMULATION: 'simulation'
};
function compile(survey, manual) {
  const games = {}, review = [];
  for (const [slug, game] of Object.entries(survey.games)) {
    const sources = Object.entries(game.stores).filter(([, s]) => s.status === 'found').map(([store, s]) => ({
      store, id: s.id, title: s.title, url: s.url, checkedAt: s.checkedAt,
      genreIds: [...new Set([...(s.genreIds || []), ...(s.categories || []).map(c => c.id).filter(Boolean)])],
      genres: [...new Set([...(s.genreIds || []), ...(s.categories || []).map(c => c.id)].map(id => mapping[id]).filter(Boolean))],
      categories: (s.categories || []).map(c => c.name)
    }));
    // 다중 장르를 허용하되 서로 다른 스토어의 분류를 임의로 하나로 확정하지 않는다.
    const genres = [...new Set(sources.flatMap(s => s.genres))];
    const reasons = [];
    if (!sources.length) reasons.push('store-unavailable');
    else if (!genres.length) reasons.push('outside-current-taxonomy');
    if (sources.length > 1 && new Set(sources.map(s => s.genres.slice().sort().join(','))).size > 1) reasons.push('store-disagreement');
    const override = manual.games[slug];
    if (override?.genres?.some(g => !genres.includes(g)) && !override.reviewNote) reasons.push('editorial-genre-not-in-store');
    const candidates = [];
    const categories = sources.flatMap(s => s.categories);
    if (categories.some(c => ['방치형 RPG', '방치형'].includes(c))) candidates.push('idle');
    if (categories.includes('하이퍼캐주얼')) candidates.push('hypercasual');
    const pendingTags = candidates.filter(t => !(override?.tags || []).includes(t));
    if (pendingTags.length) reasons.push('tag-review');
    games[slug] = { genres, sources, reviewReasons: reasons, suggestedTags: pendingTags };
    if (reasons.length) review.push({ slug, name: game.name, reasons, officialGenres: genres, editorialGenres: override?.genres, suggestedTags: pendingTags });
  }
  return { version: 1, surveyFinishedAt: survey.finishedAt, games, summary: {
    total: Object.keys(games).length, officialClassified: Object.values(games).filter(g => g.genres.length).length,
    unavailable: review.filter(g => g.reasons.includes('store-unavailable')).length,
    outsideTaxonomy: review.filter(g => g.reasons.includes('outside-current-taxonomy')).length,
    storeDisagreements: review.filter(g => g.reasons.includes('store-disagreement')).length,
    editorialDifferences: review.filter(g => g.reasons.includes('editorial-genre-not-in-store')).length
  }, review };
}
if (require.main === module) {
  const result = compile(read('game-genre-survey.json'), read('game-classifications.json'));
  fs.writeFileSync(path.join(root, 'data/game-store-genres.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary));
  console.log(JSON.stringify(result.review.filter(g => g.reasons.includes('editorial-genre-not-in-store')), null, 2));
}
module.exports = { compile };
