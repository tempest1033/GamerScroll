require('dotenv').config();
const { FirecrawlClient } = require('@mendable/firecrawl-js');

async function test() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const firecrawl = new FirecrawlClient({ apiKey });
  
  // 방법 1: 모바일 URL
  console.log('1. 모바일 URL 시도...');
  try {
    const r1 = await firecrawl.scrape('https://m.fmkorea.com/best2', { formats: ['html'] });
    if (r1?.html?.includes('li_best2') || r1?.html?.includes('title')) {
      console.log('✅ 모바일 성공!');
      console.log(r1.html.substring(0, 500));
    } else {
      console.log('❌ 모바일 실패');
    }
  } catch(e) { console.log('모바일 에러:', e.message); }
  
  // 방법 2: 다른 베스트 페이지
  console.log('\n2. best 페이지 시도...');
  try {
    const r2 = await firecrawl.scrape('https://www.fmkorea.com/best', { formats: ['html'] });
    if (r2?.html?.includes('li_best') || r2?.html?.includes('title_wrapper')) {
      console.log('✅ best 성공!');
      console.log(r2.html.substring(0, 500));
    } else {
      console.log('❌ best 실패');
    }
  } catch(e) { console.log('best 에러:', e.message); }
  
  // 방법 3: RSS 피드
  console.log('\n3. RSS 피드 시도...');
  try {
    const r3 = await firecrawl.scrape('https://www.fmkorea.com/rss', { formats: ['html'] });
    console.log('RSS 결과:', r3?.html?.substring(0, 500) || '없음');
  } catch(e) { console.log('RSS 에러:', e.message); }
}

test();
