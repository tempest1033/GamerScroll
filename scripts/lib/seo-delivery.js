'use strict';

const axios = require('axios');
const sharp = require('sharp');

function checkStatus(check) {
  return check.pass ? 'PASS' : 'FAIL';
}

async function imageHotlinkCheck($, pageUrl) {
  const page = new URL(pageUrl);
  const canonical = $('link[rel="canonical"]').attr('href');
  let canonicalOrigin;
  try { canonicalOrigin = new URL(canonical).origin; } catch {}
  const preview = ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
  const urls = new Set();
  for (const src of [
    $('meta[property="og:image"]').attr('content'),
    ...$('img.blog-image').map((_i, el) => $(el).attr('src')).get()
  ]) {
    if (!src) continue;
    const url = new URL(src, page);
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    // 로컬 미리보기의 자체 이미지에만 현재 서버를 사용한다. 외부 프록시는 그대로 검사한다.
    if (preview && url.origin === canonicalOrigin) {
      url.protocol = page.protocol;
      url.host = page.host;
    }
    urls.add(url.href);
  }
  const failures = [];
  const pending = [...urls];
  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const url = pending[index++];
      try {
        const response = await axios.get(url, {
          timeout: 12000, responseType: 'arraybuffer', validateStatus: () => true,
          maxRedirects: 5, maxContentLength: 20 * 1024 * 1024
        });
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        if (response.data.byteLength <= 79) throw new Error('empty image');
        const metadata = await sharp(response.data).metadata();
        if (!metadata.width || !metadata.height) throw new Error('invalid image');
      } catch (error) {
        failures.push(`${url} -> ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, pending.length) }, worker));
  return {
    name: 'body/image-hotlink', pass: failures.length === 0,
    detail: failures.length ? failures.slice(0, 3).join('; ') : `${urls.size} images decoded successfully`
  };
}

module.exports = { checkStatus, imageHotlinkCheck };
