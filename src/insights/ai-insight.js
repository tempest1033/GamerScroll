/**
 * AI Insight Generator
 * OpenAI Codex CLI를 호출하여 게임 업계 인사이트를 생성합니다.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 모델 설정
const MODEL = 'gpt-5.1';

/**
 * Codex CLI를 호출하여 AI 인사이트 생성
 * @param {Object} crawlData - 크롤링 데이터
 * @param {Object} rankingChanges - 순위 변동 데이터 (optional)
 * @returns {Object|null} AI 인사이트 JSON
 */
async function generateAIInsight(crawlData, rankingChanges = null) {
  try {
    console.log(`  - Codex CLI 호출 중 (${MODEL})...`);

    // 크롤링 데이터 요약
    const dataSummary = buildDataSummary(crawlData);

    // 순위 변동 데이터 요약
    const hasRankingChanges = rankingChanges && (
      (rankingChanges.up && rankingChanges.up.length > 0) ||
      (rankingChanges.down && rankingChanges.down.length > 0) ||
      (rankingChanges.new && rankingChanges.new.length > 0)
    );
    const rankingsSummary = hasRankingChanges ? buildRankingChangeSummary(rankingChanges) : '';

    const today = new Date().toISOString().split('T')[0];

    // rankings 섹션은 순위 변동 데이터가 있을 때만 포함
    const rankingsSection = hasRankingChanges ? `
  "rankings": [
    { "tag": "급상승|급하락|신규진입", "title": "게임명", "desc": "순위 변동 이유 분석 100자" }
  ],` : '';

    const rankingsInstruction = hasRankingChanges ? `
- rankings: 4개 (급상승/급하락/신규진입 중 변동폭이 크거나 주목할 만한 4개 선정)
  ※ 신규진입(순위권 밖에서 TOP 30 이내 진입)은 매우 중요 - 반드시 우선 포함!
  ※ 각 게임의 순위 변동 원인을 웹 검색으로 파악하여 작성 (업데이트, 이벤트, 할인, 논란 등)` : '';

    const rankingsData = hasRankingChanges ? `

## 순위 변동 데이터 (어제 → 오늘):
${rankingsSummary}

## 순위 변동 분석:
- 급상승/급하락/신규진입 중 주목할 4개 선정하여 변동 원인 분석
- 신규진입(순위권 밖 → TOP 30)은 반드시 우선 포함!
- 원인: 업데이트, 이벤트, 할인, 논란 등 (최신 뉴스 참고)` : '';

    const prompt = `## 중요: 오늘 날짜는 ${today}입니다.

한국 게임 업계 종합 인사이트를 JSON 형식으로 작성해줘.

## 크롤링 데이터:
${dataSummary}${rankingsData}

## 요청사항:
1. 웹 검색으로 최신 한국 게임 뉴스 조사
2. 크롤링 데이터와 검색 결과를 종합 분석
3. 아래 JSON 형식으로만 출력 (다른 텍스트 없이)

## 주의사항 (필수):
- 오늘 날짜(${today}) 기준으로 이미 발생한 사실만 작성
- 미래 예정 사항은 공식 발표된 것만 언급
- 추측이나 가상의 내용 절대 금지
- 확인되지 않은 정보 작성 금지
- 되도록이면 한글을 사용 (영문 게임명/회사명은 예외)

## 문체 규칙:
- 친절하게 설명하는 뉴스 큐레이터 스타일
- 독자에게 알려주는 느낌으로 작성
- 예: "출시됐어요", "발표했는데요", "예정이에요", "주목받고 있어요"

## JSON 형식:
{
  "date": "${today}",
  "issues": [
    { "tag": "모바일|PC|콘솔|e스포츠", "title": "제목 40자", "desc": "설명 100자 2문장" }
  ],
  "industryIssues": [
    { "tag": "구체적 회사명(넥슨/넷마블/크래프톤 등) 또는 정책/시장", "title": "업계 이슈 제목 40자", "desc": "업계 동향/뉴스 설명 100자" }
  ],
  "metrics": [
    { "tag": "매출|인기|동접", "title": "제목 40자", "desc": "설명 100자" }
  ],${rankingsSection}
  "community": [
    { "tag": "게임명", "title": "유저 반응 제목 40자", "desc": "해당 게임 커뮤니티 반응 요약 100자" }
  ],
  "streaming": [
    { "tag": "치지직|유튜브|트위치", "title": "제목 40자", "desc": "스트리밍 트렌드 100자" }
  ],
  "stocks": [
    { "name": "회사명", "comment": "오늘 주목받는 이유 50자" }
  ]
}

## 글자수 제한 (필수):
- title: 40자 이내
- desc: 100자 이내 (2문장으로 요약)

## 각 섹션별 개수:
- issues: 4개 (모바일, PC, 콘솔, e스포츠 각 1개)
- industryIssues: 2개 (한국 게임 업계 동향 - 기업 뉴스, 인수합병, 규제, 시장 트렌드 등)
- metrics: 2개 (주목할만한 지표 변화)${rankingsInstruction}
- community: 4개 (특정 게임에 대한 유저 반응 - 업데이트/패치/논란 등)
- streaming: 2개 (스트리밍 인기 게임/트렌드)
- stocks: 2개 (오늘 주목할 게임주 2개 선정 - 종목코드, 회사명, 주목 이유)

한국 게임 시장 기준으로 작성해줘.
JSON만 출력해. 다른 설명 없이.`;

    // 프롬프트를 임시 파일로 저장 (특수문자 이스케이프 문제 방지)
    const tmpFile = path.join(os.tmpdir(), `codex-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, prompt, 'utf8');

    // Codex CLI 호출 (웹 검색 없이 - exec 모드에서 미지원)
    const result = execSync(
      `cat "${tmpFile}" | codex exec -m ${MODEL} -c model_reasoning_effort=high -o /dev/stdout -`,
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 600000 // 10분 타임아웃
      }
    );

    // 임시 파일 삭제
    fs.unlinkSync(tmpFile);

    // JSON 파싱 - 중괄호 균형 맞춰서 첫 번째 완전한 JSON 객체만 추출
    const jsonStart = result.indexOf('{');
    if (jsonStart === -1) {
      console.log('  - JSON 시작 못 찾음');
      console.log('  - 응답:', result.substring(0, 500));
      return null;
    }

    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < result.length; i++) {
      if (result[i] === '{') depth++;
      else if (result[i] === '}') {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    if (jsonEnd === -1) {
      console.log('  - JSON 끝 못 찾음');
      console.log('  - 응답:', result.substring(0, 500));
      return null;
    }

    const jsonStr = result.substring(jsonStart, jsonEnd);
    const aiInsight = JSON.parse(jsonStr);
    console.log('  - AI 인사이트 생성 완료 (Codex)');
    return aiInsight;
  } catch (error) {
    console.error('  - AI 인사이트 생성 실패:', error.message);
    return null;
  }
}

/**
 * 크롤링 데이터 요약 문자열 생성
 */
function buildDataSummary(data) {
  const lines = [];

  // 모바일 순위
  const iosTop5 = data.rankings?.grossing?.kr?.ios?.slice(0, 5) || [];
  const androidTop5 = data.rankings?.grossing?.kr?.android?.slice(0, 5) || [];
  const iosFreeTop5 = data.rankings?.free?.kr?.ios?.slice(0, 5) || [];

  if (iosTop5.length > 0) {
    lines.push('### iOS 매출 TOP 5:');
    iosTop5.forEach((g, i) => lines.push(`${i + 1}. ${g.title} - ${g.developer}`));
  }

  if (androidTop5.length > 0) {
    lines.push('\n### Android 매출 TOP 5:');
    androidTop5.forEach((g, i) => lines.push(`${i + 1}. ${g.title} - ${g.developer}`));
  }

  if (iosFreeTop5.length > 0) {
    lines.push('\n### iOS 인기 TOP 5:');
    iosFreeTop5.forEach((g, i) => lines.push(`${i + 1}. ${g.title}`));
  }

  // Steam
  const steamTop5 = data.steam?.mostPlayed?.slice(0, 5) || [];
  if (steamTop5.length > 0) {
    lines.push('\n### Steam 동시접속 TOP 5:');
    steamTop5.forEach((g, i) => lines.push(`${i + 1}. ${g.name} - ${g.ccu?.toLocaleString() || 'N/A'}명`));
  }

  // 뉴스
  const newsItems = [
    ...(data.news?.inven || []),
    ...(data.news?.ruliweb || []),
    ...(data.news?.gamemeca || [])
  ].slice(0, 10);

  if (newsItems.length > 0) {
    lines.push('\n### 최신 뉴스:');
    newsItems.forEach(n => lines.push(`- ${n.title}`));
  }

  // 커뮤니티 인기글
  const communityItems = [
    ...(data.community?.dcinside || []).slice(0, 3).map(c => ({ ...c, source: '디시' })),
    ...(data.community?.arca || []).slice(0, 3).map(c => ({ ...c, source: '아카' })),
    ...(data.community?.inven || []).slice(0, 3).map(c => ({ ...c, source: '인벤' }))
  ];

  if (communityItems.length > 0) {
    lines.push('\n### 커뮤니티 인기글:');
    communityItems.forEach(c => lines.push(`- [${c.source}] ${c.title}`));
  }

  // 유튜브/치지직
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

/**
 * 순위 변동 데이터 요약 문자열 생성
 */
function buildRankingChangeSummary(changes) {
  const lines = [];

  // 급상승 (변동폭 큰 순)
  if (changes.up && changes.up.length > 0) {
    lines.push('### 급상승 (TOP 5):');
    changes.up.slice(0, 5).forEach(g => {
      lines.push(`- ${g.title} (${g.platform}) : ${g.prevRank || '?'}위 → ${g.rank}위 (+${g.change})`);
    });
  }

  // 급하락 (변동폭 큰 순)
  if (changes.down && changes.down.length > 0) {
    lines.push('\n### 급하락 (TOP 5):');
    changes.down.slice(0, 5).forEach(g => {
      lines.push(`- ${g.title} (${g.platform}) : ${g.prevRank || '?'}위 → ${g.rank}위 (${g.change})`);
    });
  }

  // 신규진입
  if (changes.new && changes.new.length > 0) {
    lines.push('\n### 신규진입 (TOP 5):');
    changes.new.slice(0, 5).forEach(g => {
      lines.push(`- ${g.title} (${g.platform}) : ${g.rank}위 진입`);
    });
  }

  return lines.join('\n');
}

module.exports = {
  generateAIInsight
};
