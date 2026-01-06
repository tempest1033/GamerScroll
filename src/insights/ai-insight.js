/**
 * AI Insight Generator
 * Claude CLI를 호출하여 게임 업계 인사이트를 생성합니다.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 모델 설정
const MODEL = 'claude';

// 히스토리 디렉토리
const HISTORY_DIR = './history';

/**
 * Claude CLI를 호출하여 AI 인사이트 생성
 * @param {Object} crawlData - 크롤링 데이터
 * @param {Object} rankingChanges - 순위 변동 데이터 (optional)
 * @param {Array} recentInsights - 최근 인사이트 배열 (반복 방지용, optional)
 * @returns {Object|null} AI 인사이트 JSON
 */
async function generateAIInsight(crawlData, rankingChanges = null, recentInsights = []) {
  try {
    console.log(`  - Claude CLI 호출 중 (${MODEL})...`);

    // 크롤링 데이터 요약
    const dataSummary = buildDataSummary(crawlData);

    // 순위 변동 데이터 요약
    const hasRankingChanges = rankingChanges && (
      (rankingChanges.up && rankingChanges.up.length > 0) ||
      (rankingChanges.down && rankingChanges.down.length > 0) ||
      (rankingChanges.new && rankingChanges.new.length > 0)
    );
    const rankingsSummary = hasRankingChanges ? buildRankingChangeSummary(rankingChanges) : '';

    const now = new Date();
    const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const today = kstNow.toISOString().split('T')[0];
    const currentTime = kstNow.toISOString().split('T')[1].substring(0, 5); // HH:MM

    // rankings 섹션은 순위 변동 데이터가 있을 때만 포함
    const rankingsSection = hasRankingChanges ? `
  "rankings": [
    { "tag": "급상승|급하락|신규진입", "title": "게임명", "prevRank": 이전순위숫자, "rank": 현재순위숫자, "change": 변동숫자, "platform": "iOS|Android", "desc": "순위 변동 이유 분석 200자 이내" }
  ],` : '';

    const rankingsInstruction = hasRankingChanges ? `
- rankings: 4개 (급상승/급하락/신규진입 중 변동폭이 크거나 주목할 만한 4개 선정)
  ※ 반드시 아래 '순위 변동 데이터'에 있는 게임 중에서만 선정!
  ※ prevRank, rank, change, platform 값은 아래 데이터에서 그대로 복사!
  ※ 순위 숫자를 임의로 바꾸지 말 것 - 제공된 데이터 그대로 사용
  ※ desc에만 웹 검색으로 파악한 변동 원인 작성 (업데이트, 이벤트, 할인, 논란 등)` : '';

    const rankingsData = hasRankingChanges ? `

## 순위 변동 데이터 (어제 → 오늘) - 반드시 이 데이터에서 선정:
${rankingsSummary}

## 순위 변동 분석 규칙:
- 위 데이터에 있는 게임만 선정 (임의 게임 추가 금지)
- prevRank, rank, change, platform 값은 위 데이터에서 정확히 복사
- 순위 숫자 절대 수정 금지
- desc만 웹 검색으로 원인 분석하여 작성` : '';

    // 최근 인사이트 요약 (반복 방지용)
    const recentInsightsSummary = buildRecentInsightsSummary(recentInsights);

    const prompt = `## 중요: 현재 시간 기준 정보
- 오늘 날짜: ${today}
- 현재 시간: ${currentTime} (KST, 한국 표준시)
- 데이터 정리 시 위 시간을 기준으로 판단해주세요.

한국 게임 업계 종합 인사이트를 JSON 형식으로 작성해줘.

## 크롤링 데이터:
${dataSummary}${rankingsData}${recentInsightsSummary}

## 요청사항:
1. 웹 검색으로 최신 한국 게임 뉴스 조사
2. 크롤링 데이터와 검색 결과를 종합 분석
3. 아래 JSON 형식으로만 출력 (다른 텍스트 없이)

## 웹 검색 에러 대응 (중요):
- 일부 URL이 404나 차단 에러를 반환해도 멈추지 말고 다른 소스로 계속 진행
- 특정 사이트가 차단되면 다른 게임 뉴스 사이트 검색
- 검색 결과가 부족하면 크롤링 데이터를 더 활용
- 어떤 상황에서도 반드시 JSON 결과를 출력해야 함

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
- 반드시 구체적인 게임명/회사명을 주어로 명시 (추상적 표현 금지)

## headline 작성 규칙 (SEO 최적화):
- 뉴스/블로그 제목처럼 임팩트 있게 작성
- 핵심 이슈 1~2개만 선정 (두 주제가 억지로 붙은 느낌 금지)
- 문장형 금지 (~요, ~어요 어미 사용 금지)
- 추상적 표현 금지 (구체적인 게임명/회사명/숫자 사용)
- 좋은 예: "GTA6 가격 100달러 논란 확산, 귀판오분전 444뽑기로 iOS 1위"
- 좋은 예: "2026 LCK 운영 방식 변경 발표, 메이플 PC방 점유율 45% 돌파"
- 나쁜 예: "방치형과 전략 장르가 상위권을 지키고, AI 투명성 논쟁이 계속됐어요"
- 나쁜 예: "연말 시즌 이벤트가 iOS 퍼즐 차트를 흔들고, 미국 규제 보고서가 나왔어요"

## JSON 형식:
{
  "date": "${today}",
  "summary": "오늘의 게임 업계 핵심 요약 (300자 이내)",
  "headline": "뉴스/블로그 제목처럼 임팩트 있게. 핵심 이슈 1개만 선정. 예: '메이플 키우기, 양대 마켓 1위 등극' (50자 이내)",
  "thumbnail": null,
  "issues": [
    { "tag": "모바일|PC|콘솔|e스포츠", "title": "제목 40자", "desc": "설명 200자 이내", "thumbnail": null }
  ],
  "industryIssues": [
    { "tag": "구체적 회사명(넥슨/넷마블/크래프톤 등) 또는 정책/시장", "title": "업계 이슈 제목 40자", "desc": "업계 동향/뉴스 설명 200자 이내", "thumbnail": null }
  ],
  "metrics": [
    { "tag": "매출|인기|동접", "title": "제목 40자", "desc": "설명 200자 이내", "thumbnail": null }
  ],${rankingsSection}
  "community": [
    { "tag": "게임명", "title": "유저 반응 제목 40자", "desc": "해당 게임 커뮤니티 반응 요약 200자 이내" }
  ],
  "streaming": [
    { "tag": "치지직|유튜브", "title": "제목 40자", "desc": "스트리밍 트렌드 200자 이내" }
  ],
  "stocks": [
    { "name": "회사명", "comment": "오늘 주목받는 이유 50자" }
  ]
}

## 글자수 제한 (필수):
- summary: 300자 이내
- title: 40자 이내
- desc: 200자 이내

## 썸네일 처리 규칙 (필수):
- 아래 모든 thumbnail 필드는 항상 null로 출력
- 썸네일은 후처리 단계(Codex)에서 웹 검색으로 채움

## 중복 방지 (필수):
- summary(데일리 포커스)는 최근 리포트와 중복된 주제/표현 피할 것
- issues의 tag는 각각 다르게 (5개 모두 다른 태그 사용, 중복 금지)
- 최근 리포트에서 다룬 게임/주제 재언급 금지
- 1위 게임이 연속이면 다른 순위나 다른 이슈 찾기

## 각 섹션별 개수:
- issues: 5개 (태그: 모바일/PC/콘솔/글로벌/e스포츠/인디/업계동향/정책/기술/신작/업데이트/콜라보/스트리밍/출시·종료(게임 출시 혹은 서비스 종료 소식)/행사(게임쇼, 전시회, 오프라인 이벤트) 중 5개 선택, 중복 금지)
- industryIssues: 0~2개 (한국 게임 업계 동향 - 기업 뉴스, 인수합병, 규제, 시장 트렌드 등)
  ※ 웹 검색으로 오늘자 구체적 뉴스를 먼저 찾고, 없으면 크롤링 뉴스 데이터에서 선정
  ※ 구체적 뉴스가 있으면 2개, 부족하면 1개, 없으면 0개 (빈 배열 [])
  ※ 일반론적 필러 콘텐츠 금지 - 구체적 사건/발표/뉴스 기반으로만 작성
- metrics: 2개 (주목할만한 지표 변화)${rankingsInstruction}
- community: 4개 (특정 게임에 대한 유저 반응 - 업데이트/패치/논란 등)
- streaming: 2개 (스트리밍 인기 게임/트렌드)
  ※ 한국에서는 트위치가 서비스 종료됨 - 치지직/유튜브만 사용
  ※ 중복 방지 규칙에서 제외 - 내용만 다르게 작성하면 됨
- stocks: 2개 (오늘 주목할 게임주 2개 선정 - 종목코드, 회사명, 주목 이유)

한국 게임 시장 기준으로 작성해줘.
JSON만 출력해. 다른 설명 없이.`;

    // 프롬프트를 임시 파일로 저장 (특수문자 이스케이프 문제 방지)
    const tmpFile = path.join(os.tmpdir(), `claude-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, prompt, 'utf8');

    // Claude CLI 호출 (최대 2회 재시도)
    const MAX_RETRIES = 2;
    let result = null;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`  - 재시도 ${attempt}/${MAX_RETRIES} (5초 대기)...`);
          await new Promise(r => setTimeout(r, 5000));
        }

        result = execSync(
          `cat "${tmpFile}" | claude -p - --tools default --model opus`,
          {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
            timeout: 1800000 // 30분 타임아웃
          }
        );

        // JSON 파싱 시도
        const jsonStart = result.indexOf('{');
        if (jsonStart === -1) {
          throw new Error('JSON 시작 못 찾음');
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
          throw new Error('JSON 끝 못 찾음');
        }

        const jsonStr = result.substring(jsonStart, jsonEnd);
        const aiInsight = JSON.parse(jsonStr);

        // 성공 - 임시 파일 삭제 후 반환
        fs.unlinkSync(tmpFile);

        // AI 응답의 date를 현재 KST 날짜로 강제 교정
        aiInsight.date = today;

        console.log('  - AI 인사이트 생성 완료 (Claude)');
        return aiInsight;

      } catch (retryError) {
        lastError = retryError;
        console.log(`  - 시도 ${attempt + 1} 실패: ${retryError.message}`);
        if (result) {
          console.log(`  - 응답 앞부분: ${result.substring(0, 300)}`);
        }
      }
    }

    // 모든 재시도 실패
    fs.unlinkSync(tmpFile);
    throw lastError;

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

  // 뉴스 (썸네일 URL 포함)
  const newsItems = [
    ...(data.news?.inven || []),
    ...(data.news?.ruliweb || []),
    ...(data.news?.gamemeca || []),
    ...(data.news?.thisisgame || [])
  ].filter(n => n.thumbnail).slice(0, 20);

  if (newsItems.length > 0) {
    lines.push('\n### 최신 뉴스 (썸네일 URL 포함):');
    newsItems.forEach((n, i) => lines.push(`${i + 1}. [${n.title}] → ${n.thumbnail}`));
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
 * 최근 인사이트 요약 문자열 생성 (반복 방지용)
 * @param {Array} recentInsights - 최근 인사이트 배열
 * @returns {string} 요약 문자열
 */
function buildRecentInsightsSummary(recentInsights) {
  if (!recentInsights || recentInsights.length === 0) {
    return '';
  }

  const lines = ['\n\n## ⛔ 중복 금지 - 최근 인사이트 (아래 내용 절대 재사용 금지):'];

  // 블랙리스트 키워드 수집
  const blacklistKeywords = new Set();

  recentInsights.forEach((insight, idx) => {
    lines.push(`\n### 최근 리포트 ${idx + 1}:`);

    // summary (데일리 포커스)
    if (insight.summary) {
      lines.push(`- [요약] ${insight.summary}`);
    }

    // issues
    if (insight.issues && insight.issues.length > 0) {
      insight.issues.forEach(issue => {
        lines.push(`- [${issue.tag}] ${issue.title}: ${issue.desc}`);
        // 제목에서 키워드 추출
        blacklistKeywords.add(issue.title);
      });
    }

    // industryIssues
    if (insight.industryIssues && insight.industryIssues.length > 0) {
      insight.industryIssues.forEach(issue => {
        lines.push(`- [${issue.tag}] ${issue.title}: ${issue.desc}`);
        blacklistKeywords.add(issue.title);
      });
    }

    // community
    if (insight.community && insight.community.length > 0) {
      insight.community.forEach(comm => {
        lines.push(`- [커뮤니티] ${comm.title}: ${comm.desc}`);
        blacklistKeywords.add(comm.tag); // 게임명
      });
    }

    // metrics
    if (insight.metrics && insight.metrics.length > 0) {
      insight.metrics.forEach(metric => {
        blacklistKeywords.add(metric.title);
      });
    }

    // rankings
    if (insight.rankings && insight.rankings.length > 0) {
      insight.rankings.forEach(rank => {
        blacklistKeywords.add(rank.title); // 게임명
      });
    }

    // streaming - 중복 방지에서 제외 (선택지가 치지직/유튜브 두 개뿐이라 제외)
    // if (insight.streaming && insight.streaming.length > 0) {
    //   insight.streaming.forEach(stream => {
    //     blacklistKeywords.add(stream.title);
    //   });
    // }
  });

  // 블랙리스트 키워드 출력
  if (blacklistKeywords.size > 0) {
    lines.push(`\n### 🚫 사용 금지 키워드 (이 단어가 들어간 주제 선정 금지):`);
    lines.push([...blacklistKeywords].join(', '));
  }

  // 강화된 지시사항
  lines.push(`
### ⚠️ 중복 방지 규칙 (필수 준수):
1. 위 리포트에서 다룬 게임/이슈를 모든 섹션(issues, industryIssues, metrics, rankings, community)에 다시 쓰지 말 것 (streaming은 제외)
2. 같은 게임이라도 완전히 다른 각도의 새 이슈만 허용 (예: 이전에 "출시" 다뤘으면 → "출시" 관련 금지)
3. 비슷한 표현/문장 구조도 금지 (예: "~9관왕", "~성기사 출시" 등 이미 쓴 표현)
4. 확실히 새로운 뉴스/이슈만 선정할 것
5. 위 규칙 위반 시 결과물 무효 - 반드시 준수!`);

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
