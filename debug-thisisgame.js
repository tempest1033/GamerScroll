const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  console.log('페이지 로드 중...');
  await page.goto('https://www.thisisgame.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  console.log('페이지 로드 완료');

  // 모든 a[href*="/articles/"] 링크에서 제목 추출
  const allArticles = await page.evaluate(() => {
    const results = [];
    const articleCards = document.querySelectorAll('a[href*="/articles/"]');
    
    console.log('총 기사 링크 수:', articleCards.length);
    
    articleCards.forEach((link, idx) => {
      const href = link.getAttribute('href');
      if (!href || href.includes('newsId=') || href.includes('categoryId=') || href.includes('community')) {
        return;
      }
      
      const pTag = link.querySelector('p');
      let title = '';
      let titleSource = '';
      
      if (pTag) {
        title = pTag.textContent.trim();
        titleSource = 'p-tag';
      } else {
        title = link.textContent.trim();
        titleSource = 'link-text';
      }
      
      title = title.split('\n')[0].trim();
      
      if (title.includes('ssss')) {
        results.push({
          idx: idx,
          href: href,
          title: title,
          titleSource: titleSource,
          titleLength: title.length
        });
      }
    });
    
    return results;
  });

  console.log('\n=== PROBLEM ARTICLES ===');
  console.log(`Found ${allArticles.length} articles with "ssss" pattern`);
  allArticles.forEach(article => {
    console.log('\n제목:', article.title);
    console.log('길이:', article.titleLength);
    console.log('소스:', article.titleSource);
    console.log('링크:', article.href);
  });
  
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
