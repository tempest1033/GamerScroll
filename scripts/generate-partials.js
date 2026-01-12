/**
 * SPA용 partial HTML 파일 생성
 * - 각 페이지에서 <main class="site-container">...</main> 내용 추출
 * - /partials/ 디렉토리에 저장
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = './docs';
const PARTIALS_DIR = './docs/partials';

// SPA 지원 페이지 목록
const SPA_PAGES = [
  { name: 'home', file: 'index.html' },
  { name: 'trend', file: 'trend/index.html' },
  { name: 'games', file: 'games/index.html' },
  { name: 'rankings', file: 'rankings/index.html' },
  { name: 'steam', file: 'steam/index.html' },
  { name: 'youtube', file: 'youtube/index.html' },
  { name: 'upcoming', file: 'upcoming/index.html' },
  { name: 'metacritic', file: 'metacritic/index.html' },
  { name: 'news', file: 'news/index.html' }
];

/**
 * HTML에서 <main class="site-container">...</main> 내용 추출
 */
function extractMainContent(html) {
  // <main class="site-container"> 찾기
  const mainStartMatch = html.match(/<main\s+class="site-container"[^>]*>/i);
  if (!mainStartMatch) {
    console.warn('  ⚠️ <main class="site-container"> 태그를 찾을 수 없음');
    return null;
  }

  const mainStartIndex = mainStartMatch.index + mainStartMatch[0].length;

  // </main> 찾기
  const mainEndIndex = html.indexOf('</main>', mainStartIndex);
  if (mainEndIndex === -1) {
    console.warn('  ⚠️ </main> 태그를 찾을 수 없음');
    return null;
  }

  // 내용 추출
  let content = html.substring(mainStartIndex, mainEndIndex);

  // 페이지별 인라인 스크립트도 추출 (pageScripts)
  // </main> 이후부터 </body> 전까지의 스크립트 중 페이지 전용 스크립트 찾기
  const afterMain = html.substring(mainEndIndex);
  const pageScriptMatch = afterMain.match(/<script>\s*\/\/\s*각\s*(섹션|뉴스|트렌드|페이지)[\s\S]*?<\/script>/gi);

  if (pageScriptMatch) {
    content += '\n' + pageScriptMatch.join('\n');
  }

  return content.trim();
}

/**
 * Partial 파일 생성
 */
function generatePartials() {
  console.log('🔧 SPA Partial 파일 생성 시작...\n');

  // partials 디렉토리 생성
  if (!fs.existsSync(PARTIALS_DIR)) {
    fs.mkdirSync(PARTIALS_DIR, { recursive: true });
    console.log(`📁 ${PARTIALS_DIR} 디렉토리 생성\n`);
  }

  let successCount = 0;
  let failCount = 0;

  for (const page of SPA_PAGES) {
    const srcPath = path.join(DOCS_DIR, page.file);
    const destPath = path.join(PARTIALS_DIR, `${page.name}.html`);

    console.log(`📄 ${page.name}: ${page.file}`);

    if (!fs.existsSync(srcPath)) {
      console.log(`  ⚠️ 소스 파일 없음: ${srcPath}`);
      failCount++;
      continue;
    }

    try {
      const html = fs.readFileSync(srcPath, 'utf8');
      const content = extractMainContent(html);

      if (content) {
        fs.writeFileSync(destPath, content);
        const sizeKB = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
        console.log(`  ✅ 생성됨: ${destPath} (${sizeKB}KB)`);
        successCount++;
      } else {
        console.log(`  ❌ 콘텐츠 추출 실패`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ 에러: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n✅ 완료: ${successCount}개 성공, ${failCount}개 실패`);
}

// 실행
generatePartials();
