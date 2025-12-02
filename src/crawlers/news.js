// 뉴스 제목에서 게임 태그 추출
function extractGameTag(title) {
  const articleTypes = /^(리뷰|프리뷰|체험기|인터뷰|기획|취재|영상|종합|코드\s*이벤트|순정남|이구동성|포토|오늘의\s*스팀|방구석게임|보드게임|성지순례|기승전결|판례|순위분석|인디言|이슈|메카\s*만평)[①②③④⑤⑥⑦⑧⑨⑩]?\s*$/i;
  const nonGameKeywords = /^(노쇼|버그|업데이트|출시|공개|발표|이벤트|시즌|패치|콜라보|협업|대회|행사|기자|PD|감독|작가|대표|회장|원작자|참여|개발|서비스|종료|오픈|런칭|신작|기대작|인기|순위|랭킹|리뷰|프리뷰|체험|인터뷰|분석|정리|요약|특집|연재|만평|갤러리|커뮤니티|팸|\d+일|\d+월|\d+년|\d+시간|\d+분)$/i;

  // 1. [대괄호] 안의 게임명 추출
  const bracketMatch = title.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    let tag = bracketMatch[1].trim();
    if (!articleTypes.test(tag)) {
      tag = tag.replace(/\s*(리뷰|프리뷰|체험기|인터뷰|기획|취재|영상|종합|코드\s*이벤트|순정남|이구동성|포토|오늘의\s*스팀|방구석게임)[①②③④⑤⑥⑦⑧⑨⑩]?\s*$/gi, '').trim();
      if (tag && tag.length >= 2 && tag.length <= 20 && !/^\d+$/.test(tag) && !nonGameKeywords.test(tag)) {
        return tag;
      }
    }
  }

  // 2. 작은따옴표 안의 내용 추출
  const quoteMatch = title.match(/['']([^'']+)['']/);
  if (quoteMatch) {
    const tag = quoteMatch[1].trim();
    if (tag && tag.length >= 2 && tag.length <= 20 && !/^\d+$/.test(tag) && !nonGameKeywords.test(tag)) {
      return tag;
    }
  }

  // 3. 쉼표 앞 부분 추출
  const commaMatch = title.match(/^([가-힣A-Za-z0-9\s:]+),/);
  if (commaMatch) {
    const tag = commaMatch[1].trim();
    if (tag && tag.length >= 2 && tag.length <= 12 && /^[가-힣]/.test(tag) && !/^\d+$/.test(tag) && !nonGameKeywords.test(tag)) {
      return tag;
    }
  }

  return '';
}

// 뉴스 크롤링
async function fetchNews(axios, cheerio) {
  const newsBySource = {
    inven: [],
    ruliweb: [],
    gamemeca: [],
    thisisgame: []
  };

  // 인벤 인기뉴스
  try {
    const res = await axios.get('https://www.inven.co.kr/webzine/news/?hotnews=1', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    $('a[href*="/webzine/news/?news="]').each((i, el) => {
      if (newsBySource.inven.length >= 15) return false;
      const href = $(el).attr('href');
      if (!href) return;

      const titleEl = $(el).find('span.cols.title');
      if (!titleEl.length) return;

      // 썸네일 추출 (부모 요소에서)
      let thumbnail = $(el).closest('li').find('img').attr('src') || $(el).find('img').attr('src') || '';
      if (thumbnail && !thumbnail.startsWith('http')) {
        thumbnail = 'https://www.inven.co.kr' + thumbnail;
      }

      let rawTitle = titleEl.clone().children('.cmtnum').remove().end().text().trim();
      rawTitle = rawTitle.split('\n')[0].trim();
      const tag = extractGameTag(rawTitle);
      let title = rawTitle.replace(/\[.*?\]/g, '').replace(/^HOT\s*/i, '').trim();

      if (title && title.length > 10 && !newsBySource.inven.find(n => n.title === title)) {
        newsBySource.inven.push({
          title: title.substring(0, 55),
          link: href.startsWith('http') ? href : 'https://www.inven.co.kr' + href,
          tag: tag,
          thumbnail: thumbnail
        });
      }
    });
    console.log(`  인벤 인기뉴스: ${newsBySource.inven.length}개`);
  } catch (e) {
    console.log('  인벤 뉴스 실패:', e.message);
  }

  // 루리웹 게임뉴스 RSS
  try {
    const res = await axios.get('http://bbs.ruliweb.com/news/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    $('item').slice(0, 15).each((i, el) => {
      const rawTitle = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim();
      const tag = extractGameTag(rawTitle);
      const title = rawTitle.replace(/\[.*?\]/g, '').trim();

      // description에서 이미지 추출
      const desc = $(el).find('description').text();
      const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      const thumbnail = imgMatch ? imgMatch[1] : '';

      if (title && link) {
        newsBySource.ruliweb.push({ title: title.substring(0, 55), link, tag, thumbnail });
      }
    });
    console.log(`  루리웹: ${newsBySource.ruliweb.length}개`);
  } catch (e) {
    console.log('  루리웹 뉴스 실패:', e.message);
  }

  // 게임메카 인기뉴스
  try {
    const res = await axios.get('https://www.gamemeca.com/news.php', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    $('strong.tit_thumb a, strong.tit_thumb_h a').each((i, el) => {
      if (newsBySource.gamemeca.length >= 15) return false;
      const rawTitle = $(el).text().trim();
      const link = $(el).attr('href');
      if (!rawTitle || !link) return;

      // 썸네일 추출 (부모 li에서)
      let thumbnail = $(el).closest('li').find('img').attr('src') || '';
      if (thumbnail && !thumbnail.startsWith('http')) {
        thumbnail = 'https://www.gamemeca.com' + thumbnail;
      }

      const tag = extractGameTag(rawTitle);
      const cleanTitle = rawTitle.replace(/\[.*?\]/g, '').trim().split('\n')[0];

      if (cleanTitle && cleanTitle.length > 10 && !newsBySource.gamemeca.find(n => n.title === cleanTitle)) {
        newsBySource.gamemeca.push({
          title: cleanTitle.substring(0, 55),
          link: link.startsWith('http') ? link : 'https://www.gamemeca.com' + link,
          tag: tag,
          thumbnail: thumbnail
        });
      }
    });
    console.log(`  게임메카: ${newsBySource.gamemeca.length}개`);
  } catch (e) {
    console.log('  게임메카 뉴스 실패:', e.message);
  }

  // 디스이즈게임 인기뉴스 (puppeteer 사용 - Next.js 앱)
  try {
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('https://www.thisisgame.com/', { waitUntil: 'networkidle2', timeout: 30000 });

    // 페이지에서 기사 정보 추출 (PC 그리드 영역의 카드만 수집)
    const articles = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // PC 그리드 영역의 기사 카드 수집 (div.relative > a 구조에서 img가 직접 있는 것)
      // 각 기사 카드는 div.relative 안에 a 태그와 img가 함께 있음
      const articleCards = document.querySelectorAll('div.relative > a[href*="/articles/"]');

      articleCards.forEach(link => {
        if (results.length >= 15) return;
        const href = link.getAttribute('href');
        if (!href || href.includes('newsId=') || href.includes('categoryId=') || href.includes('community')) return;

        const fullLink = href.startsWith('http') ? href : 'https://www.thisisgame.com' + href;
        if (seen.has(fullLink)) return;

        // 링크 내부의 img만 사용 (다른 기사의 이미지를 가져오지 않도록)
        const img = link.querySelector('img');
        if (!img || !img.src) return; // 이미지 없는 링크는 스킵

        const thumbnail = img.src;

        // 제목 추출 - p 태그에서
        const pTag = link.querySelector('p');
        let title = '';
        if (pTag) {
          title = pTag.textContent.trim();
        } else {
          // p 태그가 없으면 링크 텍스트에서 (이미지 alt 제외)
          title = link.textContent.trim();
        }
        title = title.split('\n')[0].trim();

        if (title && title.length > 10 && title.length < 100) {
          seen.add(fullLink);
          results.push({
            title: title.substring(0, 55),
            link: fullLink,
            thumbnail: thumbnail
          });
        }
      });

      return results;
    });

    await browser.close();

    // 결과 저장
    articles.forEach(article => {
      const tag = extractGameTag(article.title);
      newsBySource.thisisgame.push({
        ...article,
        title: article.title.replace(/\[.*?\]/g, '').trim(),
        tag: tag
      });
    });

    console.log(`  디스이즈게임: ${newsBySource.thisisgame.length}개 (썸네일: ${newsBySource.thisisgame.filter(n => n.thumbnail).length}개)`);
  } catch (e) {
    console.log('  디스이즈게임 뉴스 실패:', e.message);
  }

  return newsBySource;
}

module.exports = { fetchNews, extractGameTag };
