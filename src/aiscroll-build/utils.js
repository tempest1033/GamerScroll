/**
 * 빌드 스크립트 공통 유틸리티
 * - ensureDir: 디렉토리 생성
 * - collectHtmlFilesUnderDir: HTML 파일 재귀 수집
 * - externalizeDeferredJsonFromHtml: 인라인 JSON → 외부 파일 추출
 * - DEFERRED_JSON_SCRIPT_REGEX: DeferredData 스크립트 태그 매칭 정규식
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFERRED_JSON_SCRIPT_REGEX = /<script\s+type="application\/json"\s+id="([A-Za-z0-9_-]*DeferredData)"[^>]*>([\s\S]*?)<\/script>/g;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function collectHtmlFilesUnderDir(baseDir, list) {
  if (!fs.existsSync(baseDir)) return;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFilesUnderDir(fullPath, list);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      list.push(fullPath);
    }
  }
}

function externalizeDeferredJsonFromHtml(html, pageRelPath, feedAssetsDir) {
  if (typeof html !== 'string' || html.indexOf('DeferredData') === -1) return html;

  return html.replace(DEFERRED_JSON_SCRIPT_REGEX, (fullMatch, scriptId, payloadRaw) => {
    const payload = (payloadRaw || '').trim();
    if (!payload) return fullMatch;

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch (e) {
      return fullMatch;
    }
    if (!Array.isArray(parsed)) return fullMatch;

    const normalizedPayload = JSON.stringify(parsed).replace(/</g, '\\u003c');
    const hash = crypto.createHash('md5').update(normalizedPayload).digest('hex').slice(0, 12);
    const pageKey = (pageRelPath || 'index')
      .replace(/\\/g, '/')
      .replace(/^\.?\/+/, '')
      .replace(/\.html$/i, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'index';
    const fileName = `${pageKey}-${scriptId}-${hash}.json`;
    const filePath = path.join(feedAssetsDir, fileName);
    const feedUrl = `/assets/feed/${fileName}`;

    fs.writeFileSync(filePath, normalizedPayload, 'utf8');
    return `<script type="application/json" id="${scriptId}" data-src="${feedUrl}"></script>`;
  });
}

module.exports = {
  DEFERRED_JSON_SCRIPT_REGEX,
  ensureDir,
  collectHtmlFilesUnderDir,
  externalizeDeferredJsonFromHtml,
};
