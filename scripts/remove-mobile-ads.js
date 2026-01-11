/**
 * PC 버전에서 모바일 광고 제거
 * docs/ 폴더의 HTML에서 ad-card-mobile-* 클래스 div 제거
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = './docs';

function processHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      count += processHtmlFiles(filePath);
    } else if (entry.name.endsWith('.html')) {
      let html = fs.readFileSync(filePath, 'utf8');
      const originalLength = html.length;

      // 모바일 광고 컨테이너 제거
      html = html.replace(/<div class="ad-card ad-card-mobile-top">[\s\S]*?<\/div>/g, '');
      html = html.replace(/<div class="ad-card ad-card-mobile-mid">[\s\S]*?<\/div>/g, '');

      if (html.length !== originalLength) {
        fs.writeFileSync(filePath, html);
        count++;
      }
    }
  }

  return count;
}

console.log('🖥️ PC 버전에서 모바일 광고 제거 중...');
const processed = processHtmlFiles(DOCS_DIR);
console.log(`✅ ${processed}개 파일에서 모바일 광고 제거 완료`);
