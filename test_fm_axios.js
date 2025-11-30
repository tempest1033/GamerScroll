const axios = require('axios');

async function test() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
  
  console.log('axios로 FMKorea 시도...');
  try {
    const res = await axios.get('https://www.fmkorea.com/best2', { 
      headers,
      timeout: 15000
    });
    
    if (res.data.includes('li_best2')) {
      console.log('✅ 성공!');
    } else if (res.data.includes('cf-turnstile') || res.data.includes('Checking')) {
      console.log('❌ Cloudflare 차단');
    } else {
      console.log('❓ 알 수 없음');
    }
    console.log('HTML 샘플:', res.data.substring(0, 500));
  } catch(e) {
    console.log('에러:', e.message);
  }
}

test();
