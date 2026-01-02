/**
 * 리포트 썸네일 일괄 수정 스크립트
 * - thumbnail이 없는 리포트에 키워드 매칭으로 추가
 * - 헤드라인과 뉴스 제목을 비교하여 가장 관련 있는 썸네일 선택
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = './reports';
const HISTORY_DIR = './history';

// 불용어 목록
const STOP_WORDS = [
  '의', '가', '이', '은', '는', '을', '를', '에', '와', '과', '도', '로', '으로',
  '에서', '까지', '부터', '만', '보다', '처럼', '같이', '및', '등', '위', '약',
  '오늘', '어제', '내일', '올해', '작년', '이번', '지난', '최근', '현재', '금일',
  '발표', '공개', '출시', '업데이트', '진행', '예정', '확정', '논의', '시작',
  '게임', '모바일', '스팀', '동접', '매출', '순위', '급등', '급락', '상승', '하락',
  '계단', '돌파', '달성', '기록', '화제', '관심', '집중', '반응', '이슈'
];

// 키워드 추출
function extractKeywords(text) {
  if (!text) return [];

  const cleaned = text
    .replace(/[,.'":;!?()[\]{}~`@#$%^&*+=|\\/<>]/g, ' ')
    .replace(/\d+/g, ' ');

  const words = cleaned.split(/\s+/)
    .filter(w => w.length >= 2)
    .filter(w => !STOP_WORDS.includes(w))
    .filter(w => !/^\d+$/.test(w));

  // 중복 제거 후 길이순 정렬
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 8);
}

// 뉴스에서 썸네일 찾기
function findThumbnail(headline, newsData) {
  const keywords = extractKeywords(headline);
  if (keywords.length === 0) return null;

  // 모든 뉴스 수집
  const allNews = [
    ...(newsData?.news?.inven || []),
    ...(newsData?.news?.ruliweb || []),
    ...(newsData?.news?.gamemeca || []),
    ...(newsData?.news?.thisisgame || [])
  ].filter(n => n.thumbnail && n.title);

  if (allNews.length === 0) return null;

  // 1단계: 정확 매칭 (2글자 이상 키워드)
  for (const keyword of keywords) {
    if (keyword.length >= 2) {
      const match = allNews.find(n => n.title.includes(keyword));
      if (match) {
        console.log(`    매칭: "${keyword}" → ${match.title.substring(0, 30)}...`);
        return match.thumbnail;
      }
    }
  }

  // 2단계: 점수 기반 매칭
  let bestMatch = null;
  let bestScore = 0;

  for (const news of allNews) {
    let score = 0;
    for (const keyword of keywords) {
      if (news.title.includes(keyword)) {
        score += keyword.length; // 긴 키워드에 더 높은 점수
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = news;
    }
  }

  if (bestMatch && bestScore >= 3) {
    console.log(`    유사매칭(점수 ${bestScore}): ${bestMatch.title.substring(0, 30)}...`);
    return bestMatch.thumbnail;
  }

  // 3단계: 첫 번째 뉴스 썸네일 (fallback)
  console.log(`    폴백: 첫 번째 뉴스 사용`);
  return allNews[0]?.thumbnail || null;
}

// 히스토리에서 뉴스 로드
function loadHistoryNews(dateStr) {
  const historyFile = path.join(HISTORY_DIR, `${dateStr}.json`);
  if (fs.existsSync(historyFile)) {
    try {
      return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    } catch (e) {}
  }
  return null;
}

// 메인 실행
async function main() {
  console.log('=== 썸네일 수정 스크립트 ===\n');

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-W'))
    .sort();

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(REPORTS_DIR, file);

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // 이미 썸네일 있으면 스킵
      if (data.ai?.thumbnail) {
        skipped++;
        continue;
      }

      const headline = data.ai?.headline;
      if (!headline) {
        console.log(`⚠️ ${file}: 헤드라인 없음`);
        failed++;
        continue;
      }

      console.log(`\n📝 ${file}`);
      console.log(`   헤드라인: ${headline.substring(0, 50)}...`);

      // 해당 리포트의 뉴스 데이터 사용
      let thumbnail = null;

      // 리포트 자체의 뉴스 데이터 확인
      if (data.news) {
        thumbnail = findThumbnail(headline, data);
      }

      // 없으면 히스토리에서 찾기
      if (!thumbnail) {
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const historyData = loadHistoryNews(dateMatch[1]);
          if (historyData) {
            console.log(`   히스토리에서 검색: ${dateMatch[1]}.json`);
            thumbnail = findThumbnail(headline, historyData);
          }
        }
      }

      if (thumbnail) {
        data.ai.thumbnail = thumbnail;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`   ✅ 썸네일 추가됨`);
        fixed++;
      } else {
        console.log(`   ❌ 썸네일을 찾을 수 없음`);
        failed++;
      }

    } catch (e) {
      console.log(`❌ ${file}: ${e.message}`);
      failed++;
    }
  }

  console.log('\n=== 결과 ===');
  console.log(`수정됨: ${fixed}`);
  console.log(`스킵(이미 있음): ${skipped}`);
  console.log(`실패: ${failed}`);
}

main();
