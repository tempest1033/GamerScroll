/**
 * Weekly AI Insight Generator
 * 주간 게임 업계 인사이트를 생성합니다.
 * 매주 월요일 0시(KST) 기준으로 지난주 한 주 동안의 핫이슈를 요약합니다.
 *
 * ★ 일간 리포트와 동일한 JSON 구조를 사용합니다.
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
 * Claude CLI를 호출하여 주간 AI 인사이트 생성
 * @param {Array} weeklyReports - 지난 주 일일 리포트 배열
 * @param {Object} weekInfo - 주차 정보 { startDate, endDate, weekNumber }
 * @param {Object} prevWeekInsight - 전주 인사이트 (반복 방지용, optional)
 * @returns {Object|null} AI 인사이트 JSON (일간 리포트와 동일한 구조)
 */
async function generateWeeklyAIInsight(weeklyReports, weekInfo, prevWeekInsight = null) {
  try {
    console.log(`  - Claude CLI 호출 중 (${MODEL})...`);

    // 주간 데이터 요약
    const dataSummary = buildWeeklyDataSummary(weeklyReports, weekInfo);

    // 주간 순위 변동 계산 (7일 전 vs 주말)
    // weeklyReports는 날짜순 정렬되어 있음 (월~일)
    const lastReport = weeklyReports[weeklyReports.length - 1]; // 주말 (일요일)
    const firstReport = weeklyReports[0]; // 주초 (월요일) = 7일 전 기준
    const rankingChanges = calculateWeeklyRankingChanges(lastReport, firstReport);
    const hasRankingChanges = rankingChanges && (
      (rankingChanges.up && rankingChanges.up.length > 0) ||
      (rankingChanges.down && rankingChanges.down.length > 0) ||
      (rankingChanges.new && rankingChanges.new.length > 0)
    );
    const rankingsSummary = hasRankingChanges ? buildWeeklyRankingChangeSummary(rankingChanges) : '';

    // 현재 시간 (KST)
    const now = new Date();
    const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const currentDate = kstNow.toISOString().split('T')[0];
    const currentTime = kstNow.toISOString().split('T')[1].substring(0, 5); // HH:MM

    // rankings 관련 프롬프트 섹션
    const rankingsData = hasRankingChanges ? `

## 주간 순위 변동 데이터 (${weekInfo.startDate} → ${weekInfo.endDate}) - 반드시 이 데이터에서 선정:
${rankingsSummary}

## 순위 변동 분석 규칙:
- 위 데이터에 있는 게임만 선정 (임의 게임 추가 금지)
- prevRank, rank, change, platform 값은 위 데이터에서 정확히 복사
- 순위 숫자 절대 수정 금지
- desc만 웹 검색으로 원인 분석하여 작성` : '';

    // rankings 섹션은 데이터가 있을 때만 포함
    const rankingsSection = hasRankingChanges ? `
  "rankings": [
    { "tag": "급상승|급하락|신규진입|주간1위", "title": "게임명", "prevRank": 이전순위숫자, "rank": 현재순위숫자, "change": 변동숫자, "platform": "iOS|Android", "desc": "지난 주 순위 변동 이유 분석 200자 이내" }
  ],` : '';

    const rankingsInstruction = hasRankingChanges ? `
- rankings: 4개 (급상승/급하락/신규진입 중 변동폭이 크거나 주목할 만한 4개 선정)
  ※ 반드시 아래 '주간 순위 변동 데이터'에 있는 게임 중에서만 선정!
  ※ prevRank, rank, change, platform 값은 아래 데이터에서 그대로 복사!
  ※ 순위 숫자를 임의로 바꾸지 말 것 - 제공된 데이터 그대로 사용
  ※ desc에만 웹 검색으로 파악한 변동 원인 작성 (업데이트, 이벤트, 할인, 논란 등)` : '';

    // 전주 인사이트 요약 (반복 방지용)
    const prevWeekSummary = buildPrevWeekInsightSummary(prevWeekInsight);

    const prompt = `## 중요: 현재 시간 기준 정보
- 현재 날짜: ${currentDate}
- 현재 시간: ${currentTime} (KST, 한국 표준시)
- 지난 주 리포트 기간: ${weekInfo.startDate} ~ ${weekInfo.endDate}
- 데이터 정리 시 위 시간을 기준으로 판단해주세요.

지난 한 주 동안의 한국 게임 업계 핫이슈를 정리해주세요.
일간 리포트와 동일한 피드 형태로 표현됩니다.

## 지난 주 일일 리포트 요약:
${dataSummary}${rankingsData}${prevWeekSummary}

## 요청사항:
1. 웹 검색으로 ${weekInfo.startDate} ~ ${weekInfo.endDate} 기간의 한국 게임 뉴스 조사
2. 일일 리포트 데이터와 검색 결과를 종합 분석
3. 한 주간 가장 핫했던 이슈들을 선별
4. 아래 JSON 형식으로만 출력 (다른 텍스트 없이)

## 웹 검색 에러 대응 (중요):
- 일부 URL이 404나 차단 에러를 반환해도 멈추지 말고 다른 소스로 계속 진행
- 특정 사이트(inven.co.kr 등)가 차단되면 다른 게임 뉴스 사이트 검색
- 검색 결과가 부족하면 일일 리포트 데이터를 더 활용
- 어떤 상황에서도 반드시 JSON 결과를 출력해야 함

## 주의사항 (필수):
- ${weekInfo.startDate} ~ ${weekInfo.endDate} 기간에 발생한 사실만 작성
- 각 이슈는 해당 주에 실제로 있었던 일만 포함
- 추측이나 가상의 내용 절대 금지
- 확인되지 않은 정보 작성 금지
- 되도록이면 한글을 사용 (영문 게임명/회사명은 예외)

## 문체 규칙:
- 친절하게 설명하는 뉴스 큐레이터 스타일
- 독자에게 알려주는 느낌으로 작성
- 예: "화제가 됐어요", "주목받았어요", "있었어요", "발표됐어요"
- 주간 리포트이므로 과거형 위주로 작성
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

## JSON 형식 (일간 리포트와 동일):
{
  "date": "${weekInfo.startDate} ~ ${weekInfo.endDate}",
  "weekNumber": ${weekInfo.weekNumber},
  "summary": "지난 주 게임 업계 핵심 요약 (300자 이내)",
  "headline": "뉴스/블로그 제목처럼 임팩트 있게. 핵심 이슈 1개만 선정. 예: '메이플 키우기, 양대 마켓 1위 등극' (50자 이내)",
  "thumbnail": "headline과 가장 관련된 뉴스 썸네일 URL (주간 뉴스 목록에서 선택)",
  "issues": [
    { "tag": "모바일|PC|콘솔|e스포츠", "title": "지난 주 핫이슈 제목 40자", "desc": "설명 200자 이내", "thumbnail": "관련 뉴스 썸네일 URL" }
  ],
  "industryIssues": [
    { "tag": "구체적 회사명(넥슨/넷마블/크래프톤 등) 또는 정책/시장", "title": "업계 이슈 제목 40자", "desc": "업계 동향/뉴스 설명 200자 이내", "thumbnail": "관련 뉴스 썸네일 URL" }
  ],
  "metrics": [
    { "tag": "매출|인기|동접", "title": "제목 40자", "desc": "설명 200자 이내", "thumbnail": "관련 뉴스 썸네일 URL" }
  ],${rankingsSection}
  "community": [
    { "tag": "게임명", "title": "유저 반응 제목 40자", "desc": "해당 게임 커뮤니티 반응 요약 200자 이내" }
  ],
  "streaming": [
    { "tag": "치지직|유튜브", "title": "제목 40자", "desc": "스트리밍 트렌드 200자 이내" }
  ],
  "stocks": {
    "up": [
      { "code": "종목코드", "name": "회사명", "price": 가격숫자, "changePercent": 등락률숫자, "comment": "상승 이유 50자" }
    ],
    "down": [
      { "code": "종목코드", "name": "회사명", "price": 가격숫자, "changePercent": 등락률숫자, "comment": "하락 이유 50자" }
    ]
  },
  "mvp": {
    "name": "게임명",
    "tag": "장르 또는 카테고리",
    "desc": "지난 주 MVP로 선정된 이유 200자 이내",
    "highlights": ["핵심 성과1", "핵심 성과2", "핵심 성과3"]
  },
  "releases": [
    { "date": "M/D", "title": "게임명", "platform": "iOS|Android|PC|콘솔", "type": "신작|업데이트", "desc": "기대 포인트 50자" }
  ],
  "global": [
    { "tag": "북미|일본|중국|유럽", "title": "글로벌 트렌드 제목 40자", "desc": "해외 게임 시장 동향 200자 이내", "thumbnail": "관련 뉴스 썸네일 URL" }
  ]
}

## 글자수 제한 (필수):
- summary: 300자 이내
- title: 40자 이내
- desc: 200자 이내

## 썸네일 선택 규칙 (필수 - 우선순위대로 진행):
1. 뉴스 DB에서 "확실히 일치"하는 기사 썸네일 사용
   - 이슈 제목의 핵심 키워드가 뉴스 제목에 "모두" 포함된 경우만
   - 예: "명일방주 엔드필드 출시" → "명일방주" AND "엔드필드" 둘 다 있어야 함
   - 애매하면 스킵 → 다음 단계로
2. 웹 검색으로 "확실히 일치"하는 뉴스/관련 이미지 찾기
   - 이슈와 정확히 매칭되는 뉴스 기사 이미지
   - 애매하면 스킵 → 다음 단계로
3. 게임 관련 이슈면 → 해당 게임 공식 아이콘 (앱스토어/구글플레이 아이콘)
4. 웹 검색으로 공식 이미지 찾기 (Steam 헤더, 공식 사이트 등)
5. 위 모두 실패 → 기본 폴백 이미지 또는 null
※ 절대 금지: 키워드 불일치 이미지 사용 (애매하면 차라리 공식 아이콘 사용)

## 중복 방지 (필수):
- summary(위클리 포커스)는 전주 리포트와 중복된 주제/표현 피할 것
- issues의 tag는 각각 다르게 (5개 모두 다른 태그 사용, 중복 금지)
- 일일 리포트에서 매일 반복된 주제보다 주간 전체를 관통하는 큰 흐름 위주로

## 각 섹션별 개수:
- issues: 5개 (태그: 모바일/PC/콘솔/글로벌/e스포츠/인디/업계동향/정책/기술/신작/업데이트/콜라보/스트리밍/출시·종료(게임 출시 혹은 서비스 종료 소식)/행사(게임쇼, 전시회, 오프라인 이벤트) 중 5개 선택, 중복 금지)
- industryIssues: 4개 (지난 주 한국 게임 업계 주요 동향)
  ※ 웹 검색으로 해당 주 구체적 뉴스를 먼저 찾고, 없으면 일일 리포트 데이터에서 선정
  ※ 일반론적 필러 콘텐츠 금지 - 구체적 사건/발표/뉴스 기반으로만 작성
- metrics: 2개 (지난 주 주목할만한 지표 변화)${rankingsInstruction}
- community: 4개 (지난 주 커뮤니티에서 화제가 된 게임/이슈)
- streaming: 2개 (지난 주 스트리밍 트렌드)
  ※ 한국에서는 트위치가 서비스 종료됨 - 치지직/유튜브만 사용
- stocks: up 3개, down 3개 (지난 주 게임주 등락률 TOP3 - code와 name 필드 분리)
- mvp: 1개 (지난 주 가장 주목받은 게임 - 매출/화제성/성과 종합)
  ※ highlights는 3개의 핵심 성과 키워드
- releases: 6개 (이번 주 출시 예정 기대작 - 신작 또는 대규모 업데이트)
  ※ 이번 주 = 리포트 생성일 기준 월~일
  ※ 웹 검색으로 이번 주 출시/업데이트 예정 게임 조사
- global: 3개 (지난 주 글로벌 게임 시장 주요 동향 - 북미/일본/중국 등)

## stocks 형식 주의:
- code: 종목코드 (6자리 숫자), name: 회사명 (별도 필드)
- 예: { "code": "259960", "name": "크래프톤" }, { "code": "036570", "name": "엔씨소프트" }
- price는 현재가(원), changePercent는 주간 등락률(%)
- up: 상승률 TOP3, down: 하락률 TOP3

한국 게임 시장 기준으로 작성해줘.
JSON만 출력해. 다른 설명 없이.`;

    // 프롬프트를 임시 파일로 저장
    const tmpFile = path.join(os.tmpdir(), `claude-weekly-prompt-${Date.now()}.txt`);
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
        const weeklyInsight = JSON.parse(jsonStr);

        // 성공 - 임시 파일 삭제 후 반환
        fs.unlinkSync(tmpFile);

        console.log('  - 주간 AI 인사이트 생성 완료 (Claude)');
        return weeklyInsight;

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
    console.error('  - 주간 AI 인사이트 생성 실패:', error.message);
    return null;
  }
}

/**
 * 주간 데이터 요약 문자열 생성
 * @param {Array} weeklyReports - 일일 리포트 배열
 * @param {Object} weekInfo - 주차 정보
 * @returns {string} 요약 문자열
 */
function buildWeeklyDataSummary(weeklyReports, weekInfo) {
  const lines = [];

  lines.push(`### 기간: ${weekInfo.startDate} ~ ${weekInfo.endDate} (${weekInfo.weekNumber}주차)\n`);

  // 각 일별 주요 이슈 요약
  weeklyReports.forEach(report => {
    if (!report || !report.ai) return;

    lines.push(`\n#### ${report.date}:`);

    // 오늘의 이슈
    if (report.ai.issues && report.ai.issues.length > 0) {
      lines.push('- 주요 이슈:');
      report.ai.issues.forEach(issue => {
        lines.push(`  • [${issue.tag}] ${issue.title}: ${issue.desc}`);
      });
    }

    // 업계 이슈
    if (report.ai.industryIssues && report.ai.industryIssues.length > 0) {
      lines.push('- 업계 동향:');
      report.ai.industryIssues.forEach(issue => {
        lines.push(`  • [${issue.tag}] ${issue.title}: ${issue.desc}`);
      });
    }

    // 순위 변동
    if (report.ai.rankings && report.ai.rankings.length > 0) {
      lines.push('- 순위 변동:');
      report.ai.rankings.forEach(rank => {
        lines.push(`  • [${rank.tag}] ${rank.title}: ${rank.desc}`);
      });
    }

    // 커뮤니티 반응
    if (report.ai.community && report.ai.community.length > 0) {
      lines.push('- 커뮤니티:');
      report.ai.community.forEach(comm => {
        lines.push(`  • [${comm.tag}] ${comm.title}: ${comm.desc}`);
      });
    }

    // 스트리밍
    if (report.ai.streaming && report.ai.streaming.length > 0) {
      lines.push('- 스트리밍:');
      report.ai.streaming.forEach(stream => {
        lines.push(`  • [${stream.tag}] ${stream.title}`);
      });
    }

    // 게임주
    if (report.ai.stocks && report.ai.stocks.length > 0) {
      lines.push('- 주목 게임주:');
      report.ai.stocks.forEach(stock => {
        lines.push(`  • ${stock.name}: ${stock.comment}`);
      });
    }
  });

  // 주간 통계 요약
  lines.push('\n### 주간 통계:');

  // 언급된 게임 빈도 집계
  const gameMentions = {};
  weeklyReports.forEach(report => {
    if (!report || !report.ai) return;

    // rankings에서 게임명 추출
    (report.ai.rankings || []).forEach(rank => {
      if (rank.title) {
        gameMentions[rank.title] = (gameMentions[rank.title] || 0) + 1;
      }
    });

    // community에서 게임명 추출
    (report.ai.community || []).forEach(comm => {
      if (comm.tag) {
        gameMentions[comm.tag] = (gameMentions[comm.tag] || 0) + 1;
      }
    });
  });

  const topMentionedGames = Object.entries(gameMentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topMentionedGames.length > 0) {
    lines.push('- 주간 언급 빈도 TOP 10:');
    topMentionedGames.forEach(([game, count], idx) => {
      lines.push(`  ${idx + 1}. ${game} (${count}회)`);
    });
  }

  // 업계 이슈 키워드 집계
  const industryTags = {};
  weeklyReports.forEach(report => {
    if (!report || !report.ai) return;
    (report.ai.industryIssues || []).forEach(issue => {
      if (issue.tag) {
        industryTags[issue.tag] = (industryTags[issue.tag] || 0) + 1;
      }
    });
  });

  const topIndustryTags = Object.entries(industryTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topIndustryTags.length > 0) {
    lines.push('- 업계 이슈 키워드:');
    topIndustryTags.forEach(([tag, count]) => {
      lines.push(`  • ${tag} (${count}회)`);
    });
  }

  // 뉴스 썸네일 URL 목록 (AI가 선택할 수 있도록)
  const allNews = [];
  weeklyReports.forEach(report => {
    if (report?.news) {
      const reportNews = [
        ...(report.news?.inven || []),
        ...(report.news?.ruliweb || []),
        ...(report.news?.gamemeca || []),
        ...(report.news?.thisisgame || [])
      ].filter(n => n.thumbnail && n.title);
      allNews.push(...reportNews);
    }
  });

  // 뉴스 목록 (allNews에서 최대 30개)
  const combinedNews = allNews.slice(0, 30);

  if (combinedNews.length > 0) {
    lines.push('\n### 뉴스 썸네일 URL 목록 (이슈별 thumbnail 선택용):');
    combinedNews.forEach((n, i) => lines.push(`${i + 1}. [${n.title}] → ${n.thumbnail}`));
  }

  return lines.join('\n');
}

/**
 * 주간 순위 변동 계산 (7일 전 vs 오늘)
 * @param {Object} todayReport - 오늘(또는 주말) 리포트
 * @param {Object} weekAgoReport - 7일 전 리포트
 * @returns {Object} { up: [], down: [], new: [] }
 */
function calculateWeeklyRankingChanges(todayReport, weekAgoReport) {
  if (!todayReport || !weekAgoReport) {
    return { up: [], down: [], new: [] };
  }

  if (!todayReport?.mobile?.kr || !weekAgoReport?.mobile?.kr) {
    return { up: [], down: [], new: [] };
  }

  const changes = { up: [], down: [], new: [] };

  // iOS, Android 각각 처리
  ['ios', 'android'].forEach(platform => {
    const weekAgoRankings = weekAgoReport.mobile?.kr?.[platform] || [];
    const todayRankings = todayReport.mobile?.kr?.[platform] || [];

    // 7일 전 순위 맵 (게임명 -> 순위)
    const weekAgoRankMap = {};
    weekAgoRankings.forEach(game => {
      if (game.title) {
        weekAgoRankMap[game.title] = game.rank;
      }
    });

    // 오늘 순위와 비교
    todayRankings.forEach(game => {
      if (!game.title) return;

      const prevRank = weekAgoRankMap[game.title];
      const currentRank = game.rank;
      const platformName = platform === 'ios' ? 'iOS' : 'Android';

      if (prevRank === undefined) {
        // 신규 진입 (주초에 없었음)
        if (currentRank <= 50) { // TOP50 내 신규진입만
          changes.new.push({
            tag: '신규진입',
            title: game.title,
            prevRank: null,
            rank: currentRank,
            change: 0,
            platform: platformName
          });
        }
      } else {
        const change = prevRank - currentRank;
        if (change >= 10) {
          // 급상승 (10단계 이상)
          changes.up.push({
            tag: '급상승',
            title: game.title,
            prevRank: prevRank,
            rank: currentRank,
            change: change,
            platform: platformName
          });
        } else if (change <= -10) {
          // 급하락 (10단계 이상)
          changes.down.push({
            tag: '급하락',
            title: game.title,
            prevRank: prevRank,
            rank: currentRank,
            change: change,
            platform: platformName
          });
        }
      }
    });
  });

  // 변동폭 기준 정렬
  changes.up.sort((a, b) => b.change - a.change);
  changes.down.sort((a, b) => a.change - b.change);
  changes.new.sort((a, b) => a.rank - b.rank);

  return changes;
}

/**
 * 주간 순위 변동 요약 문자열 생성
 * @param {Object} changes - { up: [], down: [], new: [] }
 * @returns {string}
 */
function buildWeeklyRankingChangeSummary(changes) {
  const lines = [];

  if (changes.up && changes.up.length > 0) {
    lines.push('### 급상승 (TOP 5):');
    changes.up.slice(0, 5).forEach(g => {
      lines.push(`- ${g.title} (${g.platform}) : ${g.prevRank}위 → ${g.rank}위 (+${g.change})`);
    });
  }

  if (changes.down && changes.down.length > 0) {
    lines.push('\n### 급하락 (TOP 5):');
    changes.down.slice(0, 5).forEach(g => {
      lines.push(`- ${g.title} (${g.platform}) : ${g.prevRank}위 → ${g.rank}위 (${g.change})`);
    });
  }

  if (changes.new && changes.new.length > 0) {
    lines.push('\n### 신규진입 (TOP 5):');
    changes.new.slice(0, 5).forEach(g => {
      lines.push(`- ${g.title} (${g.platform}) : ${g.rank}위 진입`);
    });
  }

  return lines.join('\n');
}

/**
 * 전주 인사이트 요약 문자열 생성 (반복 방지용)
 * @param {Object} prevWeekInsight - 전주 인사이트
 * @returns {string} 요약 문자열
 */
function buildPrevWeekInsightSummary(prevWeekInsight) {
  if (!prevWeekInsight) {
    return '';
  }

  const lines = ['\n\n## 반복 방지 - 전주 인사이트 (동일/유사 주제 피할 것):'];

  // summary (위클리 포커스)
  if (prevWeekInsight.summary) {
    lines.push(`- [요약] ${prevWeekInsight.summary}`);
  }

  // issues
  if (prevWeekInsight.issues && prevWeekInsight.issues.length > 0) {
    prevWeekInsight.issues.forEach(issue => {
      lines.push(`- [${issue.tag}] ${issue.title}: ${issue.desc}`);
    });
  }

  // industryIssues
  if (prevWeekInsight.industryIssues && prevWeekInsight.industryIssues.length > 0) {
    prevWeekInsight.industryIssues.forEach(issue => {
      lines.push(`- [${issue.tag}] ${issue.title}: ${issue.desc}`);
    });
  }

  // mvp
  if (prevWeekInsight.mvp) {
    lines.push(`- [MVP] ${prevWeekInsight.mvp.name}: ${prevWeekInsight.mvp.desc}`);
  }

  // community
  if (prevWeekInsight.community && prevWeekInsight.community.length > 0) {
    prevWeekInsight.community.forEach(comm => {
      lines.push(`- [커뮤니티] ${comm.title}: ${comm.desc}`);
    });
  }

  lines.push('\n→ 위 전주 리포트에서 이미 다룬 주제와 동일하거나 유사한 내용은 피하고, 새로운 관점이나 다른 이슈를 찾아주세요.');

  return lines.join('\n');
}

module.exports = {
  generateWeeklyAIInsight,
  calculateWeeklyRankingChanges
};
