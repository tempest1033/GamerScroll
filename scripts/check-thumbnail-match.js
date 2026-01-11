/**
 * 썸네일-헤드라인 매칭 전수조사
 * 히스토리에서 썸네일의 원본 뉴스 제목을 찾아 헤드라인과 비교
 */
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = './reports';
const HISTORY_DIR = './history';

// 모든 히스토리 뉴스 로드
function loadAllHistoryNews() {
  const newsMap = new Map(); // thumbnail -> {title, source, date}

  if (!fs.existsSync(HISTORY_DIR)) return newsMap;

  const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json'));

  files.forEach(file => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8'));
      const date = file.replace('.json', '');

      const sources = ['inven', 'ruliweb', 'gamemeca', 'thisisgame'];
      sources.forEach(src => {
        const news = data.news?.[src] || [];
        news.forEach(n => {
          if (n.thumbnail && n.title) {
            newsMap.set(n.thumbnail, { title: n.title, source: src, date });
          }
        });
      });
    } catch(e) {}
  });

  return newsMap;
}

// 키워드 추출
function extractKeywords(text) {
  if (!text) return [];
  return text
    .replace(/[,.'":;!?()[\]{}·]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .filter(w => !/^\d+$/.test(w));
}

// 매칭 점수 계산
function calcMatchScore(headline, newsTitle) {
  const hKeywords = extractKeywords(headline);
  const nKeywords = extractKeywords(newsTitle);

  let score = 0;
  hKeywords.forEach(hk => {
    if (newsTitle.includes(hk)) score += hk.length;
  });

  return score;
}

console.log('=== 썸네일-헤드라인 전수조사 ===\n');
console.log('히스토리 뉴스 로딩 중...');
const newsMap = loadAllHistoryNews();
console.log(`총 ${newsMap.size}개 뉴스 썸네일 로드됨\n`);

const files = fs.readdirSync(REPORTS_DIR)
  .filter(f => f.endsWith('.json') && f.indexOf('-W') === -1)
  .sort();

const results = [];

files.forEach(f => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'));
    const headline = data.ai?.headline || '';
    const thumb = data.ai?.thumbnail || '';

    if (!thumb || !headline) {
      results.push({ file: f, status: 'NO_DATA', headline, newsTitle: null, score: 0 });
      return;
    }

    // 썸네일로 원본 뉴스 찾기
    const newsInfo = newsMap.get(thumb);

    if (!newsInfo) {
      results.push({ file: f, status: 'THUMB_NOT_FOUND', headline, newsTitle: null, score: 0 });
      return;
    }

    const score = calcMatchScore(headline, newsInfo.title);

    if (score >= 6) {
      results.push({ file: f, status: 'GOOD', headline, newsTitle: newsInfo.title, score });
    } else if (score >= 3) {
      results.push({ file: f, status: 'WEAK', headline, newsTitle: newsInfo.title, score });
    } else {
      results.push({ file: f, status: 'MISMATCH', headline, newsTitle: newsInfo.title, score });
    }

  } catch(e) {
    results.push({ file: f, status: 'ERROR', headline: '', newsTitle: null, score: 0 });
  }
});

// 결과 출력
const good = results.filter(r => r.status === 'GOOD');
const weak = results.filter(r => r.status === 'WEAK');
const mismatch = results.filter(r => r.status === 'MISMATCH');
const notFound = results.filter(r => r.status === 'THUMB_NOT_FOUND');

console.log('=== 요약 ===');
console.log(`✅ 양호 (score>=6): ${good.length}`);
console.log(`⚠️ 약함 (score 3-5): ${weak.length}`);
console.log(`❌ 불일치 (score<3): ${mismatch.length}`);
console.log(`🔍 썸네일 못찾음: ${notFound.length}`);
console.log('');

if (mismatch.length > 0) {
  console.log('=== ❌ 불일치 목록 (수정 필요) ===');
  mismatch.forEach(r => {
    console.log(`\n📛 ${r.file} (점수: ${r.score})`);
    console.log(`   헤드라인: ${r.headline.substring(0, 50)}`);
    console.log(`   뉴스제목: ${r.newsTitle?.substring(0, 50)}`);
  });
}

if (weak.length > 0) {
  console.log('\n=== ⚠️ 약한 매칭 (확인 필요) ===');
  weak.forEach(r => {
    console.log(`\n⚠️ ${r.file} (점수: ${r.score})`);
    console.log(`   헤드라인: ${r.headline.substring(0, 50)}`);
    console.log(`   뉴스제목: ${r.newsTitle?.substring(0, 50)}`);
  });
}
