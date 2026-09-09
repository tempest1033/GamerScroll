'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { checkStatus, imageHotlinkCheck } = require('./lib/seo-delivery');

(async () => {
  for (const name of ['content/density', 'content/keyphrase-in-subheading', 'content/keyphrase-in-img-alt']) {
    assert.equal(checkStatus({ name, pass: false }), 'FAIL');
  }
  assert.equal(checkStatus({ name: 'body/image-hotlink', pass: false }), 'FAIL');
  assert.equal(checkStatus({ name: 'lighthouse/color-contrast', pass: false }), 'FAIL');
  assert.equal(checkStatus({ name: 'content/density', pass: true }), 'PASS');
  const image = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#172033' } }).png().toBuffer();
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/valid.png') response.writeHead(200, { 'Content-Type': 'image/png' }).end(image);
    else if (request.url === '/fake.png') response.writeHead(200).end('not an image'.repeat(100));
    else response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = `${origin}/article/hot/example/`;
    const html = src => cheerio.load(`<link rel="canonical" href="https://aiscroll.io/article/hot/example/"><meta property="og:image" content="https://aiscroll.io/valid.png"><img class="blog-image" src="${src}">`);
    assert.equal((await imageHotlinkCheck(html('/valid.png'), page)).pass, true);
    assert.deepEqual(requests, ['/valid.png']);
    assert.equal((await imageHotlinkCheck(html('/missing.png'), page)).pass, false);
    assert.equal((await imageHotlinkCheck(html('/fake.png'), page)).pass, false);
    console.log('SEO delivery: preview-origin resolution, deduplication, 404/invalid images and mandatory keyword severity passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
