'use strict';

const assert = require('node:assert/strict');
const { renderArticleAction } = require('../src/templates/helpers/article-action');

for (const brand of ['paseo', 'orca', 'deepseek-harness']) {
  const html = renderArticleAction({
    variant: 'button', brand, url: 'https://example.com/install', text: `Install ${brand}`
  });
  assert.match(html, /href="https:\/\/example\.com\/install"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /src="data:image\/svg\+xml;base64,[^"]+"/);
  assert.match(html, /alt=""/);
  assert.ok(html.includes(`Install ${brand}`));
}
for (const url of ['javascript:alert(1)', 'data:text/html,evil', '/relative', 'https://user:pass@example.com']) {
  assert.equal(renderArticleAction({ variant: 'button', url, text: 'Install' }), '');
}
assert.equal(renderArticleAction({ variant: 'button', url: 'https://example.com', text: '' }), '');
const escaped = renderArticleAction({
  variant: 'button', brand: '../../unknown', url: 'https://example.com', text: '<script>"&'
});
assert.ok(!escaped.includes('<img'));
assert.match(escaped, /&lt;script&gt;&quot;&amp;/);
console.log('Article actions: official icons, safe links, labels and unknown-brand fallback passed.');
