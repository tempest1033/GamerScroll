'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 신뢰할 수 있는 공식 로고만 빌드 시 포함한다. 기사 입력으로 파일 경로를 받지 않는다.
const BRANDS = new Set(['paseo', 'orca', 'deepseek-harness']);
const icons = new Map();

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function brandIcon(brand) {
  if (!BRANDS.has(brand)) return '';
  if (!icons.has(brand)) {
    const svg = fs.readFileSync(path.join(__dirname, '../../../data/brand-icons', `${brand}.svg`));
    icons.set(brand, `data:image/svg+xml;base64,${svg.toString('base64')}`);
  }
  return `<span class="article-action-brand" aria-hidden="true"><img src="${icons.get(brand)}" width="24" height="24" alt=""></span>`;
}

function renderArticleAction(block) {
  if (block?.variant !== 'button') return '';
  let url;
  try { url = new URL(block.url); } catch { return ''; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
  const text = String(block.text ?? '').trim();
  if (!text) return '';
  return `<p class="article-action-row"><a class="article-action" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${brandIcon(block.brand)}<span class="article-action-label">${escape(text)}</span><svg class="article-action-external" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg></a></p>`;
}

module.exports = { renderArticleAction };
