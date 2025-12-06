/**
 * X(Twitter) 카드 이미지 생성 스크립트
 * AI 인사이트 데이터를 기반으로 이미지 생성
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { generateXCardHtml } = require('./src/templates/x-card-template');

const OUTPUT_DIR = './docs/images';
const TEMP_HTML = './temp-x-card.html';

async function generateXCard() {
  console.log('🎨 X 카드 이미지 생성 시작...');

  // AI 인사이트 데이터 로드
  const insightPath = './docs/daily-insight.json';
  if (!fs.existsSync(insightPath)) {
    console.error('❌ daily-insight.json 파일이 없습니다.');
    process.exit(1);
  }

  const insightData = JSON.parse(fs.readFileSync(insightPath, 'utf8'));

  // 이미 같은 날짜의 이미지가 있는지 확인
  const outputPath = path.join(OUTPUT_DIR, 'x-card-daily.png');
  const metaPath = path.join(OUTPUT_DIR, 'x-card-meta.json');

  if (fs.existsSync(outputPath) && fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.date === insightData.date) {
      console.log('⏭️ 같은 날짜의 X 카드가 이미 존재합니다. 스킵.');
      return outputPath;
    }
  }

  // HTML 생성
  const html = generateXCardHtml({
    date: insightData.date,
    issues: insightData.issues
  });

  // 임시 HTML 파일 저장
  fs.writeFileSync(TEMP_HTML, html, 'utf8');
  console.log('📝 임시 HTML 생성 완료');

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Playwright로 스크린샷
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1200, height: 675 });
  await page.goto(`file://${path.resolve(TEMP_HTML)}`);

  // 폰트 로딩 대기
  await page.waitForTimeout(1000);

  const outputPath = path.join(OUTPUT_DIR, 'x-card-daily.png');
  await page.screenshot({
    path: outputPath,
    type: 'png'
  });

  await browser.close();

  // 임시 파일 삭제
  fs.unlinkSync(TEMP_HTML);

  // 메타 정보 저장 (중복 생성 방지용)
  fs.writeFileSync(metaPath, JSON.stringify({
    date: insightData.date,
    generatedAt: new Date().toISOString()
  }), 'utf8');

  console.log(`✅ X 카드 이미지 생성 완료: ${outputPath}`);
  return outputPath;
}

// 직접 실행 시
if (require.main === module) {
  generateXCard().catch(err => {
    console.error('❌ 이미지 생성 실패:', err);
    process.exit(1);
  });
}

module.exports = { generateXCard };
