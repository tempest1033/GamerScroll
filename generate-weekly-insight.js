#!/usr/bin/env node
/**
 * 주간 AI 인사이트 생성 스크립트
 * 매주 월요일 0시(KST) 기준으로 지난주 핫이슈를 요약합니다.
 *
 * 사용법:
 *   node generate-weekly-insight.js          # 지난주 리포트 생성
 *   node generate-weekly-insight.js --force  # 강제 재생성
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateWeeklyAIInsight } = require('./src/insights/weekly-ai-insight');

const REPORTS_DIR = './reports';
const WEEKLY_REPORTS_DIR = './reports/weekly';

/**
 * 전주 주간 리포트 로드 (반복 방지용)
 * @param {Object} currentWeekInfo - 현재 주차 정보
 * @returns {Object|null} 전주 리포트
 */
function loadPreviousWeeklyReport(currentWeekInfo) {
  const year = currentWeekInfo.startDate.substring(0, 4);
  const prevWeekNumber = currentWeekInfo.weekNumber - 1;

  if (prevWeekNumber < 1) {
    // 연도가 바뀌는 경우는 일단 스킵
    return null;
  }

  const fileName = `${WEEKLY_REPORTS_DIR}/${year}-W${String(prevWeekNumber).padStart(2, '0')}.json`;

  if (!fs.existsSync(fileName)) {
    return null;
  }

  try {
    const report = JSON.parse(fs.readFileSync(fileName, 'utf8'));
    return report.ai || null;
  } catch (e) {
    return null;
  }
}

/**
 * KST 기준 현재 날짜 반환
 * @returns {Date} KST 날짜
 */
function getKSTDate() {
  const now = new Date();
  return new Date(now.getTime() + (9 * 60 * 60 * 1000));
}

/**
 * YYYY-MM-DD 형식으로 변환
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * 지난 주 월~일 날짜 범위 계산
 * @returns {Object} { startDate, endDate, weekNumber, dates }
 */
function getLastWeekInfo() {
  const kst = getKSTDate();

  // 오늘이 월요일이면 지난주 월요일은 7일 전
  // 오늘이 화요일이면 지난주 월요일은 8일 전
  // ...
  const dayOfWeek = kst.getUTCDay(); // 0=일, 1=월, ...
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const daysToLastWeekMonday = daysToLastMonday + 7;

  const lastMonday = new Date(kst);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - daysToLastWeekMonday);
  lastMonday.setUTCHours(0, 0, 0, 0);

  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() + 6);

  // 주차 계산 (연도 기준)
  const startOfYear = new Date(lastMonday.getUTCFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((lastMonday - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7
  );

  // 해당 주의 모든 날짜 배열
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lastMonday);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(formatDate(d));
  }

  return {
    startDate: formatDate(lastMonday),
    endDate: formatDate(lastSunday),
    weekNumber,
    dates
  };
}

/**
 * 특정 날짜의 일일 리포트 로드
 * @param {string} date - YYYY-MM-DD 형식
 * @returns {Object|null} 리포트 데이터
 */
function loadDailyReport(date) {
  // PM 우선, 없으면 AM
  const candidates = [
    `${REPORTS_DIR}/${date}-PM.json`,
    `${REPORTS_DIR}/${date}-AM.json`,
    `${REPORTS_DIR}/${date}.json`
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { date, ...data };
      } catch (e) {
        console.log(`  - ${file} 파싱 실패:`, e.message);
      }
    }
  }

  return null;
}

/**
 * 주간 리포트 파일명 생성
 * @param {Object} weekInfo
 * @returns {string}
 */
function getWeeklyReportFileName(weekInfo) {
  const year = weekInfo.startDate.substring(0, 4);
  return `${WEEKLY_REPORTS_DIR}/${year}-W${String(weekInfo.weekNumber).padStart(2, '0')}.json`;
}

async function main() {
  const forceRegenerate = process.argv.includes('--force');

  console.log('📅 주간 AI 인사이트 생성 시작...\n');

  // 지난 주 정보 계산
  const weekInfo = getLastWeekInfo();
  console.log(`📆 대상 기간: ${weekInfo.startDate} ~ ${weekInfo.endDate} (${weekInfo.weekNumber}주차)`);
  console.log(`   날짜: ${weekInfo.dates.join(', ')}\n`);

  // 이미 생성된 주간 리포트가 있는지 확인
  const weeklyFileName = getWeeklyReportFileName(weekInfo);
  if (fs.existsSync(weeklyFileName) && !forceRegenerate) {
    console.log(`⚠️ 이미 주간 리포트가 존재합니다: ${weeklyFileName}`);
    console.log('   강제 재생성하려면 --force 옵션을 사용하세요.');
    process.exit(0);
  }

  // 지난 주 일일 리포트 로드
  console.log('📂 지난 주 일일 리포트 로드 중...');
  const weeklyReports = [];

  for (const date of weekInfo.dates) {
    const report = loadDailyReport(date);
    if (report) {
      weeklyReports.push(report);
      console.log(`  ✓ ${date}: 로드 완료`);
    } else {
      console.log(`  ✗ ${date}: 리포트 없음`);
    }
  }

  if (weeklyReports.length === 0) {
    console.log('\n⚠️ 지난 주 일일 리포트가 없습니다. 웹 검색 기반으로 생성합니다.');
    console.log('   (순위 변동 섹션은 생략됩니다)\n');
  } else {
    console.log(`\n📊 총 ${weeklyReports.length}일치 리포트 로드 완료\n`);
  }

  // 전주 리포트 로드 (반복 방지용)
  const prevWeekInsight = loadPreviousWeeklyReport(weekInfo);
  if (prevWeekInsight) {
    console.log(`📋 전주 리포트 로드 완료 (반복 방지용)\n`);
  }

  // 주간 AI 인사이트 생성
  console.log('🤖 주간 AI 인사이트 생성 중...');
  const weeklyInsight = await generateWeeklyAIInsight(weeklyReports, weekInfo, prevWeekInsight);

  if (!weeklyInsight) {
    console.log('❌ 주간 AI 인사이트 생성 실패');
    process.exit(1);
  }

  // 디렉토리 생성
  if (!fs.existsSync(WEEKLY_REPORTS_DIR)) {
    fs.mkdirSync(WEEKLY_REPORTS_DIR, { recursive: true });
  }

  // 주간 리포트 저장
  const weeklyReport = {
    weekInfo,
    generatedAt: new Date().toISOString(),
    dailyReportCount: weeklyReports.length,
    ai: weeklyInsight
  };

  fs.writeFileSync(weeklyFileName, JSON.stringify(weeklyReport, null, 2), 'utf8');
  console.log(`\n✅ 주간 리포트 저장 완료: ${weeklyFileName}`);

  // docs에도 복사
  const docsWeeklyDir = './docs/reports/weekly';
  if (!fs.existsSync(docsWeeklyDir)) {
    fs.mkdirSync(docsWeeklyDir, { recursive: true });
  }

  const docsWeeklyFile = `${docsWeeklyDir}/${path.basename(weeklyFileName)}`;
  fs.copyFileSync(weeklyFileName, docsWeeklyFile);
  console.log(`📁 docs 복사 완료: ${docsWeeklyFile}`);
}

main().catch(console.error);
