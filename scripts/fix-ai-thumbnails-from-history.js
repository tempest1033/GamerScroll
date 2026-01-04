#!/usr/bin/env node
/**
 * AI 인사이트(일간/주간) JSON의 thumbnail을 history 뉴스 썸네일 기준으로 정리합니다.
 *
 * 적용 규칙 (ai-insight.js / weekly-ai-insight.js의 "썸네일 선택 규칙" 반영):
 * - 뉴스 DB(history)에서 '확실히 일치'하는 썸네일이 있으면 우선 적용
 * - '확실히 일치'는 기본적으로 타이틀의 핵심 키워드(상위 2개 토큰)가 뉴스 제목에 모두 포함되는 경우
 * - 느슨한 매칭(2개 이상 토큰 매칭)은 안전 모드에서 '현재 썸네일이 뉴스 도메인이 아닐 때'만 교체
 *
 * 사용법:
 * - 미리보기(파일 미수정): node scripts/fix-ai-thumbnails-from-history.js
 * - 실제 적용:          node scripts/fix-ai-thumbnails-from-history.js --apply
 * - 공격적 적용:        node scripts/fix-ai-thumbnails-from-history.js --apply --aggressive
 */

const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply') || args.has('--write');
const isAggressive = args.has('--aggressive');
const isVerbose = args.has('--verbose');
const isStrictOnly = args.has('--strict-only');
const includeDocs = args.has('--include-docs');

const PROJECT_ROOT = path.resolve(__dirname, '..'); // GamersCrawl/
const HISTORY_DIR = path.join(PROJECT_ROOT, 'history');

const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');
const WEEKLY_REPORTS_DIR = path.join(REPORTS_DIR, 'weekly');

const DOCS_REPORTS_DIR = path.join(PROJECT_ROOT, 'docs', 'reports');
const DOCS_WEEKLY_REPORTS_DIR = path.join(DOCS_REPORTS_DIR, 'weekly');

const NEWS_SOURCES = ['inven', 'ruliweb', 'gamemeca', 'thisisgame'];
const NEWS_DOMAINS = new Set([
  'static.inven.co.kr',
  'img.ruliweb.com',
  'cdn.gamemeca.com',
  'www.thisisgame.com',
  'thisisgame.com'
]);

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

function getDomain(url) {
  const u = normalizeUrl(url);
  if (!u) return null;
  if (!u.startsWith('http://') && !u.startsWith('https://')) return null;
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isProbablyHtmlPageUrl(url) {
  const u = normalizeUrl(url);
  if (!u) return false;
  return (
    u.includes('inven.co.kr/webzine/news/?news=') ||
    u.includes('bbs.ruliweb.com/news/read/') ||
    u.includes('www.gamemeca.com/view.php') ||
    u.includes('thisisgame.com/webzine/news/') ||
    u.endsWith('.html')
  );
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

function computeMatchScore(itemTitle, newsTitle) {
  const tokens = extractKeywords(itemTitle);
  if (tokens.length === 0) return { score: 0, matchedCount: 0, tokens };
  const hay = (newsTitle || '').toLowerCase();

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

function findBestNewsThumbnail(itemTitle, newsItems) {
  const tokens = extractKeywords(itemTitle);
  if (tokens.length === 0) return null;

  const core = tokens.slice(0, 2);
  const coreLower = core.map(t => t.toLowerCase());

  const strictCandidates = coreLower.length
    ? newsItems.filter(n => coreLower.every(t => (n.title || '').toLowerCase().includes(t)))
    : [];

  const candidates = strictCandidates.length ? strictCandidates : newsItems;

  let best = null;
  let bestScore = 0;
  let bestMatchedCount = 0;

  for (const n of candidates) {
    const newsTitle = n.title || '';
    const { score, matchedCount } = computeMatchScore(itemTitle, newsTitle);

    if (!strictCandidates.length) {
      if (matchedCount < 2) continue;
    }

    if (score > bestScore) {
      best = n;
      bestScore = score;
      bestMatchedCount = matchedCount;
    }
  }

  if (!best) return null;

  return {
    strict: strictCandidates.length > 0,
    score: bestScore,
    matchedCount: bestMatchedCount,
    core,
    newsTitle: best.title || '',
    thumbnail: best.thumbnail || null
  };
}

function loadHistoryNews(date) {
  const historyPath = path.join(HISTORY_DIR, `${date}.json`);
  if (!fs.existsSync(historyPath)) return [];

  try {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    const news = history?.news || {};

    const items = [];
    for (const source of NEWS_SOURCES) {
      const arr = Array.isArray(news[source]) ? news[source] : [];
      for (const n of arr) {
        if (!n || typeof n !== 'object') continue;
        if (!n.title || !n.thumbnail) continue;
        items.push({ title: String(n.title), thumbnail: String(n.thumbnail) });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function toDateUTC(ymd) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function formatDateUTC(d) {
  return d.toISOString().slice(0, 10);
}

function iterateDateRange(startDate, endDate) {
  const start = toDateUTC(startDate);
  const end = toDateUTC(endDate);
  const dates = [];

  for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    dates.push(formatDateUTC(cur));
  }

  return dates;
}

function getAiItemsWithThumbnails(ai, sections) {
  const items = [];
  if (!ai || typeof ai !== 'object') return items;

  // ai.thumbnail (headline 기준)
  if (Object.prototype.hasOwnProperty.call(ai, 'thumbnail')) {
    items.push({
      path: 'ai.thumbnail',
      title: typeof ai.headline === 'string' ? ai.headline : '',
      get: () => ai.thumbnail,
      set: (v) => { ai.thumbnail = v; }
    });
  }

  for (const section of sections) {
    const arr = ai[section];
    if (!Array.isArray(arr)) continue;

    for (let idx = 0; idx < arr.length; idx++) {
      const obj = arr[idx];
      if (!obj || typeof obj !== 'object') continue;
      if (!Object.prototype.hasOwnProperty.call(obj, 'thumbnail')) continue;
      items.push({
        path: `ai.${section}[${idx}].thumbnail`,
        title: typeof obj.title === 'string' ? obj.title : '',
        get: () => obj.thumbnail,
        set: (v) => { obj.thumbnail = v; }
      });
    }
  }

  return items;
}

function applyFixesToFile(filePath, date, options) {
  const { newsItems, sections, label } = options;
  const changes = [];

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { label, filePath, date, updated: false, error: `JSON 파싱 실패: ${e.message}`, changes };
  }

  const ai = data.ai;
  if (!ai || typeof ai !== 'object') {
    return { label, filePath, date, updated: false, error: 'ai 없음', changes };
  }

  const items = getAiItemsWithThumbnails(ai, sections);

  for (const item of items) {
    const title = item.title;
    if (!title) continue;

    const oldRaw = item.get();
    const oldNormalized = normalizeUrl(oldRaw);
    const oldDomain = getDomain(oldRaw);
    const oldIsNewsDomain = oldDomain ? NEWS_DOMAINS.has(oldDomain) : false;

    // 빈 문자열은 null로 통일
    if (oldRaw === '') {
      item.set(null);
      changes.push({
        path: item.path,
        title,
        old: oldRaw,
        next: null,
        reason: '빈 문자열 -> null'
      });
    }

    const best = findBestNewsThumbnail(title, newsItems);
    if (!best || !best.thumbnail) continue;
    if (isStrictOnly && !best.strict) continue;

    const nextNormalized = normalizeUrl(best.thumbnail);
    if (!nextNormalized) continue;

    const shouldForceReplace = isProbablyHtmlPageUrl(oldRaw);

    let shouldReplace = false;
    if (best.strict) {
      shouldReplace = true;
    } else if (isAggressive) {
      shouldReplace = true;
    } else if (shouldForceReplace) {
      shouldReplace = true;
    } else if (!oldNormalized) {
      shouldReplace = true;
    } else if (!oldIsNewsDomain) {
      shouldReplace = true;
    }

    if (!shouldReplace) continue;

    if (oldNormalized === nextNormalized) continue;

    item.set(best.thumbnail);
    changes.push({
      path: item.path,
      title,
      old: oldRaw,
      next: best.thumbnail,
      match: {
        strict: best.strict,
        score: best.score,
        matchedCount: best.matchedCount,
        core: best.core,
        newsTitle: best.newsTitle
      }
    });
  }

  if (!changes.length) {
    return { label, filePath, date, updated: false, changes };
  }

  if (shouldApply) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  return { label, filePath, date, updated: shouldApply, changes };
}

function listDailyReportFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => path.join(dir, f))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function listWeeklyReportFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d{4}-W\d{2}\.json$/.test(f))
    .map(f => path.join(dir, f))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function runDaily(dir, label) {
  const files = listDailyReportFiles(dir);
  const results = [];

  for (const filePath of files) {
    const date = path.basename(filePath).replace('.json', '');
    const newsItems = loadHistoryNews(date);
    results.push(applyFixesToFile(filePath, date, {
      newsItems,
      sections: ['issues', 'industryIssues', 'metrics'],
      label
    }));
  }

  return results;
}

function runWeekly(dir, label) {
  const files = listWeeklyReportFiles(dir);
  const results = [];

  for (const filePath of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      results.push({ label, filePath, date: null, updated: false, error: `JSON 파싱 실패: ${e.message}`, changes: [] });
      continue;
    }

    const weekInfo = data.weekInfo || {};
    const startDate = weekInfo.startDate;
    const endDate = weekInfo.endDate;
    if (!startDate || !endDate) {
      results.push({ label, filePath, date: null, updated: false, error: 'weekInfo.startDate/endDate 없음', changes: [] });
      continue;
    }

    const dates = iterateDateRange(startDate, endDate);
    const newsItems = [];
    for (const d of dates) {
      newsItems.push(...loadHistoryNews(d));
    }

    results.push(applyFixesToFile(filePath, path.basename(filePath), {
      newsItems,
      sections: ['issues', 'industryIssues', 'metrics', 'global'],
      label
    }));
  }

  return results;
}

function summarize(results) {
  const summary = {
    filesScanned: results.length,
    filesWithChanges: 0,
    totalChanges: 0,
    strictChanges: 0,
    looseChanges: 0,
    emptyToNull: 0,
    errors: 0
  };

  for (const r of results) {
    if (r.error) summary.errors += 1;
    if (!r.changes || r.changes.length === 0) continue;
    summary.filesWithChanges += 1;
    summary.totalChanges += r.changes.length;
    for (const c of r.changes) {
      if (c.reason === '빈 문자열 -> null') {
        summary.emptyToNull += 1;
        continue;
      }
      if (c.match?.strict) summary.strictChanges += 1;
      else summary.looseChanges += 1;
    }
  }

  return summary;
}

function writeReport(allResults) {
  const reportDir = path.resolve(__dirname, '..', '..', 'tmp');
  try {
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  } catch {
    // ignore
  }

  const fileName = `gamerscrawl-thumbnail-fix-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(reportDir, fileName);

  try {
    fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2), 'utf8');
    return reportPath;
  } catch {
    return null;
  }
}

function main() {
  console.log(`🖼️ 썸네일 전수 점검 시작 (apply=${shouldApply}, aggressive=${isAggressive}, strictOnly=${isStrictOnly}, includeDocs=${includeDocs})`);

  const results = [];

  // 1) 소스 reports
  results.push(...runDaily(REPORTS_DIR, 'reports'));
  results.push(...runWeekly(WEEKLY_REPORTS_DIR, 'reports/weekly'));

  // 2) 배포 docs/reports (GitHub Pages) - 기본은 제외 (GamersCrawl/CLAUDE.md 참고)
  if (includeDocs) {
    results.push(...runDaily(DOCS_REPORTS_DIR, 'docs/reports'));
    results.push(...runWeekly(DOCS_WEEKLY_REPORTS_DIR, 'docs/reports/weekly'));
  }

  const summary = summarize(results);
  const reportPath = writeReport(results);

  console.log('\n=== 요약 ===');
  console.log(`- 스캔 파일: ${summary.filesScanned}개`);
  console.log(`- 변경 파일: ${summary.filesWithChanges}개`);
  console.log(`- 변경 항목: ${summary.totalChanges}개 (strict=${summary.strictChanges}, loose=${summary.looseChanges}, empty->null=${summary.emptyToNull})`);
  console.log(`- 오류: ${summary.errors}개`);
  if (reportPath) console.log(`- 상세 리포트: ${reportPath}`);

  if (isVerbose) {
    const preview = results
      .filter(r => r.changes && r.changes.length)
      .flatMap(r => r.changes.map(c => ({ file: r.filePath, ...c })))
      .slice(0, 30);
    console.log('\n=== 변경 예시(최대 30개) ===');
    for (const c of preview) {
      console.log(`- ${c.file} | ${c.path}`);
      console.log(`  title: ${c.title}`);
      console.log(`  old:   ${c.old}`);
      console.log(`  next:  ${c.next}`);
      if (c.match) console.log(`  match: strict=${c.match.strict} score=${c.match.score} newsTitle=${c.match.newsTitle}`);
    }
  }

  if (!shouldApply) {
    console.log('\n(미리보기 모드) 실제 적용은 --apply 옵션으로 실행하세요.');
  }
}

main();
