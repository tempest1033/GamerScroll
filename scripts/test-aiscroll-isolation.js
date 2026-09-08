'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const cache = require('../ai-build-cache');
const current = { meta: {} };
cache.checkCssChanged(current);
cache.checkTemplateJsChanged(current);
const readFileSync = fs.readFileSync;
let changedPrefix = path.join(root, 'src', 'styles') + path.sep;
fs.readFileSync = function(file, ...args) {
  const result = readFileSync.call(this, file, ...args);
  if (typeof file === 'string' && path.resolve(file).startsWith(changedPrefix) && typeof result === 'string') {
    return result + '\n/* isolated test change */\n';
  }
  return result;
};
try {
  for (const directory of ['src/styles', 'src/templates/pages', 'src/templates/components', 'src/build']) {
    changedPrefix = path.join(root, directory) + path.sep;
    assert.equal(cache.checkCssChanged(structuredClone(current)), false, directory);
    assert.equal(cache.checkTemplateJsChanged(structuredClone(current)), false, directory);
  }
  changedPrefix = path.join(root, 'src/aiscroll-styles') + path.sep;
  assert.equal(cache.checkCssChanged(structuredClone(current)), true);
  changedPrefix = path.join(root, 'src/aiscroll-ui') + path.sep;
  assert.equal(cache.checkTemplateJsChanged(structuredClone(current)), true);
} finally {
  fs.readFileSync = readFileSync;
}
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.startsWith('.')) {
    const resolved = Module._resolveFilename(request, parent);
    for (const forbidden of ['src/templates/layout.js', 'src/templates/components/', 'src/templates/helpers/', 'src/build/']) {
      const target = path.join(root, forbidden);
      assert.ok(resolved !== target && !resolved.startsWith(target.endsWith(path.sep) ? target : target + path.sep),
        `AIScroll must render without GamerScroll code: ${resolved}`);
    }
  }
  return load.call(this, request, parent, isMain);
};
try {
  const { generateAIBlogIndex, generateSearchPage } = require('../src/templates/ai-blog/index');
  const { generateAIBlogArticle } = require('../src/templates/ai-blog/article');
  const article = {
    slug: 'isolation-check', category: 'news', title: 'Isolation check',
    summary: 'A stable article.', date: '2026-09-01T00:00:00Z',
    content: [{ type: 'text', value: 'Independent article body.' }]
  };
  for (const lang of ['en', 'ko']) {
    const home = generateAIBlogIndex({ articles: [article], lang });
    const detail = generateAIBlogArticle(article, { allArticles: [article], lang });
    assert.ok(home.includes('Isolation check'));
    assert.ok(detail.includes('Independent article body.'));
    assert.ok(generateSearchPage(lang).includes('<html'));
  }
} finally {
  Module._load = load;
}
console.log('PASS AI cache ignores GamerScroll edits, detects AI edits, and EN/KO pages render without GamerScroll UI/build modules.');
