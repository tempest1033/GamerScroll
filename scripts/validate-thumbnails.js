/**
 * 썸네일 매칭 검증 스크립트
 */
const fs = require('fs');

console.log('=== 썸네일 매칭 검증 ===\n');

const files = fs.readdirSync('reports')
  .filter(f => f.endsWith('.json') && f.indexOf('-W') === -1)
  .sort();

const issues = [];

files.forEach(f => {
  try {
    const data = JSON.parse(fs.readFileSync('reports/' + f, 'utf8'));
    const headline = data.ai?.headline || '';
    const thumb = data.ai?.thumbnail || '';

    if (!thumb) {
      issues.push({ file: f, issue: 'NO_THUMB', headline });
      return;
    }

    // 헤드라인에서 주요 키워드 추출
    const keywords = headline
      .replace(/[,.'":;!?()[\]{}]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .slice(0, 5);

    // 뉴스 데이터에서 해당 썸네일의 원본 제목 찾기
    let matchedTitle = null;

    const allNews = [
      ...(data.news?.inven || []),
      ...(data.news?.ruliweb || []),
      ...(data.news?.gamemeca || []),
      ...(data.news?.thisisgame || [])
    ];

    const newsMatch = allNews.find(n => n.thumbnail === thumb);
    if (newsMatch) {
      matchedTitle = newsMatch.title;
    }

    // 키워드와 뉴스 제목 비교
    let matchScore = 0;
    if (matchedTitle) {
      keywords.forEach(kw => {
        if (matchedTitle.includes(kw)) matchScore++;
      });
    }

    // 매칭 점수가 0이면 문제로 기록
    if (matchScore === 0 && matchedTitle) {
      issues.push({
        file: f,
        issue: 'MISMATCH',
        headline: headline.substring(0, 45),
        newsTitle: matchedTitle?.substring(0, 45)
      });
    } else if (!matchedTitle && thumb) {
      // 썸네일은 있는데 뉴스에서 못 찾음 (히스토리에서 가져온 경우)
      issues.push({
        file: f,
        issue: 'EXTERNAL',
        headline: headline.substring(0, 45),
        thumb: thumb.substring(0, 60)
      });
    }

  } catch(e) {
    console.log('ERROR:', f, e.message);
  }
});

console.log('총 리포트:', files.length);
console.log('문제 발견:', issues.length);
console.log('');

const mismatches = issues.filter(i => i.issue === 'MISMATCH');
const externals = issues.filter(i => i.issue === 'EXTERNAL');
const noThumbs = issues.filter(i => i.issue === 'NO_THUMB');

if (mismatches.length > 0) {
  console.log('=== 불일치 (MISMATCH) ===');
  mismatches.forEach(i => {
    console.log('\n📛 ' + i.file);
    console.log('   헤드라인: ' + i.headline);
    console.log('   뉴스제목: ' + i.newsTitle);
  });
}

if (externals.length > 0) {
  console.log('\n=== 외부 소스 (검증 불가) ===');
  externals.forEach(i => {
    console.log('\n⚠️ ' + i.file);
    console.log('   헤드라인: ' + i.headline);
  });
}

if (noThumbs.length > 0) {
  console.log('\n=== 썸네일 없음 ===');
  noThumbs.forEach(i => {
    console.log('❌ ' + i.file + ': ' + i.headline);
  });
}

console.log('\n=== 요약 ===');
console.log('정상:', files.length - issues.length);
console.log('불일치:', mismatches.length);
console.log('외부소스:', externals.length);
console.log('썸네일없음:', noThumbs.length);
