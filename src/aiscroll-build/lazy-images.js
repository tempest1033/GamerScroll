/**
 * 첫 화면 밖 이미지 지연 로딩 (게이머스크롤 src/build/lazy-images.js와 같은 방식 — AIScroll 격리 규칙상 복사본)
 *
 * 브라우저 기본 loading="lazy"는 화면 아래 1250~2500px까지 미리 받아 첫 방문 때 광고 스크립트와
 * 대역폭을 나눠 쓴다 (느린 4G 측정: 광고 요청 전에 홈에서 이미지 280KB를 받음).
 * - 빌드: loading="lazy" <img>의 src/srcset을 data-gs-src/data-gs-srcset으로 옮긴다.
 * - 런타임: 화면 200px 앞에 온 이미지만 받고, 페이지 load 뒤에는 기본 lazy와 같은 1250px 앞에서 받는다.
 */

// src를 비우면 깨진 이미지 처리(complete·naturalWidth 0)에 걸리므로 투명 1px GIF를 둔다.
const PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// script·template·noscript·style·textarea 안의 <img> 문자열(JSON 데이터, 카드 템플릿)은 원문 그대로 둔다.
const HTML_TOKEN_RE = /<(script|template|noscript|style|textarea)\b[\s\S]*?<\/\1\s*>|<img\b[^>]*>/gi;

function deferImageTag(tag) {
  if (!/\sloading="lazy"/.test(tag) || /\sdata-gs-src="/.test(tag)) return tag;
  const src = /\ssrc="([^"]+)"/.exec(tag);
  if (!src || src[1].startsWith('data:')) return tag;
  return tag
    .replace(/\ssrcset="/, ' data-gs-srcset="')
    .replace(src[0], () => ` src="${PLACEHOLDER_SRC}" data-gs-src="${src[1]}"`);
}

function deferLazyImages(html) {
  return html.replace(HTML_TOKEN_RE, (match, rawBlock) => (rawBlock ? match : deferImageTag(match)));
}

// <head>에서 실행: 파서가 <img>를 넣는 즉시 관찰해 첫 화면 이미지가 기본 lazy보다 늦게 시작하지 않게 한다.
// scrollMargin은 안쪽 가로 스크롤 영역에도 같은 여유를 준다(미지원 브라우저는 무시).
const lazyImageLoaderScript = `<script>
    (function() {
      function show(img) {
        var srcset = img.getAttribute('data-gs-srcset');
        if (srcset !== null) {
          img.srcset = srcset;
          img.removeAttribute('data-gs-srcset');
        }
        img.src = img.getAttribute('data-gs-src');
        img.removeAttribute('data-gs-src');
      }
      function pending() { return document.querySelectorAll('img[data-gs-src]'); }
      if (!('IntersectionObserver' in window)) {
        document.addEventListener('DOMContentLoaded', function() { [].forEach.call(pending(), show); });
        return;
      }
      function watch(margin) {
        return new IntersectionObserver(function(entries, observer) {
          entries.forEach(function(entry) {
            if (!entry.isIntersecting || !entry.target.hasAttribute('data-gs-src')) return;
            observer.unobserve(entry.target);
            show(entry.target);
          });
        }, { rootMargin: margin + ' 0px', scrollMargin: margin });
      }
      var near = watch('200px');
      var parser = new MutationObserver(function(records) {
        records.forEach(function(record) {
          [].forEach.call(record.addedNodes, function(node) {
            if (node.nodeName === 'IMG' && node.hasAttribute('data-gs-src')) near.observe(node);
          });
        });
      });
      parser.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', function() {
        parser.disconnect();
        [].forEach.call(pending(), function(img) { near.observe(img); });
      });
      window.addEventListener('load', function() {
        near.disconnect();
        var far = watch('1250px');
        [].forEach.call(pending(), function(img) { far.observe(img); });
      });
    })();
  </script>`;

module.exports = { deferLazyImages, lazyImageLoaderScript };
