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

const CACHE_FILE = './data-cache.json';
const REPORTS_DIR = './reports';

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
    console.log(`  - reports/${date}.json 로드 실패:`, e.message);
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

    // 오늘 순위와 비교 (TOP 100)
    todayList.slice(0, 100).forEach((app, idx) => {
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

  // AI 인사이트 생성 (순위 변동 데이터 포함)
  const aiInsight = await generateAIInsight(todayData, rankingChanges);

  if (!aiInsight) {
    console.log('❌ AI 인사이트 생성 실패');
    process.exit(1);
  }

  // AI가 선정한 종목의 주가 데이터 가져오기
  let stockMap = {};
  let stockPrices = {};

  if (aiInsight.stocks && aiInsight.stocks.length > 0) {
    console.log('\n📈 게임주 주가 데이터 수집 중...');
    // 종목명에서 코드 추출 (엔씨소프트(036570) 형태)
    const stocksList = aiInsight.stocks.map(s => {
      const codeMatch = s.name.match(/\((\d{6})\)/);
      const displayName = s.name.replace(/\(\d{6}\)/, '').trim();
      return { name: displayName, code: codeMatch ? codeMatch[1] : null, comment: s.comment };
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

  // 저장
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const today = getTodayDate();
  const insightJsonFile = `${REPORTS_DIR}/${today}.json`;

  // 기존 인사이트 로드 (있으면)
  let insight = {};
  if (fs.existsSync(insightJsonFile)) {
    try {
      insight = JSON.parse(fs.readFileSync(insightJsonFile, 'utf8'));
    } catch (e) {}
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
