/**
 * AI 인사이트 썸네일 보강 유틸
 * - 뉴스/히스토리 매칭 우선
 * - 부족하면 Firecrawl 검색 + Codex 선택
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

let FirecrawlClient = null;
try {
  ({ FirecrawlClient } = require('@mendable/firecrawl-js'));
} catch (e) {
  FirecrawlClient = null;
}

const NEWS_SOURCES = ['inven', 'ruliweb', 'gamemeca', 'thisisgame'];
const BLOCKED_THUMB_HOSTS = new Set([
  'yna.co.kr',
  'img.yna.co.kr'
]);

const PREFERRED_THUMB_HOSTS = new Set([]);

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'
]);

const DEFAULT_CODEX_MODEL = process.env.CODEX_THUMBNAIL_MODEL || 'gpt-5.4';
const DEFAULT_CODEX_REASONING = process.env.CODEX_THUMBNAIL_REASONING || 'xhigh';

const STOP_WORDS = new Set([
  '의', '가', '이', '은', '는', '을', '를', '에', '와', '과', '로', '으로', '에서', '까지', '부터', '처럼', '만', '도', '등', '및',
  '그', '저', '급', '위', '일', '월', '년',
  '주간', '지난주', '이번주', '오늘', '어제',
  '공개', '발표', '출시', '업데이트', '신작', '확정', '돌파', '화제', '논란', '전망', '진출', '확산', '가능', '예정', '시작', '종료',
  '인기', '상위권', '유지', '강화', '확인', '공식', '신규', '최신', '주목'
]);

function normalizeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function getHostname(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  if (!/^https?:\/\//i.test(normalized)) return null;
  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isBlockedThumb(url) {
  const host = getHostname(url);
  if (!host) return false;
  if (BLOCKED_THUMB_HOSTS.has(host)) return true;
  if (host.endsWith('.yna.co.kr')) return true;
  return false;
}

function isPreferredHost(url) {
  const host = getHostname(url);
  if (!host) return false;
  return PREFERRED_THUMB_HOSTS.has(host);
}

function isLikelyImageUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  if (!/^https?:\/\//i.test(normalized)) return false;
  try {
    const ext = path.extname(new URL(normalized).pathname.toLowerCase());
    return IMAGE_EXTS.has(ext);
  } catch {
    return false;
  }
}

function collectNewsItemsFromNewsData(news, group = 'news') {
  const items = [];
  if (!news || typeof news !== 'object') return items;

  for (const source of NEWS_SOURCES) {
    const list = Array.isArray(news[source]) ? news[source] : [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const thumbnail = normalizeUrl(item.thumbnail);
      if (!title || !thumbnail) continue;
      items.push({
        title,
        thumbnail,
        link: normalizeUrl(item.link),
        source,
        group
      });
    }
  }

  return items;
}

function collectHistoryNewsItems(dates, historyDir = './history') {
  const items = [];
  if (!Array.isArray(dates) || dates.length === 0) return items;

  for (const date of dates) {
    const filePath = path.join(historyDir, `${date}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const data = JSON.parse(raw);
      items.push(...collectNewsItemsFromNewsData(data?.news, `history:${date}`));
    } catch {
      // skip
    }
  }

  return items;
}

function toDateUTC(ymd) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function formatDateUTC(d) {
  return d.toISOString().slice(0, 10);
}

function iterateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const start = toDateUTC(startDate);
  const end = toDateUTC(endDate);
  const dates = [];

  for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    dates.push(formatDateUTC(cur));
  }

  return dates;
}

function extractKeywords(text) {
  if (typeof text !== 'string') return [];
  const clean = text.replace(/[^0-9A-Za-z가-힣\s]/g, ' ');
  const words = clean.split(/\s+/).map(w => w.trim()).filter(Boolean);

  const result = [];
  const seen = new Set();

  for (const word of words) {
    if (word.length < 2) continue;
    if (STOP_WORDS.has(word)) continue;
    if (/^\d+$/.test(word)) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }

  return result;
}

function computeMatchScore(itemTitle, candidateTitle) {
  const tokens = extractKeywords(itemTitle);
  if (tokens.length === 0) return { score: 0, matchedCount: 0, tokens };
  const hay = (candidateTitle || '').toLowerCase();

  let score = 0;
  let matchedCount = 0;
  for (const token of tokens) {
    if (hay.includes(token.toLowerCase())) {
      matchedCount += 1;
      score += token.length;
    }
  }

  return { score, matchedCount, tokens };
}

function buildNewsCandidates(title, newsItems, limit = 8, options = {}) {
  const candidates = [];
  const tokens = extractKeywords(title);
  const core = tokens.slice(0, 2).map(t => t.toLowerCase());
  const gameName = options.gameName ? options.gameName.toLowerCase() : null;
  const usedUrls = options.usedUrls || new Set();

  for (const item of newsItems) {
    const thumb = normalizeUrl(item.thumbnail);
    if (!thumb || isBlockedThumb(thumb)) continue;
    // 이미 사용된 URL 제외
    if (usedUrls.has(thumb)) continue;

    const { score, matchedCount } = computeMatchScore(title, item.title);
    if (score === 0) continue;

    const itemTitleLower = (item.title || '').toLowerCase();
    const strict = core.length
      ? core.every(t => itemTitleLower.includes(t))
      : false;

    // 게임명 정확 매칭 여부 (gameName이 있으면 해당 게임명이 뉴스 제목에 포함되어야 함)
    const gameNameMatch = gameName ? itemTitleLower.includes(gameName) : true;

    // 게임명이 불일치하면 점수 대폭 감소
    const adjustedScore = gameNameMatch ? score : Math.floor(score * 0.3);

    candidates.push({
      url: thumb,
      title: item.title,
      sourceUrl: item.link || '',
      source: `news:${item.source}`,
      group: item.group || 'news',
      score: adjustedScore,
      matchedCount,
      strict: strict && gameNameMatch,
      gameNameMatch,
      isImageUrl: isLikelyImageUrl(thumb)
    });
  }

  return rankCandidates(candidates).slice(0, limit);
}

function getGroupPriority(group) {
  if (!group) return 0;
  const key = String(group).split(':')[0];
  if (key === 'cache') return 4;
  if (key === 'history') return 3;
  if (key === 'report') return 2;
  if (key === 'search') return 1;
  return 0;
}

function rankCandidates(candidates) {
  return candidates.sort((a, b) => {
    if (a.strict !== b.strict) return a.strict ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    const ap = getGroupPriority(a.group);
    const bp = getGroupPriority(b.group);
    if (ap !== bp) return bp - ap;
    const ah = isPreferredHost(a.url);
    const bh = isPreferredHost(b.url);
    if (ah !== bh) return ah ? -1 : 1;
    return 0;
  });
}

function dedupeCandidates(candidates) {
  const map = new Map();
  for (const cand of candidates) {
    const key = normalizeUrl(cand.url);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, cand);
      continue;
    }
    const ranked = rankCandidates([existing, cand]);
    map.set(key, ranked[0]);
  }

  return [...map.values()];
}

const validationCache = new Map();

async function validateImageUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  if (validationCache.has(normalized)) return validationCache.get(normalized);
  if (!/^https?:\/\//i.test(normalized)) {
    validationCache.set(normalized, false);
    return false;
  }
  if (isBlockedThumb(normalized)) {
    validationCache.set(normalized, false);
    return false;
  }

  const okHead = await checkImageHead(normalized);
  if (okHead) {
    validationCache.set(normalized, true);
    return true;
  }

  const okGet = await checkImageGet(normalized);
  validationCache.set(normalized, okGet);
  return okGet;
}

async function checkImageHead(url) {
  try {
    const res = await axios.head(url, {
      timeout: 6000,
      maxRedirects: 3,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const contentType = String(res.headers['content-type'] || '').toLowerCase();
    if (contentType.startsWith('image/')) return true;
    if (!contentType && isLikelyImageUrl(url)) return true;
    return false;
  } catch {
    return false;
  }
}

async function checkImageGet(url) {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 3,
      responseType: 'arraybuffer',
      maxContentLength: 1024 * 1024,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: {
        Range: 'bytes=0-512',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const contentType = String(res.headers['content-type'] || '').toLowerCase();
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}

const searchCache = new Map();

async function searchWebCandidates(query, firecrawl, limit = 6) {
  const cacheKey = query.trim();
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
  if (!firecrawl) return [];

  const candidates = [];
  const pageCandidates = [];

  try {
    const result = await firecrawl.search(query, {
      sources: ['news', 'web', 'images'],
      limit: Math.max(limit, 6),
      timeout: 20000
    });

    const newsResults = Array.isArray(result?.news) ? result.news : [];
    for (const item of newsResults) {
      const imageUrl = normalizeUrl(item.imageUrl);
      if (imageUrl && !isBlockedThumb(imageUrl)) {
        candidates.push({
          url: imageUrl,
          title: item.title || '',
          sourceUrl: item.url || '',
          source: 'search:news',
          group: 'search:news',
          score: 0,
          matchedCount: 0,
          strict: false,
          isImageUrl: isLikelyImageUrl(imageUrl)
        });
      } else if (item.url) {
        pageCandidates.push(item.url);
      }
    }

    const imageResults = Array.isArray(result?.images) ? result.images : [];
    for (const item of imageResults) {
      const imageUrl = normalizeUrl(item.imageUrl);
      if (!imageUrl || isBlockedThumb(imageUrl)) continue;
      candidates.push({
        url: imageUrl,
        title: item.title || '',
        sourceUrl: item.url || '',
        source: 'search:images',
        group: 'search:images',
        score: 0,
        matchedCount: 0,
        strict: false,
        isImageUrl: isLikelyImageUrl(imageUrl)
      });
    }

    const webResults = Array.isArray(result?.web) ? result.web : [];
    for (const item of webResults) {
      const pageUrl = normalizeUrl(item.url);
      if (!pageUrl) continue;
      if (isLikelyImageUrl(pageUrl)) {
        candidates.push({
          url: pageUrl,
          title: item.title || '',
          sourceUrl: pageUrl,
          source: 'search:web',
          group: 'search:web',
          score: 0,
          matchedCount: 0,
          strict: false,
          isImageUrl: true
        });
      } else {
        pageCandidates.push(pageUrl);
      }
    }
  } catch {
    searchCache.set(cacheKey, []);
    return [];
  }

  const uniquePages = [...new Set(pageCandidates)].slice(0, 3);
  for (const pageUrl of uniquePages) {
    const ogImage = await fetchOgImage(pageUrl, firecrawl);
    if (!ogImage || isBlockedThumb(ogImage)) continue;
    candidates.push({
      url: ogImage,
      title: '',
      sourceUrl: pageUrl,
      source: 'search:web-og',
      group: 'search:web',
      score: 0,
      matchedCount: 0,
      strict: false,
      isImageUrl: isLikelyImageUrl(ogImage)
    });
  }

  const deduped = dedupeCandidates(candidates).slice(0, limit);
  searchCache.set(cacheKey, deduped);
  return deduped;
}

async function fetchOgImage(url, firecrawl) {
  if (!firecrawl) return null;
  try {
    const result = await firecrawl.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
      maxAge: 86400000
    });
    const metadata = result?.metadata || {};
    const ogImage = normalizeUrl(metadata.ogImage);
    if (ogImage) return ogImage;
    const images = Array.isArray(result?.images) ? result.images : [];
    if (images.length > 0) return normalizeUrl(images[0]);
  } catch {
    return null;
  }
  return null;
}

function collectThumbnailEntries(root) {
  const entries = [];
  if (!root || typeof root !== 'object') return entries;

  function walk(node, pathLabel) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'thumbnail') {
        entries.push({
          path: `${pathLabel}.thumbnail`,
          owner: node,
          get: () => node.thumbnail,
          set: (v) => { node.thumbnail = v; }
        });
        continue;
      }
      if (value && typeof value === 'object') {
        walk(value, `${pathLabel}.${key}`);
      }
    }
  }

  walk(root, 'ai');
  return entries;
}

function getEntrySection(pathLabel) {
  if (pathLabel === 'ai.thumbnail') return 'headline';
  const match = pathLabel.match(/^ai\.([^\.\[]+)/);
  return match ? match[1] : 'ai';
}

function getEntryContext(entry, root) {
  const owner = entry.owner || {};
  const section = getEntrySection(entry.path);
  const title = typeof owner.title === 'string' ? owner.title.trim() : '';
  const name = typeof owner.name === 'string' ? owner.name.trim() : '';
  const headline = typeof root.headline === 'string' ? root.headline.trim() : '';

  return {
    section,
    title: title || (entry.path === 'ai.thumbnail' ? headline : ''),
    name,
    tag: typeof owner.tag === 'string' ? owner.tag.trim() : '',
    desc: typeof owner.desc === 'string' ? owner.desc.trim() : '',
    comment: typeof owner.comment === 'string' ? owner.comment.trim() : '',
    headline
  };
}

function buildSearchQuery(context) {
  const parts = [];
  const base = context.title || context.name || context.headline || '';
  if (base) parts.push(base);
  if (context.tag && !base.includes(context.tag)) parts.push(context.tag);

  const lower = base.toLowerCase();
  const hasGameKeyword = /게임|e스포츠|콘솔|모바일|pc|스팀|닌텐도|플레이스테이션|xbox/i.test(lower);
  if (!hasGameKeyword) parts.push('게임');

  if (context.section === 'stocks') {
    parts.push('게임주', '로고');
  }

  return parts.join(' ').trim();
}

function buildCodexPrompt(context, candidates, options) {
  const rangeText = options?.dateRange?.start && options?.dateRange?.end
    ? `- 기간: ${options.dateRange.start} ~ ${options.dateRange.end}\n`
    : '';

  const list = candidates.map((cand, idx) => {
    return `#${idx + 1}
- url: ${cand.url}
- title: ${cand.title || ''}
- source: ${cand.source || ''}
- sourceUrl: ${cand.sourceUrl || ''}
- strict: ${cand.strict ? 'yes' : 'no'}
- gameNameMatch: ${cand.gameNameMatch === false ? 'no' : 'yes'}
- score: ${cand.score || 0}`;
  }).join('\n\n');

  return `당신은 게임 업계 인사이트 썸네일을 고르는 담당자입니다.

[대상 정보]
- 섹션: ${context.section}
- 제목: ${context.title || context.name || context.headline}
- 태그: ${context.tag || ''}
- 설명: ${context.desc || context.comment || ''}
${rangeText}
[규칙]
- 후보 중에서 가장 관련성이 높은 이미지 URL 1개를 선택하세요.
- 반드시 이미지 URL이어야 합니다 (HTML 페이지 URL 선택 금지).
- 아래 도메인은 선택 금지: ${[...BLOCKED_THUMB_HOSTS].join(', ')}
- **gameNameMatch가 yes인 후보를 강하게 우선합니다.**
- **strict가 yes이고 gameNameMatch가 yes인 후보가 가장 좋습니다.**
- 제목 키워드와 가장 잘 매칭되는 후보를 우선합니다.
- 적절한 후보가 없으면 null을 선택합니다.

[후보 목록]
${list}

[출력 형식] (JSON만 출력)
{ "selectedUrl": "..." }
또는
{ "selectedUrl": null }
`;
}

function extractJson(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start == -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] == '{') depth++;
    else if (text[i] == '}') {
      depth--;
      if (depth == 0) {
        const raw = text.slice(start, i + 1);
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function runCodexSelect(prompt, options) {
  const model = options?.model || DEFAULT_CODEX_MODEL;
  const reasoning = options?.reasoning || DEFAULT_CODEX_REASONING;

  const tmpFile = path.join(os.tmpdir(), `codex-thumb-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(tmpFile, prompt, 'utf8');

  try {
    const baseCmd = `cat "${tmpFile}" | codex exec -m ${model} -c model_reasoning_effort=${reasoning} -c hide_agent_reasoning=true`;
    const commands = [
      `${baseCmd} --output-last-message -`,
      `${baseCmd} -`
    ];

    for (const cmd of commands) {
      try {
        const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 600000 });
        const parsed = extractJson(result);
        if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'selectedUrl')) {
          return parsed.selectedUrl || null;
        }
      } catch {
        // fallback to next command
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

async function pickBestThumbnail(entry, root, candidates, options) {
  const ranked = rankCandidates(dedupeCandidates(candidates));
  if (ranked.length === 0) return null;

  const usedUrls = options?.usedUrls || new Set();
  const useCodex = options?.disableCodex ? false : true;

  if (useCodex) {
    const context = getEntryContext(entry, root);
    const prompt = buildCodexPrompt(context, ranked, options);
    const selected = runCodexSelect(prompt, options);
    const normalized = normalizeUrl(selected);
    // Codex가 선택한 URL이 이미 사용 중이면 다음 후보 선택
    if (normalized && !usedUrls.has(normalized)) {
      return normalized;
    }
  }

  // Codex 실패 또는 중복일 경우 첫 번째 미사용 후보 선택
  for (const cand of ranked) {
    const url = normalizeUrl(cand.url);
    if (url && !usedUrls.has(url)) {
      return url;
    }
  }

  return null;
}

async function fillInsightThumbnails(ai, options = {}) {
  const summary = {
    total: 0,
    updated: 0,
    kept: 0,
    failed: 0,
    cleared: 0
  };

  if (!ai || typeof ai !== 'object') return summary;

  const entries = collectThumbnailEntries(ai);
  summary.total = entries.length;

  const newsItems = Array.isArray(options.newsItems) ? options.newsItems : [];
  const firecrawlApiKey = options.firecrawlApiKey || process.env.FIRECRAWL_API_KEY || '';
  const firecrawl = firecrawlApiKey && FirecrawlClient ? new FirecrawlClient({ apiKey: firecrawlApiKey }) : null;

  // 이미 선택된 URL 추적 (중복 방지)
  const usedUrls = new Set();

  for (const entry of entries) {
    const currentRaw = entry.get();
    if (currentRaw === '') {
      entry.set(null);
      summary.cleared += 1;
    }

    const current = normalizeUrl(entry.get());
    const hadCurrent = !!current;
    if (current && !isBlockedThumb(current)) {
      const isValid = await validateImageUrl(current);
      if (isValid) {
        // 유지되는 URL도 usedUrls에 추가
        usedUrls.add(current);
        summary.kept += 1;
        continue;
      }
    }

    const context = getEntryContext(entry, ai);
    const title = context.title || context.name || context.headline;
    if (!title) {
      if (hadCurrent) entry.set(null);
      summary.failed += 1;
      continue;
    }

    // gameName 추출 (metrics, rankings 등에서 사용)
    const owner = entry.owner || {};
    const gameName = owner.gameName || owner.name || null;

    const candidates = [];

    // 항상 웹 이미지 검색 먼저 실행 (게임별 개별 이미지 확보)
    const query = buildSearchQuery(context);
    if (query) {
      const searched = await searchWebCandidates(query, firecrawl, 8);
      for (const cand of searched) {
        if (usedUrls.has(normalizeUrl(cand.url))) continue;
        const { score, matchedCount } = computeMatchScore(title, cand.title || '');
        candidates.push({
          ...cand,
          score: cand.score || score,
          matchedCount: cand.matchedCount || matchedCount
        });
      }
    }

    // 뉴스 데이터 후보 비활성화 — 웹 검색만 사용
    // candidates.push(...buildNewsCandidates(title, newsItems, 8, { gameName, usedUrls }));

    // 이미 사용된 URL 필터링
    const filtered = candidates.filter(cand => !usedUrls.has(normalizeUrl(cand.url)));
    const ranked = rankCandidates(dedupeCandidates(filtered));
    if (ranked.length === 0) {
      if (hadCurrent) entry.set(null);
      summary.failed += 1;
      continue;
    }

    const selected = await pickBestThumbnail(entry, ai, ranked, { ...options, usedUrls });
    if (!selected) {
      if (hadCurrent) entry.set(null);
      summary.failed += 1;
      continue;
    }

    const valid = await validateImageUrl(selected);
    if (!valid) {
      const fallback = await findFirstValidCandidate(ranked, selected, usedUrls);
      if (!fallback) {
        if (hadCurrent) entry.set(null);
        summary.failed += 1;
        continue;
      }
      entry.set(fallback);
      usedUrls.add(fallback);
      summary.updated += 1;
      continue;
    }

    entry.set(selected);
    usedUrls.add(selected);
    summary.updated += 1;
  }

  return summary;
}

async function findFirstValidCandidate(candidates, excludeUrl, usedUrls = new Set()) {
  const exclude = normalizeUrl(excludeUrl);
  for (const cand of candidates) {
    const url = normalizeUrl(cand.url);
    if (!url || url === exclude) continue;
    // 이미 사용된 URL 제외
    if (usedUrls.has(url)) continue;
    const ok = await validateImageUrl(url);
    if (ok) return url;
  }
  return null;
}

module.exports = {
  fillInsightThumbnails,
  collectNewsItemsFromNewsData,
  collectHistoryNewsItems,
  iterateDateRange
};
