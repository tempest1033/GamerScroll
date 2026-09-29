/**
 * 페이지별 인라인 CSS (게이머스크롤 src/build/css-links.js와 같은 방식 — AIScroll 격리 규칙상 복사본)
 *
 * 초기 HTML에 있는 태그·클래스·id로 CSS 규칙을 걸러 <style data-layout-css>로 넣어 첫 화면이
 * CSS 파일을 기다리지 않게 하고, 전체 CSS 파일은 페이지 load 또는 첫 조작 때 받는다.
 * 나중에 자바스크립트가 붙이는 상태 클래스는 RUNTIME_CLASSES와 is-/has-/gs-ad- 접두사로 보존하고,
 * 나중에 그려지는 화면(검색 결과 등)의 클래스는 그 자리의 data-css-tokens 속성에 적어 둔다.
 */
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const cheerio = require('cheerio');

const RUNTIME_CLASSES = [
  'active', 'open', 'loaded', 'search-open', 'search-hidden', 'feed-top-spacer',
  'ad-card', 'ad-card-scroll', 'adsbygoogle', 'ads-disabled'
];
const escapeAttr = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// 초기 HTML의 모든 요소를 보존한다. 화면 높이를 추측해서 아래 요소를 잘라내지 않는다.
function pageTokens(html) {
  const $ = cheerio.load(html);
  const tokens = { tag: new Set(), class: new Set(RUNTIME_CLASSES), id: new Set() };
  $('*').each((_, element) => {
    tokens.tag.add(element.name);
    const attrs = element.attribs || {};
    if (attrs.id) tokens.id.add(attrs.id);
    for (const name of `${attrs.class || ''} ${attrs['data-css-tokens'] || ''}`.split(/\s+/)) if (name) tokens.class.add(name);
  });
  return tokens;
}

// matches()가 실제로 검사하는 tag·class·id 값만 모은다 (같은 순회 규칙).
function collectTokens(node, universe) {
  if (node.type === 'root' || node.type === 'selector') return node.nodes.forEach(child => collectTokens(child, universe));
  if (node.type === 'class' && /^(?:is-|has-|gs-ad-)/.test(node.value)) return;
  if (universe[node.type]) return universe[node.type].add(node.value);
  if (node.type === 'pseudo' && [':is', ':where'].includes(node.value)) node.nodes.forEach(child => collectTokens(child, universe));
}

// CSS 원본마다 선택자를 한 번만 파싱해 두고, 페이지 결과는 "이 CSS가 검사하는 토큰" 중 페이지에 있는 것의
// 조합으로 캐시한다. 결과 CSS는 그 조합으로만 정해지므로 출력은 페이지 전체 토큰으로 계산한 것과 같다.
const compiledCache = new Map();
function compile(source) {
  let compiled = compiledCache.get(source);
  if (compiled) return compiled;
  const universe = { tag: new Set(), class: new Set(), id: new Set() };
  const rules = [];
  postcss.parse(source).walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return rules.push(null);
    const selectors = selectorParser().astSync(rule.selector);
    collectTokens(selectors, universe);
    rules.push(selectors);
  });
  compiled = { rules, universe, results: new Map() };
  if (compiledCache.size >= 8) compiledCache.delete(compiledCache.keys().next().value);
  compiledCache.set(source, compiled);
  return compiled;
}

function relevantKey(tokens, universe) {
  return ['tag', 'class', 'id'].map(type => [...universe[type]].filter(value => tokens[type].has(value)).join(' ')).join('|');
}

function matches(node, tokens) {
  if (node.type === 'root') return node.nodes.some(child => matches(child, tokens));
  if (node.type === 'selector') return node.nodes.every(child => matches(child, tokens));
  if (node.type === 'class' && /^(?:is-|has-|gs-ad-)/.test(node.value)) return true;
  if (tokens[node.type]) return tokens[node.type].has(node.value);
  if (node.type === 'pseudo' && [':is', ':where'].includes(node.value)) {
    return node.nodes.some(child => matches(child, tokens));
  }
  return true;
}

function pageCss(source, tokens) {
  const compiled = compile(source);
  const key = relevantKey(tokens, compiled.universe);
  const hit = compiled.results.get(key);
  if (hit !== undefined) return hit;
  const root = postcss.parse(source);
  let index = 0;
  root.walkRules(rule => {
    const selectors = compiled.rules[index++];
    if (!selectors) return;
    const all = selectors.nodes;
    const kept = all.filter(selector => matches(selector, tokens));
    if (!kept.length) return rule.remove();
    // 캐시한 선택자 트리를 잠시 걸러 문자열로 만든 뒤 되돌린다 (원본과 같은 직렬화).
    selectors.nodes = kept;
    rule.selector = selectors.toString();
    selectors.nodes = all;
  });
  root.walkComments(comment => comment.remove());
  function prune(node) {
    if (!node.nodes) return;
    [...node.nodes].forEach(prune);
    if (node.type !== 'root' && node.nodes.length === 0) node.remove();
  }
  prune(root);
  const css = root.toString().replace(/<\/style/gi, '<\\/style');
  if (compiled.results.size >= 4096) compiled.results.delete(compiled.results.keys().next().value);
  compiled.results.set(key, css);
  return css;
}

// 전체 CSS 파일은 첫 화면을 인라인 CSS로 그린 뒤, 광고 스크립트와 대역폭을 나눠 쓰지 않도록
// 페이지 load 또는 첫 조작(터치·키 입력·포커스) 중 먼저 오는 때에 받는다.
// 각 인라인 CSS 바로 뒤에 넣어 같은 캐스케이드 순서를 지킨다.
const deferredCssLoaderScript = `<script data-css-loader>
    (function() {
      var started = false;
      function start() {
        if (started) return;
        started = true;
        [].forEach.call(document.querySelectorAll('style[data-layout-css]'), function(style) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = style.getAttribute('data-layout-css');
          style.parentNode.insertBefore(link, style.nextSibling);
        });
      }
      window.addEventListener('load', start);
      ['pointerdown', 'keydown', 'focusin'].forEach(function(type) {
        window.addEventListener(type, start, { capture: true, once: true, passive: true });
      });
    })();
  </script>`;

// cssFiles: 해시 파일명 목록(/styles-core.<hash>.css …), assetDir: 그 파일들이 있는 출력 폴더
function renderCssLinks(cssFiles, assetDir, html) {
  const tokens = pageTokens(html);
  let inlined = false;
  const links = [...new Set(cssFiles)].map((file) => {
    const href = escapeAttr(file);
    const link = `<link rel="stylesheet" href="${href}">`;
    let source;
    try {
      source = fs.readFileSync(path.join(assetDir, file.replace(/^\//, '')), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return link;
      throw error;
    }
    inlined = true;
    return `<style data-layout-css="${href}">${pageCss(source, tokens)}</style>
  <noscript>${link}</noscript>`;
  });
  if (inlined) links.push(deferredCssLoaderScript);
  return links.join('\n  ');
}

// 이전 인라인 CSS·로더·링크를 지우고 <!-- 메인 CSS --> 자리에 다시 넣는다 (여러 번 적용해도 결과가 같다).
function applyPageCss(html, cssFiles, assetDir) {
  const end = html.indexOf('</head>');
  if (end < 0) throw new Error('Page CSS requires a complete HTML head');
  const links = renderCssLinks(cssFiles, assetDir, html);
  const head = html.slice(0, end)
    .replace(/<style\b[^>]*\bdata-layout-css="[^"]*"[^>]*>[\s\S]*?<\/style>\s*/gi, '')
    .replace(/<script data-css-loader>[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<link\b[^>]*\bhref="\/styles(?:[.-][a-z0-9-]+)*\.css"[^>]*>\s*/gi, '')
    .replace(/<noscript>\s*<\/noscript>\s*/gi, '');
  const marker = '<!-- 메인 CSS -->';
  return (head.includes(marker) ? head.replace(marker, () => marker + '\n  ' + links) : head + links) + html.slice(end);
}

module.exports = { applyPageCss };
