/**
 * 기존 주간 리포트에 썸네일 채워넣기
 */
const fs = require('fs');
const path = require('path');

const WEEKLY_DIR = './reports/weekly';
const HISTORY_DIR = './history';

// 히스토리에서 모든 뉴스 로드
function loadAllHistoryNews() {
  const news = [];
  if (!fs.existsSync(HISTORY_DIR)) return news;
  
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8'));
      const fileNews = [
        ...(data?.news?.inven || []),
        ...(data?.news?.ruliweb || []),
        ...(data?.news?.gamemeca || []),
        ...(data?.news?.thisisgame || [])
      ].filter(n => n.thumbnail && n.title);
      news.push(...fileNews);
    } catch (e) {}
  }
  return news;
}

// 키워드 추출
function extractKeywords(text) {
  const stopWords = ['의', '가', '이', '은', '는', '을', '를', '에', '와', '과', '로', '으로', '에서', '까지', '부터', '처럼', '만', '도', '등', '및', '그', '저', '급', '위', '일', '월', '년', '주간', '지난주', '오늘', '어제'];
  
  return text
    .replace(/[,.'":;!?()[\]{}~`@#$%^&*+=|\\/<>]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .filter(w => !stopWords.includes(w))
    .filter(w => !/^\d+$/.test(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);
}

// 썸네일 매칭
function findThumbnail(title, allNews) {
  const keywords = extractKeywords(title);
  
  // 정확 매칭
  for (const keyword of keywords) {
    const match = allNews.find(n => n.title.includes(keyword));
    if (match) return match.thumbnail;
  }
  
  // 유사 매칭
  let bestMatch = null;
  let bestScore = 0;
  for (const news of allNews) {
    let score = 0;
    for (const keyword of keywords) {
      if (news.title.includes(keyword)) score += 2;
      else if (keyword.length >= 3 && news.title.includes(keyword.substring(0, 3))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = news;
    }
  }
  
  return bestMatch && bestScore > 0 ? bestMatch.thumbnail : null;
}

// 메인
const allNews = loadAllHistoryNews();
console.log(`히스토리 뉴스 로드: ${allNews.length}개`);

const weeklyFiles = fs.readdirSync(WEEKLY_DIR).filter(f => f.endsWith('.json'));

for (const file of weeklyFiles) {
  const filePath = path.join(WEEKLY_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let modified = false;
  
  // issues
  if (data.ai?.issues) {
    data.ai.issues = data.ai.issues.map(item => {
      if (!item.thumbnail) {
        const thumb = findThumbnail(item.title, allNews);
        if (thumb) {
          modified = true;
          return { ...item, thumbnail: thumb };
        }
      }
      return item;
    });
  }
  
  // industryIssues
  if (data.ai?.industryIssues) {
    data.ai.industryIssues = data.ai.industryIssues.map(item => {
      if (!item.thumbnail) {
        const thumb = findThumbnail(item.title, allNews);
        if (thumb) {
          modified = true;
          return { ...item, thumbnail: thumb };
        }
      }
      return item;
    });
  }
  
  // metrics
  if (data.ai?.metrics) {
    data.ai.metrics = data.ai.metrics.map(item => {
      if (!item.thumbnail) {
        const thumb = findThumbnail(item.title, allNews);
        if (thumb) {
          modified = true;
          return { ...item, thumbnail: thumb };
        }
      }
      return item;
    });
  }
  
  if (modified) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ ${file} 업데이트 완료`);
  } else {
    console.log(`⏭️ ${file} 변경 없음`);
  }
}

console.log('\n완료!');
