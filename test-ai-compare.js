#!/usr/bin/env node
/**
 * GPT vs Claude AI 인사이트 비교 테스트
 * 결과를 test-gpt.json, test-claude.json으로 저장
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { loadHistory, getYesterdayDate } = require('./src/insights/daily');

const CACHE_FILE = './data-cache.json';
const REPORTS_DIR = './reports';

// 최근 인사이트 로드
function loadRecentInsights(count = 3) {
  const insights = [];
  if (!fs.existsSync(REPORTS_DIR)) return insights;

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  for (const file of files) {
    if (insights.length >= count) break;
    try {
      const report = JSON.parse(fs.readFileSync(`${REPORTS_DIR}/${file}`, 'utf8'));
      if (report.ai) insights.push(report.ai);
    } catch (e) {}
  }
  return insights;
}

// 어제 순위 로드
function loadYesterdayRankingsFromReports(date) {
  const file = `${REPORTS_DIR}/${date}.json`;

  if (fs.existsSync(file)) {
    try {
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
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
    } catch (e) {}
  }
  return null;
}

// 순위 변동 계산
function buildRankingChanges(todayRankings, yesterdayRankings) {
  const up = [], down = [], newEntries = [];
  const platforms = [{ key: 'ios', label: 'iOS' }, { key: 'android', label: 'Android' }];

  platforms.forEach(({ key, label }) => {
    const todayList = todayRankings?.grossing?.kr?.[key] || [];
    const yesterdayList = yesterdayRankings?.grossing?.kr?.[key] || [];
    const yesterdayMap = {};
    yesterdayList.forEach((app, idx) => { yesterdayMap[app.title] = idx + 1; });

    todayList.slice(0, 100).forEach((app, idx) => {
      const rank = idx + 1;
      const prevRank = yesterdayMap[app.title];
      if (!prevRank) {
        newEntries.push({ title: app.title, platform: label, rank, developer: app.developer });
      } else {
        const change = prevRank - rank;
        if (change >= 5) up.push({ title: app.title, platform: label, prevRank, rank, change, developer: app.developer });
        else if (change <= -5) down.push({ title: app.title, platform: label, prevRank, rank, change, developer: app.developer });
      }
    });
  });

  up.sort((a, b) => b.change - a.change);
  down.sort((a, b) => a.change - b.change);
  newEntries.sort((a, b) => a.rank - b.rank);
  return { up, down, new: newEntries };
}

// 데이터 요약 생성
function buildDataSummary(data) {
  const lines = [];
  const iosTop5 = data.rankings?.grossing?.kr?.ios?.slice(0, 5) || [];
  const androidTop5 = data.rankings?.grossing?.kr?.android?.slice(0, 5) || [];

  if (iosTop5.length > 0) {
    lines.push('### iOS 매출 TOP 5:');
    iosTop5.forEach((g, i) => lines.push(`${i + 1}. ${g.title} - ${g.developer}`));
  }
  if (androidTop5.length > 0) {
    lines.push('\n### Android 매출 TOP 5:');
    androidTop5.forEach((g, i) => lines.push(`${i + 1}. ${g.title} - ${g.developer}`));
  }

  const steamTop5 = data.steam?.mostPlayed?.slice(0, 5) || [];
  if (steamTop5.length > 0) {
    lines.push('\n### Steam 동시접속 TOP 5:');
    steamTop5.forEach((g, i) => lines.push(`${i + 1}. ${g.name} - ${g.ccu?.toLocaleString() || 'N/A'}명`));
  }

  const newsItems = [...(data.news?.inven || []), ...(data.news?.ruliweb || []), ...(data.news?.gamemeca || [])].slice(0, 10);
  if (newsItems.length > 0) {
    lines.push('\n### 최신 뉴스:');
    newsItems.forEach(n => lines.push(`- ${n.title}`));
  }

  const communityItems = [
    ...(data.community?.dcinside || []).slice(0, 3).map(c => ({ ...c, source: '디시' })),
    ...(data.community?.arca || []).slice(0, 3).map(c => ({ ...c, source: '아카' })),
    ...(data.community?.inven || []).slice(0, 3).map(c => ({ ...c, source: '인벤' }))
  ];
  if (communityItems.length > 0) {
    lines.push('\n### 커뮤니티 인기글:');
    communityItems.forEach(c => lines.push(`- [${c.source}] ${c.title}`));
  }

  const youtubeItems = data.youtube?.gaming?.slice(0, 5) || [];
  const chzzkItems = data.chzzk?.slice(0, 5) || [];
  if (youtubeItems.length > 0) {
    lines.push('\n### 유튜브 인기 게임 영상:');
    youtubeItems.forEach(v => lines.push(`- ${v.title} (${v.channel})`));
  }
  if (chzzkItems.length > 0) {
    lines.push('\n### 치지직 인기 방송:');
    chzzkItems.forEach(s => lines.push(`- ${s.title} (${s.streamer})`));
  }

  return lines.join('\n');
}

// 순위 변동 요약
function buildRankingChangeSummary(changes) {
  const lines = [];
  if (changes.up?.length > 0) {
    lines.push('### 급상승 (TOP 5):');
    changes.up.slice(0, 5).forEach(g => lines.push(`- ${g.title} (${g.platform}) : ${g.prevRank}위 → ${g.rank}위 (+${g.change})`));
  }
  if (changes.down?.length > 0) {
    lines.push('\n### 급하락 (TOP 5):');
    changes.down.slice(0, 5).forEach(g => lines.push(`- ${g.title} (${g.platform}) : ${g.prevRank}위 → ${g.rank}위 (${g.change})`));
  }
  if (changes.new?.length > 0) {
    lines.push('\n### 신규진입 (TOP 5):');
    changes.new.slice(0, 5).forEach(g => lines.push(`- ${g.title} (${g.platform}) : ${g.rank}위 진입`));
  }
  return lines.join('\n');
}

// 프롬프트 생성
function buildPrompt(dataSummary, rankingsSummary, today, currentTime) {
  const hasRankingChanges = rankingsSummary.length > 0;

  const rankingsSection = hasRankingChanges ? `
  "rankings": [
    { "tag": "급상승|급하락|신규진입", "title": "게임명", "prevRank": 이전순위숫자, "rank": 현재순위숫자, "change": 변동숫자, "platform": "iOS|Android", "desc": "순위 변동 이유 분석 200자 이내" }
  ],` : '';

  const rankingsInstruction = hasRankingChanges ? `
- rankings: 4개 (급상승/급하락/신규진입 중 변동폭이 크거나 주목할 만한 4개 선정)` : '';

  const rankingsData = hasRankingChanges ? `

## 순위 변동 데이터:
${rankingsSummary}` : '';

  return `## 현재 시간: ${today} ${currentTime} (KST)

한국 게임 업계 종합 인사이트를 JSON 형식으로 작성해줘.

## 크롤링 데이터:
${dataSummary}${rankingsData}

## 요청사항:
1. 웹 검색으로 최신 한국 게임 뉴스 조사
2. 크롤링 데이터와 검색 결과를 종합 분석
3. 아래 JSON 형식으로만 출력

## 문체: 친절한 뉴스 큐레이터 스타일 ("출시됐어요", "발표했는데요" 등)

## JSON 형식:
{
  "date": "${today}",
  "headline": "핵심 헤드라인 50자 이내",
  "summary": "핵심 요약 300자 이내",
  "issues": [
    { "tag": "모바일|PC|콘솔|e스포츠", "title": "제목 40자", "desc": "설명 200자" }
  ],
  "industryIssues": [
    { "tag": "회사명 또는 정책/시장", "title": "업계 이슈 40자", "desc": "설명 200자" }
  ],
  "metrics": [
    { "tag": "매출|인기|동접", "title": "제목 40자", "desc": "설명 200자" }
  ],${rankingsSection}
  "community": [
    { "tag": "게임명", "title": "유저 반응 40자", "desc": "설명 200자" }
  ],
  "streaming": [
    { "tag": "치지직|유튜브", "title": "제목 40자", "desc": "설명 200자" }
  ],
  "stocks": [
    { "name": "회사명", "comment": "주목 이유 50자" }
  ]
}

## 개수: issues 5개, industryIssues 0~2개, metrics 2개, ${hasRankingChanges ? 'rankings 4개, ' : ''}community 4개, streaming 2개, stocks 2개

JSON만 출력해.`;
}

async function runGPT(prompt, tmpFile) {
  console.log('\n🤖 [GPT] Codex CLI 호출 중 (gpt-5.2)...');
  const startTime = Date.now();

  fs.writeFileSync(tmpFile, prompt, 'utf8');

  try {
    const result = execSync(
      `cat "${tmpFile}" | codex exec -m gpt-5.2 -c model_reasoning_effort=high -c hide_agent_reasoning=true -o /dev/stdout -`,
      { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 600000 }
    );

    const jsonStart = result.indexOf('{');
    let depth = 0, jsonEnd = -1;
    for (let i = jsonStart; i < result.length; i++) {
      if (result[i] === '{') depth++;
      else if (result[i] === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
    }

    const jsonStr = result.substring(jsonStart, jsonEnd);
    const parsed = JSON.parse(jsonStr);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [GPT] 완료 (${elapsed}초)`);
    return parsed;
  } catch (e) {
    console.error(`❌ [GPT] 실패: ${e.message}`);
    return null;
  }
}

async function runClaude(prompt, tmpFile) {
  console.log('\n🟣 [Claude] CLI 호출 중 (--tools default)...');
  const startTime = Date.now();

  fs.writeFileSync(tmpFile, prompt, 'utf8');

  try {
    const result = execSync(
      `claude -p "$(cat ${tmpFile})" --tools default --output-format json`,
      { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 600000 }
    );

    // Claude output-format json wraps in {"result": "..."} or similar
    let parsed;
    try {
      const wrapper = JSON.parse(result);
      if (wrapper.result) {
        // Extract JSON from result string
        const jsonStart = wrapper.result.indexOf('{');
        let depth = 0, jsonEnd = -1;
        for (let i = jsonStart; i < wrapper.result.length; i++) {
          if (wrapper.result[i] === '{') depth++;
          else if (wrapper.result[i] === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
        }
        parsed = JSON.parse(wrapper.result.substring(jsonStart, jsonEnd));
      } else {
        parsed = wrapper;
      }
    } catch {
      // Try direct parse
      const jsonStart = result.indexOf('{');
      let depth = 0, jsonEnd = -1;
      for (let i = jsonStart; i < result.length; i++) {
        if (result[i] === '{') depth++;
        else if (result[i] === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
      }
      parsed = JSON.parse(result.substring(jsonStart, jsonEnd));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [Claude] 완료 (${elapsed}초)`);
    return parsed;
  } catch (e) {
    console.error(`❌ [Claude] 실패: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('🔬 GPT vs Claude AI 인사이트 비교 테스트\n');
  console.log('=' .repeat(50));

  // 데이터 로드
  if (!fs.existsSync(CACHE_FILE)) {
    console.log('❌ 캐시 파일 없음');
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  console.log(`📂 캐시 로드 완료`);

  const todayData = {
    news: cache.news,
    community: cache.community,
    rankings: cache.rankings,
    steam: cache.steam,
    youtube: cache.youtube,
    chzzk: cache.chzzk
  };

  // 어제 데이터
  const yesterday = getYesterdayDate();
  let yesterdayRankings = loadHistory(yesterday)?.rankings;
  if (!yesterdayRankings) {
    yesterdayRankings = loadYesterdayRankingsFromReports(yesterday);
  }

  let rankingChanges = null;
  if (yesterdayRankings) {
    rankingChanges = buildRankingChanges(cache.rankings, yesterdayRankings);
    console.log(`📊 순위 변동: 상승 ${rankingChanges.up.length}개, 하락 ${rankingChanges.down.length}개`);
  }

  // 프롬프트 생성
  const dataSummary = buildDataSummary(todayData);
  const rankingsSummary = rankingChanges ? buildRankingChangeSummary(rankingChanges) : '';

  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const today = kst.toISOString().split('T')[0];
  const currentTime = kst.toISOString().split('T')[1].substring(0, 5);

  const prompt = buildPrompt(dataSummary, rankingsSummary, today, currentTime);

  const tmpFileGPT = path.join(os.tmpdir(), `test-gpt-${Date.now()}.txt`);
  const tmpFileClaude = path.join(os.tmpdir(), `test-claude-${Date.now()}.txt`);

  console.log('\n🚀 병렬 실행 시작...\n');

  // 병렬 실행
  const [gptResult, claudeResult] = await Promise.all([
    runGPT(prompt, tmpFileGPT),
    runClaude(prompt, tmpFileClaude)
  ]);

  // 결과 저장
  if (gptResult) {
    fs.writeFileSync('./test-gpt.json', JSON.stringify(gptResult, null, 2), 'utf8');
    console.log('\n📄 GPT 결과: test-gpt.json');
  }

  if (claudeResult) {
    fs.writeFileSync('./test-claude.json', JSON.stringify(claudeResult, null, 2), 'utf8');
    console.log('📄 Claude 결과: test-claude.json');
  }

  // 임시 파일 정리
  try { fs.unlinkSync(tmpFileGPT); } catch {}
  try { fs.unlinkSync(tmpFileClaude); } catch {}

  console.log('\n' + '='.repeat(50));
  console.log('✅ 비교 테스트 완료!');
  console.log('결과 파일: test-gpt.json, test-claude.json');
}

main().catch(console.error);
