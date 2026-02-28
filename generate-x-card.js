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

  // 최신 AI 인사이트 파일 찾기 (KST 기준)
  const reportsDir = './docs/reports';
  const reportsSrcDir = './reports';
  const getKSTDate = (offset = 0) => {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000) + (offset * 86400000));
    return kst.toISOString().split('T')[0];
  };
  const today = getKSTDate();
  const yesterday = getKSTDate(-1);

  // ai 필드가 있는 리포트 찾기 (docs/reports → reports 폴백)
  const candidates = [
    `${reportsDir}/${today}.json`,
    `${reportsSrcDir}/${today}.json`,
    `${reportsDir}/${yesterday}.json`,
    `${reportsSrcDir}/${yesterday}.json`
  ];

  let insightPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data.ai?.issues?.length > 0) {
          insightPath = p;
          break;
        }
      } catch (e) {}
    }
  }

  // ai 없으면 파일 존재만으로 폴백 (기존 동작 유지)
  if (!insightPath) {
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        insightPath = p;
        break;
      }
    }
  }

  if (!insightPath) {
    console.error('❌ 인사이트 리포트 파일이 없습니다.');
    process.exit(1);
  }

  console.log(`📄 리포트 파일: ${insightPath}`);
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

  // HTML 생성 (ai 안에 issues가 있음)
  const html = generateXCardHtml({
    date: insightData.date,
    issues: insightData.ai?.issues || []
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

  // 폰트 및 이미지 로딩 대기
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

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
