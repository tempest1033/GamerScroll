'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { copyArticleAssets } = require('../src/build/article-assets');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiscroll-assets-'));
try {
  const slug = 'test-article';
  const source = path.join(root, 'data/article-assets/aiscroll', slug);
  const output = path.join(root, 'output');
  fs.mkdirSync(source, { recursive: true });
  for (const name of ['thumbnail.webp', 'body.webp', 'original.png', 'generation.json']) {
    fs.writeFileSync(path.join(source, name), name);
  }
  const prefix = `/assets/images/tech/ai/${slug}/`;
  const article = {
    slug, thumbnail: `${prefix}thumbnail.webp`,
    content: [{ type: 'image', src: `${prefix}body.webp` }],
    contentEn: [{ type: 'image', src: `${prefix}body.webp` }]
  };
  assert.equal(copyArticleAssets(root, output, [article]), 2);
  const emitted = path.join(output, 'assets/images/tech/ai', slug);
  assert.deepEqual(fs.readdirSync(emitted).sort(), ['body.webp', 'thumbnail.webp']);
  assert.equal(fs.readFileSync(path.join(emitted, 'body.webp'), 'utf8'), 'body.webp');
  assert.equal(copyArticleAssets(root, output, [{ slug: 'legacy', thumbnail: 'https://example.com/a.png' }]), 0);
  assert.throws(() => copyArticleAssets(root, output, [{ ...article, thumbnail: `${prefix}missing.webp` }]), /ENOENT/);
  assert.throws(() => copyArticleAssets(root, output, [{ ...article, thumbnail: `${prefix}../escape.webp` }]), /Invalid article asset/);
  console.log('Article assets: clean output, deduplication, legacy compatibility and invalid/missing source checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
