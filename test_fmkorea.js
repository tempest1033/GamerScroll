const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto('https://www.fmkorea.com/best2', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(5000);
    
    const html = await page.content();
    
    if (html.includes('보안 시스템') || html.includes('Cloudflare')) {
      console.log('BLOCKED: Cloudflare 차단');
    } else if (html.includes('li_best2')) {
      console.log('SUCCESS: 페이지 로드 성공!');
      console.log('HTML 길이:', html.length);
    } else {
      console.log('UNKNOWN:', html.substring(0, 500));
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  
  await browser.close();
})();
