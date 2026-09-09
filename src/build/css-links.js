const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const cheerio = require('cheerio');
const { standard: runtimeStates } = require('./css-safelist');
const cache = new Map();
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
  tokens.key = ['tag', 'class', 'id'].map(type => [...tokens[type]].sort().join(' ')).join('|');
  return tokens;
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
  const key = source + '\0' + tokens.key;
  if (cache.has(key)) return cache.get(key);
  const root = postcss.parse(source);
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const selectors = selectorParser().astSync(rule.selector);
    selectors.nodes = selectors.nodes.filter(selector => matches(selector, tokens));
    if (!selectors.nodes.length) rule.remove();
    else rule.selector = selectors.toString();
  });
  root.walkComments(comment => comment.remove());
  function prune(node) {
    if (!node.nodes) return;
    [...node.nodes].forEach(prune);
    if (node.type !== 'root' && node.nodes.length === 0) node.remove();
  }
  prune(root);
  const css = root.toString().replace(/<\/style/gi, '<\\/style');
  if (cache.size >= 256) cache.delete(cache.keys().next().value);
  cache.set(key, css);
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
