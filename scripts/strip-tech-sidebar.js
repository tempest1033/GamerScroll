/**
 * One-shot: remove the "테크" sidebar-category-group + techCategories arrays
 * from page template files. Idempotent.
 */

const fs = require('fs');
const path = require('path');

const TARGETS = [
  'src/templates/pages/trend.js',
  'src/templates/pages/trends-hub.js'
];

const ROOT = path.resolve(__dirname, '..');

let totalRemoved = 0;

for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { console.log(`skip (not found): ${rel}`); continue; }
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Remove sidebar-category-group blocks containing href="/tech/"
  const groupRe = /\s*<div class="sidebar-category-group">\s*<div class="home-card-header"><a href="\/tech\/"[\s\S]*?<\/div>\s*<\/div>/g;
  src = src.replace(groupRe, '');

  // Remove techCategories arrays (common shape).
  const arrayRe = /\s*\/\/[^\n]*テ크[^\n]*\n\s*const techCategories = \[[\s\S]*?\];\s*\n/g;
  src = src.replace(arrayRe, '\n');

  if (src !== original) {
    fs.writeFileSync(file, src, 'utf8');
    const diff = (original.length - src.length);
    console.log(`patched: ${rel} (-${diff} bytes)`);
    totalRemoved += diff;
  } else {
    console.log(`unchanged: ${rel}`);
  }
}

console.log(`done. total bytes removed: ${totalRemoved}`);
