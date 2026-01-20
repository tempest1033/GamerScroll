/**
 * 모바일 버전 빌드
 * generate-html-report.js --mobile 실행 → 모바일 전용 HTML 생성
 * layout-mobile.js의 실시간 드래그 스와이프 적용
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📱 모바일 버전 빌드 시작...\n');

// 퀵 모드 여부 확인 (인자 전달)
const args = process.argv.slice(2);
const isQuick = args.includes('--quick') || args.includes('-q');
const quickFlag = isQuick ? '-q' : '';

try {
  // 1. generate-html-report.js --mobile 실행
  const cmd = `node generate-html-report.js ${quickFlag} --mobile`.trim();
  console.log(`🔄 실행: ${cmd}\n`);

  execSync(cmd, {
    stdio: 'inherit',
    cwd: __dirname
  });

  // 2. 이미지 폴더 동기화 (docs → docs-mobile)
  const syncImageDirs = [
    { src: 'docs/assets/images/wiki', dest: 'docs-mobile/assets/images/wiki' },
    { src: 'docs/assets/images/issue', dest: 'docs-mobile/assets/images/issue' }
  ];

  for (const { src, dest } of syncImageDirs) {
    const srcPath = path.join(__dirname, src);
    const destPath = path.join(__dirname, dest);
    if (fs.existsSync(srcPath)) {
      fs.mkdirSync(destPath, { recursive: true });
      const copyDirRecursive = (s, d) => {
        fs.mkdirSync(d, { recursive: true });
        for (const item of fs.readdirSync(s)) {
          const srcItem = path.join(s, item);
          const destItem = path.join(d, item);
          if (fs.statSync(srcItem).isDirectory()) {
            copyDirRecursive(srcItem, destItem);
          } else {
            fs.copyFileSync(srcItem, destItem);
          }
        }
      };
      copyDirRecursive(srcPath, destPath);
      console.log(`✅ 이미지 동기화: ${src} → ${dest}`);
    }
  }

  // 3. 게임 페이지 생성 (모바일용)
  console.log('\n🎮 모바일 게임 페이지 생성...\n');
  execSync('node scripts/generate-game-pages.js', {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env, MOBILE_BUILD: 'true' }
  });

  console.log('\n✅ 모바일 빌드 완료! (docs-mobile/)');
} catch (error) {
  console.error('\n❌ 모바일 빌드 실패:', error.message);
  process.exit(1);
}
