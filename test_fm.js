const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function test() {
  const browser = await chromium.launch({ headless: true });
  
  // 방법 1: 더 많은 헤더 추가
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  });
  
  const page = await context.newPage();
  
  console.log('FMKorea 접속 시도...');
  await page.goto('https://www.fmkorea.com/best2', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  
  if (html.includes('li_best2')) {
    console.log('✅ 성공! li_best2 발견');
  } else if (html.includes('보안 시스템') || html.includes('Checking your browser')) {
    console.log('❌ Cloudflare 차단');
  } else {
    console.log('❓ 알 수 없는 상태');
  }
  
  // HTML 일부 출력
  console.log('\n--- HTML 샘플 (500자) ---');
  console.log(html.substring(0, 500));
  
  await browser.close();
}

test().catch(e => console.error('에러:', e.message));
