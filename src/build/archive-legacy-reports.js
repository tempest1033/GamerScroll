'use strict';
const fs = require('node:fs');
const path = require('node:path');

// 생성 원본이 없는 기존 보관 페이지에도 동일 정책을 적용한다. 본문은 그대로 둔다.
function archiveLegacyReports(docsDir) {
  let changed = 0;
  for (const category of ['issue', 'hotpick']) {
    const directory = path.join(docsDir, 'magazine', category);
    if (!fs.existsSync(directory)) continue;
    const files = [path.join(directory, 'index.html'), ...fs.readdirSync(directory, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(directory, e.name, 'index.html'))];
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      const robots = /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i;
      const tag = '<meta name="robots" content="noindex, follow">';
      const next = robots.test(html) ? html.replace(robots, tag) : html.replace(/<\/head>/i, `${tag}</head>`);
      if (next === html) continue;
      const backup = path.resolve(docsDir, '../mockups/legacy-report-backups', category, path.basename(path.dirname(file)) + '.html');
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, html, { flag: 'wx' });
      fs.writeFileSync(file, next);
      changed++;
    }
  }
  return changed;
}
module.exports = { archiveLegacyReports };
