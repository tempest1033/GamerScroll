const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const cheerio = require('cheerio');
const { standard: runtimeStates } = require('./css-safelist');
const escapeAttr = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// 초기 HTML의 모든 요소를 보존한다. 화면 높이를 추측해서 아래 요소를 잘라내지 않는다.
// 상태 클래스·복잡한 속성·알 수 없는 pseudo는 보수적으로 남긴다.
function pageTokens(html) {
  const $ = cheerio.load(html);
  const tokens = { tag: new Set(), class: new Set(runtimeStates), id: new Set() };
  $('*').each((_, element) => {
    tokens.tag.add(element.name);
    const attrs = element.attribs || {};
    if (attrs.id) tokens.id.add(attrs.id);
    for (const name of (attrs.class || '').split(/\s+/)) if (name) tokens.class.add(name);
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
// (예전 키는 페이지 전체 토큰이라 id가 페이지마다 달라 3,900여 페이지가 모두 캐시를 놓쳤다. 2026-09-28)
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

function renderCssLinks(cssFiles, assetDir = null, html = '') {
  const files = [...new Set(cssFiles.map(file => String(file || '').trim()).filter(Boolean))];
  if (!files.length) files.push('/styles-core.css');
  const tokens = html ? pageTokens(html) : null;
  return files.map((file) => {
    const href = escapeAttr(file);
    const link = `<link rel="stylesheet" href="${href}">`;
    if (!tokens) return link;
    // 미생성 자산/외부 CSS는 레이아웃이 없는 상태로 그리지 않고 정상 stylesheet로 처리한다.
    if (!/^\/styles(?:-[a-z]+)?(?:\.[a-f0-9]{8})?\.css$/.test(file)) return link;
    const directory = assetDir || path.resolve(__dirname, '../..', /\.[a-f0-9]{8}\.css$/.test(file) ? 'docs' : '.');
    const filename = path.join(directory, file.slice(1));
    let source;
    try {
      source = fs.readFileSync(filename, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return link;
      throw error;
    }
    return `<style data-layout-css="${href}">${pageCss(source, tokens)}</style>
  <link rel="preload" href="${href}" as="style" onload="this.onload=null;this.rel='stylesheet'" data-deferred-css="1"><noscript>${link}</noscript>`;
  }).join('\n  ');
}

function applyPageCss(html, cssFiles, assetDir = null) {
  const end = html.indexOf('</head>');
  if (end < 0) throw new Error('Page CSS requires a complete HTML head');
  const links = renderCssLinks(cssFiles, assetDir, html);
  const head = html.slice(0, end)
    .replace(/<style\b[^>]*\bdata-layout-css="[^"]*"[^>]*>[\s\S]*?<\/style>\s*/gi, '')
    .replace(/<link\b[^>]*\bhref="\/styles(?:[.-][a-z0-9-]+)*\.css"[^>]*>\s*/gi, '')
    .replace(/<noscript>\s*<\/noscript>\s*/gi, '');
  const marker = '<!-- 메인 CSS -->';
  return (head.includes(marker) ? head.replace(marker, () => marker + '\n' + links) : head + links) + html.slice(end);
}

module.exports = { renderCssLinks, applyPageCss };
