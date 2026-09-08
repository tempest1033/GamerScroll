'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { loadReports } = require('../src/rank/reports');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
async function main() {
  const list = loadReports();
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < list.length) {
      const a = list[next++];
      const dir = path.join(root, 'docs/assets/images', a.cat, a.slug);
      const target = path.join(dir, 'thumbnail.webp');
      if (fs.existsSync(target)) { results.push({ slug: a.slug, status: 'existing' }); continue; }
      const post = read(path.join(root, 'reports', a.cat, `${a.slug}.json`));
      const candidates = [...new Set([a.thumbnail, ...(post.content || []).filter(b => b.type === 'image').map(b => b.src)].filter(u => /^https:\/\//.test(u)))];
      const errors = [];
      let saved = false;
      for (const url of candidates.slice(0, 4)) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          const meta = await sharp(buffer).metadata();
          if (!meta.width || meta.width < 120) throw new Error('Image too small');
          const full = await sharp(buffer).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
          const small = await sharp(buffer).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(target, full, { flag: 'wx' });
          fs.writeFileSync(path.join(dir, 'thumbnail-sm.webp'), small, { flag: 'wx' });
          results.push({ slug: a.slug, status: url === a.thumbnail ? 'original' : 'article-image', source: url, errors });
          saved = true; break;
        } catch (e) { errors.push({ url, message: e.message }); }
      }
      if (!saved) results.push({ slug: a.slug, status: 'unresolved', errors });
    }
  }));
  fs.writeFileSync(path.join(root, 'mockups/report-thumbnail-audit.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some(r => r.status === 'unresolved')) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
