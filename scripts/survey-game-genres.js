'use strict';
const fs = require('node:fs');
const path = require('node:path');
const playModule = require('google-play-scraper');
const play = playModule.default || playModule;
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const target = path.join(root, 'data/game-genre-survey.json');
const games = Object.entries(read(path.join(root, 'data/games.json')).games).filter(([, g]) => g.appIds?.ios || g.appIds?.android);
const previous = fs.existsSync(target) ? read(target) : { games: {} };
const survey = { version: 1, startedAt: previous.startedAt || new Date().toISOString(), games: previous.games };
const save = () => {
  const temporary = target + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(survey, null, 2));
  fs.renameSync(temporary, target);
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  for (const [name, g] of games) survey.games[g.slug] ||= { name, appIds: g.appIds, stores: {} };
  const iosIds = [...new Set(games.filter(([, g]) => g.appIds.ios && !survey.games[g.slug].stores.ios).map(([, g]) => String(g.appIds.ios)))];
  const ios = new Map();
  for (const country of ['kr', 'us', 'jp', 'tw']) {
    const missing = iosIds.filter(id => !ios.has(id));
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      try {
        const response = await fetch(`https://itunes.apple.com/lookup?id=${batch.join(',')}&country=${country}&limit=200`, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        for (const a of body.results || []) if (a.trackId) ios.set(String(a.trackId), { status: 'found', id: String(a.trackId), title: a.trackName, genres: a.genres || [], genreIds: a.genreIds || [], description: a.description || '', developer: a.artistName || a.sellerName, url: a.trackViewUrl, country, checkedAt: new Date().toISOString() });
      } catch (e) {
        console.error(`App Store ${country} batch ${i / 100 + 1}: ${e.message}`);
        survey.errors ||= [];
        survey.errors.push({ store: 'ios', country, ids: batch, message: e.message });
      }
      await delay(120);
    }
    console.log(`App Store ${country}: ${ios.size}/${iosIds.length} IDs found`);
  }
  for (const [, g] of games) if (g.appIds.ios && !survey.games[g.slug].stores.ios) {
    survey.games[g.slug].stores.ios = ios.get(String(g.appIds.ios)) || { status: 'unavailable', id: String(g.appIds.ios), countriesChecked: ['kr', 'us', 'jp', 'tw'], checkedAt: new Date().toISOString() };
  }
  save();
  const pending = games.filter(([, g]) => g.appIds.android && !survey.games[g.slug].stores.android);
  let next = 0, completed = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (next < pending.length) {
      const [, g] = pending[next++];
      const errors = [];
      let result;
      for (const country of ['kr', 'us']) {
        try {
          const a = await play.app({ appId: g.appIds.android, country, lang: country === 'kr' ? 'ko' : 'en', requestOptions: { timeout: 20000 } });
          result = { status: 'found', id: g.appIds.android, title: a.title, genres: [a.genre], genreIds: [a.genreId], categories: a.categories || [], description: a.description || '', developer: a.developer, url: a.url, country, checkedAt: new Date().toISOString() };
          break;
        } catch (e) { errors.push({ country, message: e.message }); }
      }
      survey.games[g.slug].stores.android = result || { status: 'unavailable', id: g.appIds.android, errors, checkedAt: new Date().toISOString() };
      completed++;
      if (completed % 100 === 0) { save(); console.log(`Google Play ${completed}/${pending.length}`); }
      await delay(150);
    }
  }));
  survey.finishedAt = new Date().toISOString();
  survey.summary = { total: games.length, found: 0, unavailable: 0, ios: 0, android: 0 };
  for (const entry of Object.values(survey.games)) {
    const found = Object.values(entry.stores).some(s => s.status === 'found');
    survey.summary[found ? 'found' : 'unavailable']++;
    for (const store of ['ios', 'android']) if (entry.stores[store]?.status === 'found') survey.summary[store]++;
  }
  save();
  console.log(JSON.stringify(survey.summary));
}
main().catch(e => { save(); console.error(e); process.exitCode = 1; });
