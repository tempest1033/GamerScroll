require('dotenv').config();
const { FirecrawlClient } = require('@mendable/firecrawl-js');

async function test() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.log('FIRECRAWL_API_KEY 없음');
    return;
  }
  
  console.log('Firecrawl로 FMKorea 시도...');
  const firecrawl = new FirecrawlClient({ apiKey });
  
  try {
    const result = await firecrawl.scrape('https://www.fmkorea.com/best2', { 
      formats: ['html'] 
    });
    
    if (result && result.html) {
      console.log('✅ HTML 수신 성공!');
      console.log('길이:', result.html.length);
      
      if (result.html.includes('li_best2')) {
        console.log('✅ li_best2 클래스 발견 - 크롤링 성공!');
      } else if (result.html.includes('보안 시스템')) {
        console.log('❌ Cloudflare 차단');
      } else {
        console.log('❓ 알 수 없는 상태');
      }
      
      console.log('\n--- HTML 샘플 (1000자) ---');
      console.log(result.html.substring(0, 1000));
    } else {
      console.log('❌ 결과 없음');
      console.log('result:', result);
    }
  } catch (e) {
    console.log('에러:', e.message);
  }
}

test();
