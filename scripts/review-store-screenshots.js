'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const modulePlay = require('google-play-scraper'), play = modulePlay.default || modulePlay;
const root = path.resolve(__dirname, '..'), out = path.join(root, 'mockups/store-review');
const survey = require('../data/game-genre-survey.json');
const report = require('../data/game-tag-resolution-report.json');
const entries = [...new Map(report.rows.filter(r => r.status === 'unverified' && !['alter-ego', '킹-오브-파이터-afk'].includes(r.slug)).map(r => [r.slug, r])).values()];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
async function main() {
  fs.mkdirSync(out, { recursive: true });
  let next = 0;
  const results = new Array(entries.length);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < entries.length) {
      const i = next++, row = entries[i], game = survey.games[row.slug];
      try {
        let screenshots, title, developerWebsite;
        if (game.appIds.android) {
          const a = await play.app({ appId: game.appIds.android, country: 'kr', lang: 'ko' });
          screenshots = a.screenshots; title = a.title; developerWebsite = a.developerWebsite;
        } else {
          const response = await fetch(`https://itunes.apple.com/lookup?id=${game.appIds.ios}&country=kr`, { signal: AbortSignal.timeout(20000) });
          const a = (await response.json()).results.find(a => String(a.trackId) === String(game.appIds.ios));
          if (!a) throw new Error('App unavailable');
          screenshots = a.screenshotUrls; title = a.trackName; developerWebsite = a.sellerUrl;
        }
        const assets = [];
        for (const [j, url] of (screenshots || []).slice(0, 2).entries()) {
          const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error(`Screenshot HTTP ${response.status}`);
          const file = `${i + 1}-${j + 1}.png`;
          await sharp(Buffer.from(await response.arrayBuffer())).resize(230, 410, { fit: 'contain', background: '#fff' }).png().toFile(path.join(out, file));
          assets.push({ url, file });
        }
        results[i] = { index: i + 1, slug: row.slug, title, developerWebsite, assets };
      } catch (e) { results[i] = { index: i + 1, slug: row.slug, error: e.message, assets: [] }; }
    }
  }));
  fs.writeFileSync(path.join(out, 'sources.json'), JSON.stringify(results, null, 2));
  for (let start = 0; start < results.length; start += 6) {
    const rows = results.slice(start, start + 6), composites = [];
    for (const [i, row] of rows.entries()) {
      const left = i % 2 * 480, top = Math.floor(i / 2) * 470;
      composites.push({ input: Buffer.from(`<svg width="470" height="45"><rect width="470" height="45" fill="white"/><text x="8" y="28" font-family="Malgun Gothic" font-size="16">${row.index}. ${esc(row.title || row.slug)}</text></svg>`), left, top });
      for (const [j, asset] of row.assets.entries()) composites.push({ input: path.join(out, asset.file), left: left + j * 235, top: top + 45 });
    }
    const file = path.join(out, `sheet-${start / 6 + 1}.png`);
    await sharp({ create: { width: 960, height: Math.ceil(rows.length / 2) * 470, channels: 3, background: '#eeeeee' } }).composite(composites).png().toFile(file);
    console.log(file);
  }
  console.log(JSON.stringify(results.filter(r => r.error)));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
