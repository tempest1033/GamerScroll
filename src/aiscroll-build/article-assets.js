'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 원본과 생성 기록은 보관하고, 기사에서 참조하는 배포용 WebP만 내보낸다.
function copyArticleAssets(root, output, articles) {
  let copied = 0;
  for (const article of articles) {
    const slug = article.slug;
    if (!/^[a-z0-9-]+$/.test(slug || '')) continue;
    const source = path.join(root, 'data', 'article-assets', 'aiscroll', slug);
    if (!fs.existsSync(source)) continue; // 기존 외부 이미지·배포 이미지 경로는 유지한다.
    const prefix = `/assets/images/tech/ai/${slug}/`;
    const urls = new Set([
      article.thumbnail,
      ...['content', 'contentEn'].flatMap(key =>
        (article[key] || []).filter(block => block.type === 'image').map(block => block.src))
    ]);
    for (const url of urls) {
      if (typeof url !== 'string' || !url.startsWith(prefix)) continue;
      const name = url.slice(prefix.length);
      if (!/^[a-zA-Z0-9_-]+\.webp$/.test(name)) {
        throw new Error(`Invalid article asset: ${url}`);
      }
      const input = path.join(source, name);
      if (!fs.lstatSync(input).isFile()) throw new Error(`Invalid article asset file: ${input}`);
      const destination = path.join(output, 'assets', 'images', 'tech', 'ai', slug);
      fs.mkdirSync(destination, { recursive: true });
      fs.copyFileSync(input, path.join(destination, name));
      copied++;
    }
  }
  return copied;
}

module.exports = { copyArticleAssets };
