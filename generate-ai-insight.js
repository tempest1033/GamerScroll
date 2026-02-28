#!/usr/bin/env node
/**
 * AI 인사이트 생성 스크립트
 * 별도로 실행하여 AI 인사이트 JSON 저장
 */

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { generateAIInsight } = require('./src/insights/ai-insight');
const { loadHistory, getYesterdayDate } = require('./src/insights/daily');
const { fetchStockPrices } = require('./src/crawlers/stocks');
const { fillInsightThumbnails, collectNewsItemsFromNewsData, collectHistoryNewsItems } = require('./src/insights/thumbnail-fill');

const CACHE_FILE = './data-cache.json';
const REPORTS_DIR = './reports';

/**
 * 최근 N개의 리포트에서 AI 인사이트 로드
 * @param {number} count - 로드할 리포트 개수
 * @returns {Array} AI 인사이트 배열
 */
function loadRecentInsights(count = 3) {
  const insights = [];

  if (!fs.existsSync(REPORTS_DIR)) {
    return insights;
  }

  // 리포트 파일 목록 가져오기 (날짜순 정렬)
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // 최신순

  for (const file of files) {
    if (insights.length >= count) break;

    try {
      const report = JSON.parse(fs.readFileSync(`${REPORTS_DIR}/${file}`, 'utf8'));
      if (report.ai) {
        insights.push(report.ai);
      }
    } catch (e) {
      // 파싱 실패 시 스킵
    }
  }

  return insights;
}

/**
 * reports/{date}.json에서 어제 순위 데이터 로드
 * @param {string} date - YYYY-MM-DD 형식
 * @returns {Object|null} rankings 데이터 또는 null
 */
function loadYesterdayRankingsFromReports(date) {
  const reportFile = `${REPORTS_DIR}/${date}.json`;

  if (!fs.existsSync(reportFile)) {
    return null;
  }

  console.log(`📂 reports 로드: ${reportFile}`);

  try {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    // reports의 mobile 구조를 rankings.grossing 구조로 변환
    if (report.mobile?.kr) {
      return {
        grossing: {
          kr: {
            ios: report.mobile.kr.ios || [],
            android: report.mobile.kr.android || []
          }
        }
      };
    }
    return null;
  } catch (e) {
    console.log(`  - ${reportFile} 로드 실패:`, e.message);
    return null;
  }
}

function getTodayDate() {
  const now = new Date();
  // KST (UTC+9) 기준
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kst.toISOString().split('T')[0];
}


/**
 * 순위 변동 데이터를 AI 인사이트용 형식으로 변환
 * @param {Object} todayRankings - 오늘 순위 데이터
 * @param {Object} yesterdayRankings - 어제 순위 데이터
 * @returns {Object} { up: [], down: [], new: [] }
 */
function buildRankingChanges(todayRankings, yesterdayRankings) {
  const up = [];
  const down = [];
  const newEntries = [];

  const platforms = [
    { key: 'ios', label: 'iOS' },
    { key: 'android', label: 'Android' }
  ];

  platforms.forEach(({ key, label }) => {
    const todayList = todayRankings?.grossing?.kr?.[key] || [];
    const yesterdayList = yesterdayRankings?.grossing?.kr?.[key] || [];

    // 어제 순위 맵 생성
    const yesterdayMap = {};
    yesterdayList.forEach((app, idx) => {
      yesterdayMap[app.title] = idx + 1;
    });

    // 오늘 순위와 비교 (TOP 200)
    todayList.slice(0, 200).forEach((app, idx) => {
      const rank = idx + 1;
      const prevRank = yesterdayMap[app.title];

      if (!prevRank) {
        // 신규 진입 (어제 TOP 50에 없었음)
        newEntries.push({
          title: app.title,
          platform: label,
          rank,
          developer: app.developer
        });
      } else {
        const change = prevRank - rank;
        if (change >= 5) {
          // 급상승 (5단계 이상)
          up.push({
            title: app.title,
            platform: label,
            prevRank,
            rank,
            change,
            developer: app.developer
          });
        } else if (change <= -5) {
          // 급하락 (5단계 이상)
          down.push({
            title: app.title,
            platform: label,
            prevRank,
            rank,
            change,
            developer: app.developer
          });
        }
      }
    });
  });

  // 변동폭 큰 순으로 정렬
  up.sort((a, b) => b.change - a.change);
  down.sort((a, b) => a.change - b.change);
  newEntries.sort((a, b) => a.rank - b.rank); // 높은 순위부터

  return { up, down, new: newEntries };
}

async function main() {
  console.log('🤖 AI 인사이트 생성 시작...\n');

  const forceMode = process.argv.includes('--force');

  // 이미 발행된 AI 인사이트가 있으면 스킵
  if (!forceMode) {
    const today = getTodayDate();
    const todayReportFile = `${REPORTS_DIR}/${today}.json`;
    if (fs.existsSync(todayReportFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(todayReportFile, 'utf8'));
        if (existing.ai && existing.aiGeneratedAt) {
          console.log(`✅ 오늘자 AI 인사이트가 이미 존재합니다 (${existing.aiGeneratedAt})`);
          console.log('   재생성하려면 --force 옵션을 사용하세요.');
          process.exit(0);
        }
      } catch (e) {
        // 파싱 실패 시 무시하고 계속 진행
      }
    }
  } else {
    console.log('⚡ --force 모드: 기존 인사이트 무시하고 재생성합니다.\n');
  }

  // 캐시 데이터 로드
  if (!fs.existsSync(CACHE_FILE)) {
    console.log('❌ 캐시 파일이 없습니다. 먼저 크롤링을 실행해주세요.');
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  console.log(`📂 캐시 로드 완료 (생성: ${cache.timestamp})\n`);

  const todayData = {
    news: cache.news,
    community: cache.community,
    rankings: cache.rankings,
    steam: cache.steam,
    youtube: cache.youtube,
    chzzk: cache.chzzk,
    upcoming: cache.upcoming
  };

  // 어제 데이터 로드 및 순위 변동 분석
  // 1. history/ 폴더에서 시도 (로컬 빌드용)
  // 2. reports/ 폴더에서 시도 (GitHub Actions용)
  const yesterday = getYesterdayDate();

  let yesterdayRankings = loadHistory(yesterday)?.rankings;

  if (!yesterdayRankings) {
    console.log('📂 history/ 없음 - reports/에서 어제 데이터 로드 시도...');
    yesterdayRankings = loadYesterdayRankingsFromReports(yesterday);
  }

  let rankingChanges = null;

  if (yesterdayRankings) {
    console.log(`📊 어제 데이터 로드 완료 (${yesterday}) - 순위 변동 분석 중...`);
    rankingChanges = buildRankingChanges(cache.rankings, yesterdayRankings);
    console.log(`  - 급상승: ${rankingChanges.up.length}개`);
    console.log(`  - 급하락: ${rankingChanges.down.length}개`);
    console.log(`  - 신규진입: ${rankingChanges.new.length}개\n`);
  } else {
    console.log(`⚠️ 어제 데이터 없음 (${yesterday}) - 순위 변동 분석 건너뜀\n`);
  }

  // 최근 7일 인사이트 로드 (반복 방지용 - 1주일간 블랙리스트)
  const recentInsights = loadRecentInsights(7);
  if (recentInsights.length > 0) {
    console.log(`📋 최근 ${recentInsights.length}개 인사이트 로드 완료 (1주일간 블랙리스트)\n`);
  }

  // AI 인사이트 생성 (순위 변동 데이터 + 최근 인사이트 포함)
  const aiInsight = await generateAIInsight(todayData, rankingChanges, recentInsights);

  if (!aiInsight) {
    console.log('❌ AI 인사이트 생성 실패');
    process.exit(1);
  }

  // 주말/공휴일이면 게임주 섹션 비우기 (전날 장이 안 열림)
  // 한국 공휴일 (매년 고정 + 변동 공휴일은 연초에 갱신)
  const KR_HOLIDAYS = [
    // 2026년
    '2026-01-01', '2026-01-28', '2026-01-29', '2026-01-30', // 신정, 설날 연휴
    '2026-03-01', // 삼일절
    '2026-05-05', '2026-05-24', // 어린이날, 부처님오신날
    '2026-06-06', // 현충일
    '2026-08-15', // 광복절
    '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-09', // 추석 연휴, 한글날
    '2026-12-25', // 크리스마스
    // 2027년 (필요 시 추가)
  ];
  const todayKST = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  const dayOfWeek = todayKST.getUTCDay(); // 0=일, 6=토
  const todayStr = todayKST.toISOString().split('T')[0];
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = KR_HOLIDAYS.includes(todayStr);
  if (isWeekend || isHoliday) {
    const reason = isWeekend ? `주말(${dayOfWeek === 0 ? '일' : '토'}요일)` : `공휴일(${todayStr})`;
    console.log(`\n📈 ${reason} → 게임주 현황 제외`);
    aiInsight.stocks = [];
  }

  // AI가 선정한 종목의 주가 데이터 가져오기
  let stockMap = {};
  let stockPrices = {};

  if (aiInsight.stocks && aiInsight.stocks.length > 0) {
    console.log('\n📈 게임주 주가 데이터 수집 중...');
    // 종목명에서 코드 추출: "엔씨소프트(036570)" 또는 "259960-크래프톤" 형태
    const stocksList = aiInsight.stocks.map(s => {
      const codeMatchParen = s.name.match(/\((\d{6})\)/);
      const codeMatchHyphen = s.name.match(/^(\d{6})-/);
      let displayName, code;
      if (codeMatchHyphen) {
        code = codeMatchHyphen[1];
        displayName = s.name.replace(/^\d{6}-/, '').trim();
      } else if (codeMatchParen) {
        code = codeMatchParen[1];
        displayName = s.name.replace(/\(\d{6}\)/, '').trim();
      } else {
        displayName = s.name.trim();
        code = null;
      }
      return { name: displayName, code, comment: s.comment };
    });

    const { stockMap: map, pricesMap } = await fetchStockPrices(axios, cheerio, stocksList);
    stockMap = map;

    // 코드로 주가 매핑
    stocksList.forEach(stock => {
      const code = stock.code || stockMap[stock.name];
      if (code && pricesMap[code]) {
        stockPrices[code] = pricesMap[code];
      }
    });

    console.log(`  - ${Object.keys(stockPrices).length}개 종목 주가 수집 완료`);
  }

  const today = getTodayDate();

  console.log('\n🖼️ AI 인사이트 썸네일 보강 중...');
  // 뉴스 썸네일 비활성화 — 웹 검색만 사용
  const thumbSummary = await fillInsightThumbnails(aiInsight, {
    newsItems: [],
    dateRange: { start: today, end: today }
  });
  console.log(`  - 썸네일 갱신: ${thumbSummary.updated}개, 유지: ${thumbSummary.kept}개, 실패: ${thumbSummary.failed}개`);

  // 저장
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const insightJsonFile = `${REPORTS_DIR}/${today}.json`;

  // 기존 인사이트 로드 (있으면)
  let insight = {};
  if (fs.existsSync(insightJsonFile)) {
    try {
      insight = JSON.parse(fs.readFileSync(insightJsonFile, 'utf8'));
    } catch (e) {
      console.warn(`⚠️ 기존 인사이트 파싱 실패 (${insightJsonFile}):`, e.message);
    }
  }

  // AI 인사이트 추가/갱신
  insight.ai = aiInsight;
  insight.aiGeneratedAt = new Date().toISOString();
  insight.stockMap = stockMap;
  insight.stockPrices = stockPrices;

  fs.writeFileSync(insightJsonFile, JSON.stringify(insight, null, 2), 'utf8');
  console.log(`\n✅ AI 인사이트 저장 완료: ${insightJsonFile}`);
}

main().catch(console.error);
