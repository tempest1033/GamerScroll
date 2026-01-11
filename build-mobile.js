/**
 * 모바일 버전 빌드 - 심플 버전
 * docs/ 복사 → URL 변환 → docs-mobile/
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = './docs';
const DEST_DIR = './docs-mobile';

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function processHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      count += processHtmlFiles(filePath);
    } else if (entry.name.endsWith('.html')) {
      let html = fs.readFileSync(filePath, 'utf8');

      // URL 변환: gamerscrawl.com → m.gamerscrawl.com
      html = html.replace(/https:\/\/gamerscrawl\.com/g, 'https://m.gamerscrawl.com');

      // PC 광고 컨테이너 제거 (ad-pc-only, ad-card-pc, ad-card-pc-home, ad-card-vertical, ad-card-rectangle)
      html = html.replace(/<div class="ad-card ad-card-pc[^"]*">[\s\S]*?<\/div>/g, '');
      html = html.replace(/<div class="ad-card ad-card-vertical">[\s\S]*?<\/div>/g, '');
      html = html.replace(/<div class="ad-card ad-card-rectangle">[\s\S]*?<\/div>/g, '');

      // 사이드바 제거 (PC 전용)
      html = html.replace(/<aside class="home-sidebar">[\s\S]*?<\/aside>/g, '');

      // 모바일 광고 인라인 스타일 단순화 (media query 제거)
      html = html.replace(/<style>\.adslot-mobile-top\{display:block;width:320px;height:100px\}@media\(min-width:769px\)\{\.adslot-mobile-top\{display:none\}\}<\/style>/g, '');
      html = html.replace(/<style>\.adslot-mobile-mid\{display:block;width:300px;height:250px\}@media\(min-width:769px\)\{\.adslot-mobile-mid\{display:none\}\}<\/style>/g, '');

      // 모바일 광고 ins 태그 단순화
      html = html.replace(/class="adsbygoogle adslot-mobile-top"/g, 'class="adsbygoogle" style="display:block;width:320px;height:100px"');
      html = html.replace(/class="adsbygoogle adslot-mobile-mid"/g, 'class="adsbygoogle" style="display:block;width:300px;height:250px"');

      fs.writeFileSync(filePath, html);
      count++;
    }
  }

  return count;
}

console.log('📱 모바일 버전 빌드 시작...\n');

// 기존 docs-mobile 삭제
if (fs.existsSync(DEST_DIR)) {
  fs.rmSync(DEST_DIR, { recursive: true });
  console.log('🗑️  기존 docs-mobile 삭제');
}

// docs 복사
console.log('📦 docs/ → docs-mobile/ 복사 중...');
copyDirSync(SRC_DIR, DEST_DIR);
console.log('  ✅ 복사 완료\n');

// HTML 파일 처리
console.log('🔄 HTML 파일 처리 중...');
const htmlCount = processHtmlFiles(DEST_DIR);
console.log(`  ✅ ${htmlCount}개 HTML 파일 처리 완료\n`);

// CNAME 설정
fs.writeFileSync(path.join(DEST_DIR, 'CNAME'), 'm.gamerscrawl.com');
console.log('✅ CNAME 설정 (m.gamerscrawl.com)');

// sitemap URL 변환
const sitemapPath = path.join(DEST_DIR, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  sitemap = sitemap.replace(/https:\/\/gamerscrawl\.com/g, 'https://m.gamerscrawl.com');
  fs.writeFileSync(sitemapPath, sitemap);
  console.log('✅ sitemap.xml URL 변환');
}

// robots.txt
fs.writeFileSync(path.join(DEST_DIR, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: https://m.gamerscrawl.com/sitemap.xml`);
console.log('✅ robots.txt 생성');

console.log('\n✅ 모바일 빌드 완료! (docs-mobile/)');
