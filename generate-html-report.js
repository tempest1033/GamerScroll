require('dotenv').config();
const gplay = require('google-play-scraper').default;
const store = require('app-store-scraper');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const cloudscraper = require('cloudscraper');
const { FirecrawlClient } = require('@mendable/firecrawl-js');

const countries = [
  { code: 'kr', name: '대한민국', flag: '🇰🇷' },
  { code: 'jp', name: '일본', flag: '🇯🇵' },
  { code: 'us', name: '미국', flag: '🇺🇸' },
  { code: 'cn', name: '중국', flag: '🇨🇳' },
  { code: 'tw', name: '대만', flag: '🇹🇼' }
];

// YouTube API 키 (환경변수에서 읽기)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// Firecrawl API 키 (환경변수에서 읽기)
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

// YouTube 카테고리 ID
const YOUTUBE_CATEGORIES = {
  gaming: { id: '20', name: '게임 인기' },
  music: { id: '10', name: '음악' }
};

// YouTube 인기 동영상 가져오기
async function fetchYouTubeVideos() {
  const result = {
    gaming: [],
    music: []
  };

  if (!YOUTUBE_API_KEY) {
    console.log('  YouTube API 키가 설정되지 않음 (YOUTUBE_API_KEY 환경변수 필요)');
    return result;
  }

  for (const [key, category] of Object.entries(YOUTUBE_CATEGORIES)) {
    try {
      // 일반 인기 동영상
      const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            part: 'snippet,statistics',
            chart: 'mostPopular',
            regionCode: 'KR',
            videoCategoryId: category.id,
            maxResults: 50,
            key: YOUTUBE_API_KEY
          },
          timeout: 10000
        });

      result[key] = res.data.items.map((item, i) => ({
        rank: i + 1,
        videoId: item.id,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        views: parseInt(item.statistics.viewCount) || 0,
        publishedAt: item.snippet.publishedAt
      }));
      console.log(`  YouTube ${category.name}: ${result[key].length}개`);
    } catch (e) {
      console.log(`  YouTube ${category.name} 로드 실패:`, e.response?.data?.error?.message || e.message);
    }
  }

  return result;
}

// 치지직 라이브 순위 가져오기 (게임 카테고리만)
async function fetchChzzkLives() {
  const lives = [];
  try {
    // 치지직 홈 라이브 API (더 많이 가져와서 게임만 필터링)
    const res = await axios.get('https://api.chzzk.naver.com/service/v1/home/lives', {
      params: { size: 200 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const streamingList = res.data?.content?.streamingLiveList || [];
    // 게임 카테고리만 필터링
    let rank = 1;
    for (const item of streamingList) {
      if (rank > 50) break;
      // 게임 방송만 포함 (categoryType이 GAME인 것)
      if (item.categoryType === 'GAME' || item.liveCategory === 'GAME') {
        // 썸네일 URL의 {type}을 480으로 치환
        let thumbnail = item.liveImageUrl || item.defaultThumbnailImageUrl || '';
        thumbnail = thumbnail.replace('{type}', '480');
        lives.push({
          rank: rank++,
          title: item.liveTitle || '',
          channel: item.channel?.channelName || '',
          thumbnail: thumbnail,
          viewers: item.concurrentUserCount || 0,
          category: item.liveCategoryValue || item.categoryValue || '',
          channelId: item.channel?.channelId || ''
        });
      }
    }
    console.log(`  치지직 라이브 (게임): ${lives.length}개`);
  } catch (e) {
    console.log('  치지직 라이브 로드 실패:', e.message);
  }
  return lives;
}

// 숲(SOOP) 라이브 순위 가져오기
async function fetchSoopLives() {
  const lives = [];
  try {
    // 숲 검색 API로 라이브 목록 가져오기 (시청자순)
    const res = await axios.get('https://sch.sooplive.co.kr/api.php', {
      params: {
        m: 'liveSearch',
        szOrder: 'view_cnt',
        nPageNo: 1,
        nListCnt: 50
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.sooplive.co.kr',
        'Referer': 'https://www.sooplive.co.kr/'
      },
      timeout: 10000
    });

    const data = res.data?.REAL_BROAD || [];
    data.forEach((item, i) => {
      lives.push({
        rank: i + 1,
        title: item.broad_title || '',
        channel: item.user_nick || '',
        thumbnail: item.broad_img || `https://liveimg.sooplive.co.kr/m/${item.broad_no}`,
        viewers: parseInt(item.total_view_cnt) || 0,
        category: item.broad_cate_name || '',
        odeduckId: item.user_id || ''
      });
    });
    console.log(`  숲 라이브: ${lives.length}개`);
  } catch (e) {
    console.log('  숲 라이브 로드 실패:', e.message);
  }
  return lives;
}

// 커뮤니티 인기글 크롤링 (루리웹, 아카라이브, 디시인사이드)
async function fetchCommunityPosts() {
  const result = {
    ruliweb: [],
    arca: [],
    dcinside: [],
    fmkorea: []
  };

  // 루리웹 게임 베스트 (axios + cheerio)
  try {
    const res = await axios.get('https://bbs.ruliweb.com/best/game?orderby=recommend&range=7d', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    // 먼저 목록에서 기본 정보 수집
    const tempList = [];
    $('table.board_list_table tbody tr').each((i, el) => {
      if (tempList.length >= 15) return false;
      const $el = $(el);
      const titleEl = $el.find('a.deco, a.subject_link');
      const link = titleEl.attr('href');

      // 제목 추출
      let title = '';
      const strongEl = $el.find('strong.text_over, span.text_over');
      if (strongEl.length) {
        const cloned = strongEl.clone();
        cloned.find('span.subject_tag').remove();
        title = cloned.text().trim();
      } else {
        title = titleEl.text().trim();
      }

      // 숫자만 있는 제목은 건너뛰기
      if (/^\d+$/.test(title.trim())) return;

      if (title && link) {
        tempList.push({
          title: title.substring(0, 60),
          link: link.startsWith('http') ? link : 'https://bbs.ruliweb.com' + link
        });
      }
    });

    // 각 게시물 페이지에서 게시판 이름 병렬 추출
    const boardPromises = tempList.map(async (item) => {
      try {
        const pageRes = await axios.get(item.link, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 5000
        });
        const page$ = cheerio.load(pageRes.data);
        const boardName = page$('#board_name').text().trim()
          || page$('a#board_name').text().trim();
        return { ...item, channel: boardName || '' };
      } catch {
        return { ...item, channel: '' };
      }
    });

    result.ruliweb = await Promise.all(boardPromises);
    console.log(`  루리웹 게임 베스트: ${result.ruliweb.length}개`);
  } catch (e) {
    console.log('  루리웹 게임 베스트 실패:', e.message);
  }

  // 아카라이브 베스트 라이브 (Firecrawl SDK 사용)
  try {
    if (FIRECRAWL_API_KEY) {
      const firecrawl = new FirecrawlClient({ apiKey: FIRECRAWL_API_KEY });
      const scrapeResult = await firecrawl.scrape('https://arca.live/b/live?sort=rating', { formats: ['markdown'] });

      if (scrapeResult && scrapeResult.markdown) {
        // 마크다운에서 게시물 파싱
        const md = scrapeResult.markdown;
        // 글 URL 패턴으로 찾기 - 이스케이프된 대괄호 포함
        const urlRegex = /\[((?:[^\[\]]|\\[\[\]])+)\]\((https:\/\/arca\.live\/b\/live\/\d+[^)]*)\)/g;
        const seenUrls = new Set();
        let match;

        while ((match = urlRegex.exec(md)) !== null && result.arca.length < 15) {
          const [, textRaw, url] = match;
          // 중복 URL 제외
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          // 작성자 정보 패턴 제외 (예: 꿀때지1hour ago114861)
          if (textRaw.match(/\d+\s*(hour|minute|day)s?\s*ago/i)) continue;

          // 제목 정리
          let title = textRaw
            .replace(/\\\\n/g, ' ')
            .replace(/\\\\/g, '')
            .replace(/\\n/g, ' ')
            .replace(/\\\[/g, '[')
            .replace(/\\\]/g, ']')
            .replace(/\[\d+\]$/, '')
            .trim();

          // 공지사항 제외
          if (title.includes('모바일 앱 이용 안내') || title.length === 0) continue;

          // 채널명 찾기: URL 앞 부분에서 [채널명](채널URL "설명") 패턴 검색
          const urlIdx = md.indexOf(url);
          let channel = '';
          if (urlIdx > 0) {
            // URL 앞 500자에서 채널 패턴 찾기
            const beforeText = md.substring(Math.max(0, urlIdx - 500), urlIdx);
            // 패턴: 숫자[채널명](https://arca.live/b/채널 "설명")
            const channelMatches = [...beforeText.matchAll(/\d+\[([^\]]+)\]\(https:\/\/arca\.live\/b\/\w+[^)]*\)/g)];
            if (channelMatches.length > 0) {
              // 가장 마지막(가장 가까운) 매치 사용
              channel = channelMatches[channelMatches.length - 1][1];
            }
          }

          result.arca.push({
            title: title.length > 50 ? title.substring(0, 50) + '...' : title,
            link: url,
            channel: channel
          });
        }
      }
      console.log(`  아카라이브 베스트: ${result.arca.length}개`);
    } else {
      console.log('  아카라이브: FIRECRAWL_API_KEY 없음');
    }
  } catch (e) {
    console.log('  아카라이브 베스트 실패:', e.message);
  }

  // 디시인사이드 실시간 베스트 (Firecrawl SDK 사용)
  try {
    if (FIRECRAWL_API_KEY) {
      const firecrawl = new FirecrawlClient({ apiKey: FIRECRAWL_API_KEY });
      const scrapeResult = await firecrawl.scrape('https://gall.dcinside.com/board/lists?id=dcbest', { formats: ['markdown'] });

      if (scrapeResult && scrapeResult.markdown) {
        const md = scrapeResult.markdown;
        // 패턴: **[갤러리명]** 제목](URL)
        const postRegex = /\*\*\\\[([^\]]+)\\\]\*\*\s*([^\]]+)\]\((https:\/\/gall\.dcinside\.com\/board\/view\/[^)]+)\)/g;
        let match;
        const seenUrls = new Set();

        while ((match = postRegex.exec(md)) !== null && result.dcinside.length < 15) {
          const [, channel, titleRaw, url] = match;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          // 제목 정리
          let title = titleRaw.trim();
          // 공지사항 제외
          if (title.includes('이용 안내') || title.length === 0) continue;

          result.dcinside.push({
            title: title.length > 50 ? title.substring(0, 50) + '...' : title,
            link: url,
            channel: channel
          });
        }
      }
      console.log(`  디시인사이드 실베: ${result.dcinside.length}개`);
    }
  } catch (e) {
    console.log('  디시인사이드 실베 실패:', e.message);
  }

  // 팸코리아 포텐 터짐 (cloudscraper - Cloudflare 우회)
  try {
    const fmHtml = await cloudscraper.get('https://www.fmkorea.com/best2');
    const fm$ = cheerio.load(fmHtml);

    fm$('li.li_best2_pop0, li.li_best2_pop1').each((i, el) => {
      if (result.fmkorea.length >= 15) return false;
      const $el = fm$(el);
      const titleEl = $el.find('h3.title a');
      const categoryEl = $el.find('.category');

      // 제목에서 댓글 수 제거 (예: "[340]" 부분)
      let title = titleEl.text().trim().replace(/\s*\[\d+\]\s*$/, '').trim();
      let link = titleEl.attr('href') || '';
      if (link && !link.startsWith('http')) {
        link = 'https://www.fmkorea.com' + link;
      }
      const channel = categoryEl.text().trim();

      if (title && link && !title.includes('공지')) {
        result.fmkorea.push({
          title: title.length > 50 ? title.substring(0, 50) + '...' : title,
          link,
          channel
        });
      }
    });

    console.log(`  팸코리아 포텐: ${result.fmkorea.length}개`);
  } catch (e) {
    console.log('  팸코리아 포텐 실패:', e.message);
  }

  return result;
}

// 뉴스 크롤링 (인기뉴스 위주) - 소스별 분리
// 뉴스 제목에서 게임 태그 추출
function extractGameTag(title) {
  // 기사 유형 키워드 (제외할 패턴)
  const articleTypes = /^(리뷰|프리뷰|체험기|인터뷰|기획|취재|영상|종합|코드\s*이벤트|순정남|이구동성|포토|오늘의\s*스팀|방구석게임|보드게임|성지순례|기승전결|판례|순위분석|인디言|이슈|메카\s*만평)[①②③④⑤⑥⑦⑧⑨⑩]?\s*$/i;

  // 비게임 키워드 (제외할 태그)
  const nonGameKeywords = /^(노쇼|버그|업데이트|출시|공개|발표|이벤트|시즌|패치|콜라보|협업|대회|행사|기자|PD|감독|작가|대표|회장|원작자|참여|개발|서비스|종료|오픈|런칭|신작|기대작|인기|순위|랭킹|리뷰|프리뷰|체험|인터뷰|분석|정리|요약|특집|연재|만평|갤러리|커뮤니티|팸|\d+일|\d+월|\d+년|\d+시간|\d+분)$/i;

  // 1. [대괄호] 안의 게임명 추출 (예: "[아이온 2 리뷰]" → "아이온 2")
  const bracketMatch = title.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    let tag = bracketMatch[1].trim();
    // 기사 유형만 있는 경우 스킵
    if (articleTypes.test(tag)) {
      // 다음 패턴 시도
    } else {
      // 기사 유형 접미사 제거
      tag = tag.replace(/\s*(리뷰|프리뷰|체험기|인터뷰|기획|취재|영상|종합|코드\s*이벤트|순정남|이구동성|포토|오늘의\s*스팀|방구석게임)[①②③④⑤⑥⑦⑧⑨⑩]?\s*$/gi, '').trim();
      if (tag && tag.length >= 2 && tag.length <= 20 && !/^\d+$/.test(tag) && !nonGameKeywords.test(tag)) {
        return tag;
      }
    }
  }

  // 2. 작은따옴표 안의 내용 추출 (예: "'워프레임'" → "워프레임")
  const quoteMatch = title.match(/['']([^'']+)['']/);
  if (quoteMatch) {
    const tag = quoteMatch[1].trim();
    if (tag && tag.length >= 2 && tag.length <= 20 && !/^\d+$/.test(tag) && !nonGameKeywords.test(tag)) {
      return tag;
    }
  }

  // 3. 쉼표 앞 부분 추출 (예: "마비노기, 대격변급..." → "마비노기")
  // 단, 앞부분이 명확한 게임명처럼 보일 때만 (한글 2-10자 또는 영문+숫자)
  const commaMatch = title.match(/^([가-힣A-Za-z0-9\s:]+),/);
  if (commaMatch) {
    const tag = commaMatch[1].trim();
    // 게임명 패턴: 한글로 시작하고 2-12자, 또는 영문 게임명
    if (tag && tag.length >= 2 && tag.length <= 12 && /^[가-힣]/.test(tag) && !/^\d+$/.test(tag) && !nonGameKeywords.test(tag)) {
      return tag;
    }
  }

  return '';
}

async function fetchNews() {
  const newsBySource = {
    inven: [],
    ruliweb: [],
    gamemeca: [],
    thisisgame: []
  };

  // 인벤 인기뉴스 스크래핑
  try {
    const res = await axios.get('https://www.inven.co.kr/webzine/news/?hotnews=1', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    // 인기뉴스 리스트에서 가져오기
    $('article a[href*="/webzine/news/?news="]').each((i, el) => {
      if (newsBySource.inven.length >= 15) return false;
      const href = $(el).attr('href');
      if (!href) return;

      // 원본 제목 추출 (태그 포함)
      let rawTitle = $(el).find('strong').text().trim() || $(el).text().trim();
      rawTitle = rawTitle.split('\n')[0].trim();

      // 태그 추출
      const tag = extractGameTag(rawTitle);

      // 제목 정리 - [취재], [기획], HOT 등 태그 제거
      let title = rawTitle.replace(/\[.*?\]/g, '').replace(/^HOT\s*/i, '').trim();

      if (title && title.length > 10 && !newsBySource.inven.find(n => n.title === title)) {
        newsBySource.inven.push({
          title: title.substring(0, 55),
          link: href.startsWith('http') ? href : 'https://www.inven.co.kr' + href,
          tag: tag
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
      if (title && link) {
        newsBySource.ruliweb.push({ title: title.substring(0, 55), link, tag });
      }
    });
    console.log(`  루리웹: ${newsBySource.ruliweb.length}개`);
  } catch (e) {
    console.log('  루리웹 뉴스 실패:', e.message);
  }

  // 게임메카 인기뉴스 스크래핑
  try {
    const res = await axios.get('https://www.gamemeca.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    // 메인 뉴스 섹션에서 가져오기
    $('a[href*="/view.php?gid="]').each((i, el) => {
      if (newsBySource.gamemeca.length >= 15) return false;
      const rawTitle = $(el).attr('title') || $(el).text().trim();
      const link = $(el).attr('href');
      const tag = extractGameTag(rawTitle);
      // 불필요한 텍스트 정리
      const cleanTitle = rawTitle.replace(/\[.*?\]/g, '').trim().split('\n')[0];

      if (cleanTitle && cleanTitle.length > 10 && link && !newsBySource.gamemeca.find(n => n.title === cleanTitle)) {
        newsBySource.gamemeca.push({
          title: cleanTitle.substring(0, 55),
          link: link.startsWith('http') ? link : 'https://www.gamemeca.com' + link,
          tag: tag
        });
      }
    });
    console.log(`  게임메카: ${newsBySource.gamemeca.length}개`);
  } catch (e) {
    console.log('  게임메카 뉴스 실패:', e.message);
  }

  // 디스이즈게임 인기뉴스 스크래핑
  try {
    const res = await axios.get('https://www.thisisgame.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    $('a[href*="/articles/"]').each((i, el) => {
      if (newsBySource.thisisgame.length >= 15) return false;
      const href = $(el).attr('href');
      if (!href || href.includes('newsId=') || href.includes('categoryId=')) return;

      let rawTitle = $(el).text().trim();
      rawTitle = rawTitle.split('\n')[0].trim();
      const tag = extractGameTag(rawTitle);
      // 태그 및 불필요한 텍스트 제거
      let title = rawTitle.replace(/\[.*?\]/g, '').trim();

      if (title && title.length > 10 && !newsBySource.thisisgame.find(n => n.title === title)) {
        newsBySource.thisisgame.push({
          title: title.substring(0, 55),
          link: href.startsWith('http') ? href : 'https://www.thisisgame.com' + href,
          tag: tag
        });
      }
    });
    console.log(`  디스이즈게임: ${newsBySource.thisisgame.length}개`);
  } catch (e) {
    console.log('  디스이즈게임 뉴스 실패:', e.message);
  }

  return newsBySource;
}

// Steam 개발사 + 이미지 정보 가져오기 (배치 처리)
async function fetchSteamDetails(appids) {
  const detailsMap = {};
  const batchSize = 10;

  for (let i = 0; i < appids.length; i += batchSize) {
    const batch = appids.slice(i, i + batchSize);
    const promises = batch.map(async (appid) => {
      try {
        const res = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 5000
        });
        const data = res.data?.[appid]?.data;
        if (data) {
          detailsMap[appid] = {
            developer: data.developers?.[0] || data.publishers?.[0] || '',
            img: data.header_image || ''
          };
        }
      } catch (e) {
        // 개별 실패는 무시
      }
    });
    await Promise.all(promises);
    // Rate limiting 방지
    if (i + batchSize < appids.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return detailsMap;
}

// Steam 순위 데이터 (steamcharts.com 실시간 스크래핑)
async function fetchSteamRankings() {
  const mostPlayed = [];
  const topSellers = [];
  const steamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.google.com/'
  };

  try {
    // Most Played - steamcharts.com 2페이지 + Steam Store에서 이미지
    // 순차적으로 요청 (동시 요청 시 차단됨)
    const chartsRes1 = await axios.get('https://steamcharts.com/top', { headers: steamHeaders, timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const chartsRes2 = await axios.get('https://steamcharts.com/top/p.2', { headers: steamHeaders, timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const storeRes = await axios.get('https://store.steampowered.com/search/?filter=mostplayed&cc=kr', { headers: steamHeaders, timeout: 15000 });

    // Steam Store에서 이미지 URL 맵 생성
    const $store = cheerio.load(storeRes.data);
    const imgMap = {};
    $store('#search_resultsRows a.search_result_row').each((i, el) => {
      const appid = $store(el).attr('data-ds-appid');
      const img = $store(el).find('.search_capsule img').attr('src');
      if (appid && img) imgMap[appid] = img;
    });

    // steamcharts 페이지 1, 2에서 순위, 이름, 플레이어 수 가져오기
    [chartsRes1, chartsRes2].forEach((res, pageIdx) => {
      const $ = cheerio.load(res.data);
      $('#top-games tbody tr').each((i, el) => {
        const rank = pageIdx * 25 + i + 1;
        if (rank > 50) return false;
        const $el = $(el);
        const name = $el.find('.game-name a').text().trim();
        const ccu = parseInt($el.find('td.num').first().text().replace(/,/g, '')) || 0;
        const appid = $el.find('.game-name a').attr('href')?.split('/').pop();

        if (appid && name) {
          mostPlayed.push({
            rank,
            appid,
            name,
            ccu,
            developer: '',
            img: imgMap[appid] || ''  // 나중에 API에서 채움
          });
        }
      });
    });
    console.log(`  Steam 최다 플레이: ${mostPlayed.length}개`);
  } catch (e) {
    console.log('  Steam 최다 플레이 로드 실패:', e.message);
  }

  try {
    // Top Sellers (Steam Store 베스트셀러 페이지 스크래핑)
    const sellersRes = await axios.get('https://store.steampowered.com/search/?filter=topsellers&cc=kr', {
      headers: steamHeaders,
      timeout: 15000
    });
    const $s = cheerio.load(sellersRes.data);

    $s('#search_resultsRows a.search_result_row').each((i, el) => {
      if (i >= 50) return false;
      const $el = $s(el);
      const name = $el.find('.title').text().trim();
      const appid = $el.attr('data-ds-appid');
      const price = $el.find('.discount_final_price').text().trim() || $el.find('.search_price').text().trim();
      const discount = $el.find('.discount_pct').text().trim();
      const img = $el.find('.search_capsule img').attr('src');

      if (appid && name) {
        topSellers.push({
          rank: i + 1,
          appid,
          name,
          discount: discount || '',
          price: price || '',
          developer: '',
          img: img || ''  // 나중에 API에서 채움
        });
      }
    });
    console.log(`  Steam 최고 판매: ${topSellers.length}개`);
  } catch (e) {
    console.log('  Steam 최고 판매 로드 실패:', e.message);
  }

  // 개발사 + 이미지 정보 가져오기
  const allAppids = [...new Set([...mostPlayed.map(g => g.appid), ...topSellers.map(g => g.appid)])];
  console.log(`  Steam 상세 정보 로딩 중... (${allAppids.length}개)`);
  const detailsMap = await fetchSteamDetails(allAppids);

  // placeholder 이미지 (Steam 기본 배경)
  const PLACEHOLDER_IMG = 'https://cdn.cloudflare.steamstatic.com/store/home/store_home_share.jpg';

  // 개발사 + 이미지 정보 병합
  mostPlayed.forEach(g => {
    const details = detailsMap[g.appid];
    g.developer = details?.developer || '';
    // 이미지 우선순위: 검색결과 > API > placeholder
    if (!g.img) {
      g.img = details?.img || PLACEHOLDER_IMG;
    }
  });
  topSellers.forEach(g => {
    const details = detailsMap[g.appid];
    g.developer = details?.developer || '';
    if (!g.img) {
      g.img = details?.img || PLACEHOLDER_IMG;
    }
  });
  console.log(`  Steam 상세 정보: ${Object.keys(detailsMap).length}개 로드`);

  return { mostPlayed, topSellers };
}

// 마켓 순위 데이터
async function fetchRankings() {
  const results = {
    grossing: {},
    free: {}
  };

  for (const c of countries) {
    console.log(`Fetching ${c.name}...`);
    results.grossing[c.code] = { ios: [], android: [] };
    results.free[c.code] = { ios: [], android: [] };

    // iOS - Grossing
    try {
      const iosGrossing = await store.list({
        collection: store.collection.TOP_GROSSING_IOS,
        category: store.category.GAMES,
        country: c.code,
        num: 200
      });
      results.grossing[c.code].ios = iosGrossing.map(a => ({
        title: a.title,
        developer: a.developer,
        icon: a.icon
      }));
    } catch (e) {
      console.log(`  iOS Grossing error: ${e.message}`);
    }

    // iOS - Free
    try {
      const iosFree = await store.list({
        collection: store.collection.TOP_FREE_IOS,
        category: store.category.GAMES,
        country: c.code,
        num: 200
      });
      results.free[c.code].ios = iosFree.map(a => ({
        title: a.title,
        developer: a.developer,
        icon: a.icon
      }));
    } catch (e) {
      console.log(`  iOS Free error: ${e.message}`);
    }

    // Android (중국 제외)
    if (c.code !== 'cn') {
      try {
        const androidGrossing = await gplay.list({
          collection: gplay.collection.GROSSING,
          category: gplay.category.GAME,
          country: c.code,
          num: 200
        });
        results.grossing[c.code].android = androidGrossing.map(a => ({
          title: a.title,
          developer: a.developer,
          icon: a.icon
        }));
      } catch (e) {
        console.log(`  Android Grossing error: ${e.message}`);
      }

      try {
        const androidFree = await gplay.list({
          collection: gplay.collection.TOP_FREE,
          category: gplay.category.GAME,
          country: c.code,
          num: 200
        });
        results.free[c.code].android = androidFree.map(a => ({
          title: a.title,
          developer: a.developer,
          icon: a.icon
        }));
      } catch (e) {
        console.log(`  Android Free error: ${e.message}`);
      }
    }
  }
  return results;
}

function generateHTML(rankings, news, steam, youtube, chzzk, community) {
  const now = new Date();
  // 15분 단위로 내림 (21:37 → 21:30)
  const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
  const reportDate = `${now.getMonth() + 1}월 ${now.getDate()}일 ${String(now.getHours()).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  const reportTime = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // 뉴스 HTML 생성 (소스별 분리)
  function generateNewsSection(items, sourceName, sourceUrl) {
    if (!items || items.length === 0) {
      return '<div class="no-data">뉴스를 불러올 수 없습니다</div>';
    }
    return items.map((item, i) => `
      <div class="news-item">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          <a href="${item.link}" target="_blank" rel="noopener">${item.title}</a>
        </div>
      </div>
    `).join('');
  }

  const invenNewsHTML = generateNewsSection(news.inven);
  const ruliwebNewsHTML = generateNewsSection(news.ruliweb);
  const gamemecaNewsHTML = generateNewsSection(news.gamemeca);
  const thisisgameNewsHTML = generateNewsSection(news.thisisgame);

  // 커뮤니티 인기글 HTML 생성
  function generateCommunitySection(items) {
    if (!items || items.length === 0) {
      return '<div class="no-data">인기글을 불러올 수 없습니다</div>';
    }
    return items.map((item, i) => {
      const channelTag = item.channel ? `<span class="community-tag">${item.channel}</span>` : '';
      return `
      <div class="news-item">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          ${channelTag}<a href="${item.link}" target="_blank" rel="noopener">${item.title}</a>
        </div>
      </div>
    `;
    }).join('');
  }

  const ruliwebCommunityHTML = generateCommunitySection(community?.ruliweb || []);
  const arcaCommunityHTML = generateCommunitySection(community?.arca || []);
  const dcsideCommunityHTML = generateCommunitySection(community?.dcinside || []);
  const fmkoreaCommunityHTML = generateCommunitySection(community?.fmkorea || []);

  // 국가별 컬럼 생성 함수
  function generateCountryColumns(chartData) {
    return countries.map(c => {
      const items = chartData[c.code]?.ios || [];
      const rows = items.length > 0 ? items.map((app, i) => `
        <div class="rank-row">
          <span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="app-info">
            <div class="app-name">${app.title}</div>
            <div class="app-dev">${app.developer}</div>
          </div>
        </div>
      `).join('') : '<div class="no-data">데이터 없음</div>';

      return `
        <div class="country-column">
          <div class="column-header">
            <span class="flag">${c.flag}</span>
            <span class="country-name">${c.name}</span>
          </div>
          <div class="rank-list">${rows}</div>
        </div>
      `;
    }).join('');
  }

  function generateAndroidColumns(chartData) {
    return countries.map(c => {
      const items = chartData[c.code]?.android || [];
      let rows;

      if (c.code === 'cn') {
        rows = '';
      } else if (items.length > 0) {
        rows = items.map((app, i) => `
          <div class="rank-row">
            <span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
            <img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <div class="app-info">
              <div class="app-name">${app.title}</div>
              <div class="app-dev">${app.developer}</div>
            </div>
          </div>
        `).join('');
      } else {
        rows = '<div class="no-data">데이터 없음</div>';
      }

      return `
        <div class="country-column">
          <div class="column-header">
            <span class="flag">${c.flag}</span>
            <span class="country-name">${c.name}</span>
          </div>
          <div class="rank-list">${rows}</div>
        </div>
      `;
    }).join('');
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GAMERS CRAWL | Daily Report</title>
  <!-- 폰트 preload로 FOUT 방지 -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-SemiBold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <style>
    /* 폰트 로딩 전 화면 숨김 - FOUT 완전 방지 */
    html {
      visibility: hidden;
    }
    html.fonts-loaded {
      visibility: visible;
    }
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --accent: #f97316;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #1e293b;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
    }

    /* Twemoji 이모지 크기 제어 */
    img.emoji {
      height: 1em;
      width: 1em;
      margin: 0 .05em 0 .1em;
      vertical-align: -0.1em;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow-y: scroll;
    }

    /* Header */
    .header {
      background: #fff;
      border-bottom: 1px solid var(--border);
      padding: 20px 0;
    }

    .header-inner {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }

    .header-date {
      position: absolute;
      right: 24px;
      font-size: 0.85rem;
      font-weight: 500;
      color: #64748b;
    }

    .header-title {
      font-size: 2.2rem;
      font-weight: 800;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .logo-badge {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -1px;
    }

    .logo-text {
      display: flex;
      align-items: center;
    }

    .header-title .logo-game {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-title .logo-crawler {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-subtitle {
      display: none;
    }

    /* Navigation */
    .nav {
      background: #fff;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .nav-inner {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      justify-content: center;
      gap: 4px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .nav-inner::-webkit-scrollbar {
      display: none;
    }

    .nav-item {
      padding: 14px 20px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .nav-item:hover {
      color: var(--text);
    }

    .nav-item.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
    }

    .nav-item svg {
      width: 18px;
      height: 18px;
    }

    /* Container */
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px 40px;
    }

    /* Sections */
    .section {
      display: none;
    }

    .section.active {
      display: block;
    }

    /* News Section - PC: 4컬럼, 모바일: 탭 */
    .news-controls {
      display: none; /* PC에서는 탭 숨김 */
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 16px 24px;
      margin-top: 24px;
      margin-bottom: 16px;
    }

    .news-controls .control-group {
      width: 100%;
    }

    #newsTab, #communityTab {
      width: 100%;
    }

    #newsTab .tab-btn, #communityTab .tab-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px 4px;
      font-size: 13px;
    }

    .news-card {
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 24px;
    }

    @media (min-width: 769px) {
      .news-card {
        margin-top: 24px;
      }
    }

    .news-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
    }

    .news-panel {
      display: block; /* PC에서는 모두 표시 */
      border-right: 1px solid #e2e8f0;
      padding: 0 12px;
      min-width: 0;
      overflow: hidden;
    }

    .news-panel:last-child {
      border-right: none;
    }

    .news-list {
      min-width: 0;
    }

    .news-item a {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .news-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #f1f5f9;
    }

    #news-inven .news-panel-header { background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); }
    #news-ruliweb .news-panel-header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); }
    #news-gamemeca .news-panel-header { background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); }
    #news-thisisgame .news-panel-header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); }

    .news-panel-title {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
    }

    .news-more-link {
      margin-left: auto;
      font-size: 12px;
      color: rgba(255,255,255,0.9);
      text-decoration: none;
    }

    .news-more-link:hover {
      color: #fff;
    }

    .news-favicon {
      width: 18px;
      height: 18px;
      margin-right: 6px;
      vertical-align: middle;
    }

    @media (max-width: 1400px) {
      .news-container { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 768px) {
      .news-controls {
        display: flex;
      }
      .news-card {
        padding: 16px;
      }
      .news-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .news-panel {
        display: block;
        background: #fff;
        border-radius: 8px;
        border: 1px solid var(--border);
        padding: 16px;
        border-right: none;
      }
    }

    .section-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 20px;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title svg {
      width: 20px;
      height: 20px;
      color: #3b82f6;
    }

    .news-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .news-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: #f8fafc;
      border-radius: 8px;
      transition: all 0.2s;
      min-width: 0;
      overflow: hidden;
    }

    .news-item:hover {
      background: #f1f5f9;
    }

    .news-num {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .news-item:nth-child(1) .news-num,
    .news-item:nth-child(2) .news-num,
    .news-item:nth-child(3) .news-num {
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
      color: white;
    }

    .news-content {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .news-content a {
      flex: 1;
      min-width: 0;
      font-size: 13px;
      font-weight: 500;
      color: #1e293b;
      text-decoration: none;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .news-content a:hover {
      color: #3b82f6;
    }

    .community-tag {
      font-size: 10px;
      font-weight: 600;
      color: #6366f1;
      background: #eef2ff;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Rankings Section */
    .rankings-controls {
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 16px 24px;
      margin-top: 24px;
      margin-bottom: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 24px;
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .rankings-controls::-webkit-scrollbar {
      display: none;
    }

    .control-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .control-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .tab-group {
      display: flex;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 3px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .tab-group::-webkit-scrollbar {
      display: none;
    }

    .tab-btn {
      padding: 10px 16px;
      min-width: 100px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      text-align: center;
    }

    .tab-btn:hover {
      color: var(--text);
    }

    .tab-btn.active {
      background: white;
      color: var(--text);
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    }


    /* Rankings Table */
    .rankings-card {
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    .chart-section {
      display: none;
    }

    .chart-section.active {
      display: block;
    }

    .chart-scroll {
      overflow-x: auto;
    }

    .columns-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
    }

    .country-column {
      min-width: 0;
      border-right: 1px solid #f1f5f9;
    }

    .country-column:last-child {
      border-right: none;
    }

    .column-header {
      padding: 8px 6px;
      background: #e2e8f0;
      border-bottom: 2px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .flag {
      font-size: 1rem;
    }

    .country-name {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
    }

    .rank-list {
      padding: 4px 0;
    }

    .rank-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid #f1f5f9;
      transition: all 0.15s;
    }

    .rank-row:hover {
      background: linear-gradient(90deg, #f8fafc 0%, #fff 100%);
      transform: translateX(2px);
    }

    .rank-row:last-child {
      border-bottom: none;
    }

    .rank-num {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: #94a3b8;
      flex-shrink: 0;
      border-radius: 8px;
    }

    .rank-num.top1 {
      background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
      color: #78350f;
      box-shadow: 0 2px 8px rgba(251, 191, 36, 0.4);
    }

    .rank-num.top2 {
      background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
      color: #334155;
      box-shadow: 0 2px 8px rgba(148, 163, 184, 0.4);
    }

    .rank-num.top3 {
      background: linear-gradient(135deg, #fed7aa 0%, #f97316 100%);
      color: #7c2d12;
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
    }

    .app-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      object-fit: cover;
      flex-shrink: 0;
      background: #f1f5f9;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .app-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .app-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .app-dev {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .no-data, .no-service {
      padding: 40px 20px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    /* Steam Section */
    .steam-controls {
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 16px 24px;
      margin-top: 24px;
      margin-bottom: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .steam-section {
      display: none;
    }

    .steam-section.active {
      display: block;
    }


    .steam-table {
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    .steam-table-header {
      display: grid;
      grid-template-columns: 60px 1fr 120px;
      padding: 12px 20px;
      background: #e2e8f0;
      border-bottom: 2px solid #cbd5e1;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
    }

    .steam-table-header > div {
      text-align: center;
    }

    .steam-table-row {
      display: grid;
      grid-template-columns: 60px 1fr 120px;
      padding: 12px 20px;
      border-bottom: 1px solid #f1f5f9;
      align-items: center;
      transition: background 0.15s;
    }

    .steam-table-row:hover {
      background: #f8fafc;
    }

    .steam-table-row:last-child {
      border-bottom: none;
    }

    .steam-col-rank {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .steam-col-game {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .steam-img {
      width: 120px;
      height: 45px;
      border-radius: 4px;
      object-fit: cover;
      background: linear-gradient(135deg, #1b2838 0%, #2a475e 100%);
      flex-shrink: 0;
    }

    .steam-img-placeholder {
      width: 120px;
      height: 45px;
      border-radius: 4px;
      background: linear-gradient(135deg, #1b2838 0%, #2a475e 100%);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .steam-img-placeholder svg {
      width: 24px;
      height: 24px;
      fill: #66c0f4;
      opacity: 0.6;
    }

    .steam-game-info {
      min-width: 0;
    }

    .steam-game-name {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .steam-game-dev {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .steam-col-players {
      text-align: right;
      font-size: 14px;
      font-weight: 600;
      color: #16a34a;
    }

    .steam-price-info {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .steam-discount {
      background: #22c55e;
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
    }

    .steam-price {
      color: #1e293b;
      font-weight: 600;
    }

    .steam-rank {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: #64748b;
      background: #f1f5f9;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .steam-rank.top1 {
      background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
      color: #78350f;
    }

    .steam-rank.top2 {
      background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
      color: #334155;
    }

    .steam-rank.top3 {
      background: linear-gradient(135deg, #fed7aa 0%, #f97316 100%);
      color: #7c2d12;
    }

    .steam-col-game {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .steam-game-info {
      min-width: 0;
      flex: 1;
    }

    .steam-game-name {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Video Section (영상) */
    .video-controls {
      background: var(--card);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 16px 24px;
      margin-top: 24px;
      margin-bottom: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .video-section {
      display: none;
    }

    .video-section.active {
      display: block;
    }

    .external-links {
      display: flex;
      gap: 8px;
    }

    .external-link-btn {
      display: inline-flex;
      align-items: center;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      background: #f1f5f9;
      border: none;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
    }

    .external-link-btn:hover {
      background: #e2e8f0;
      color: var(--text);
    }

    .link-favicon {
      width: 16px;
      height: 16px;
      margin-right: 6px;
    }

    .external-link-btn svg {
      margin-left: 4px;
      opacity: 0.5;
    }

    .youtube-link:hover {
      background: #ff0000;
      color: white;
    }

    .chzzk-link:hover {
      background: #00ffa3;
      color: #000;
    }

    .soop-link:hover {
      background: #5c7cfa;
      color: white;
    }

    /* YouTube Grid */
    .youtube-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }

    .youtube-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      text-decoration: none;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .youtube-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    }

    .youtube-thumbnail {
      position: relative;
      aspect-ratio: 16/9;
      background: #0f0f0f;
      overflow: hidden;
      border-radius: 12px 12px 0 0;
    }

    .youtube-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .youtube-rank {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: white;
      background: rgba(0,0,0,0.7);
      border-radius: 6px;
    }

    .youtube-rank.top1 {
      background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
      color: #78350f;
    }

    .youtube-rank.top2 {
      background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
      color: #334155;
    }

    .youtube-rank.top3 {
      background: linear-gradient(135deg, #fed7aa 0%, #f97316 100%);
      color: #7c2d12;
    }

    .live-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 700;
      color: white;
      background: #ef4444;
      border-radius: 4px;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .youtube-info {
      padding: 12px;
    }

    .youtube-title {
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .youtube-channel {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
    }

    .youtube-views {
      font-size: 11px;
      color: #94a3b8;
    }

    .youtube-empty {
      text-align: center;
      padding: 60px 20px;
      color: #64748b;
    }

    .youtube-empty p {
      margin: 8px 0;
    }

    @media (max-width: 1200px) {
      .youtube-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 768px) {
      .youtube-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
    }

    @media (max-width: 480px) {
      .youtube-grid {
        grid-template-columns: 1fr;
      }
    }

    /* Top Banner */
    .top-banner {
      width: 100%;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 10px 0;
      text-align: center;
    }
    .top-banner img {
      max-width: 728px;
      width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .top-banner-placeholder {
      max-width: 728px;
      height: 90px;
      margin: 0 auto;
      background: var(--border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-size: 14px;
    }

    /* Footer */
    .footer {
      background: var(--card);
      border-top: 1px solid var(--border);
      padding: 24px 20px;
      text-align: center;
      margin-top: 40px;
    }
    .footer-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    .footer-links {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .footer-links a {
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
      transition: color 0.2s;
    }
    .footer-links a:hover {
      color: var(--text);
    }
    .footer-info {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
      white-space: nowrap;
      overflow-x: auto;
    }
    .footer-info p {
      margin: 4px 0;
    }

    /* Print */
    @media print {
      .nav { display: none; }
      .rankings-controls { display: none; }
      body { background: white; }
      .header { background: #1e3a8a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    /* Mobile */
    @media (max-width: 768px) {
      .header-top { flex-direction: column; align-items: flex-start; gap: 8px; }
      .report-date { text-align: left; }
      .news-grid { grid-template-columns: 1fr; }
      .nav-item { padding: 10px 12px; font-size: 12px; }
      .nav-item svg { width: 16px; height: 16px; }
      .top-banner { padding: 8px 10px; }
    }
    @media (max-width: 480px) {
      .nav-item { padding: 8px 8px; font-size: 10px; gap: 4px; }
      .nav-item svg { width: 12px; height: 12px; }
      .top-banner-placeholder { height: 60px; font-size: 12px; }
      .footer { padding: 20px 16px; }
      .footer-links { gap: 16px; }
      .footer-links a { font-size: 13px; }
      .footer-info { font-size: 11px; }
    }
  </style>
  <script src="https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <h1 class="header-title" id="logo-home" style="cursor: pointer;">
        <span class="logo-game">GAMERS</span><span class="logo-crawler">CRAWL</span>
      </h1>
    </div>
  </header>

  <nav class="nav">
    <div class="nav-inner">
      <div class="nav-item active" data-section="news">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
        주요 뉴스
      </div>
      <div class="nav-item" data-section="community">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/></svg>
        커뮤니티
      </div>
      <div class="nav-item" data-section="youtube">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        영상 순위
      </div>
      <div class="nav-item" data-section="rankings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
        모바일 순위
      </div>
      <div class="nav-item" data-section="steam">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>
        스팀 순위
      </div>
    </div>
  </nav>

  <!-- 광고 배너 영역 -->
  <div class="top-banner">
    <div class="top-banner-placeholder">광고 배너 영역 (728x90)</div>
  </div>

  <main class="container">
    <!-- 주요 뉴스 섹션 -->
    <section class="section active" id="news">
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="newsTab">
            <button class="tab-btn active" data-news="inven"><img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">인벤</button>
            <button class="tab-btn" data-news="thisisgame"><img src="https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32" alt="" class="news-favicon">디스이즈게임</button>
            <button class="tab-btn" data-news="gamemeca"><img src="https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32" alt="" class="news-favicon">게임메카</button>
            <button class="tab-btn" data-news="ruliweb"><img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">루리웹</button>
          </div>
        </div>
      </div>
      <div class="news-card">
        <div class="news-container">
          <div class="news-panel" id="news-inven">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">인벤</span>
              <a href="https://www.inven.co.kr/webzine/news/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${invenNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-thisisgame">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">디스이즈게임</span>
              <a href="https://www.thisisgame.com" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${thisisgameNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-gamemeca">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">게임메카</span>
              <a href="https://www.gamemeca.com" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${gamemecaNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-ruliweb">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹</span>
              <a href="https://bbs.ruliweb.com/news" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${ruliwebNewsHTML}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 커뮤니티 인기글 섹션 -->
    <section class="section" id="community">
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="communityTab">
            <button class="tab-btn active" data-community="dcinside"><img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="" class="news-favicon">디시인사이드</button>
            <button class="tab-btn" data-community="fmkorea"><img src="https://www.google.com/s2/favicons?domain=fmkorea.com&sz=32" alt="" class="news-favicon">에펨코리아</button>
            <button class="tab-btn" data-community="arca"><img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">아카라이브</button>
            <button class="tab-btn" data-community="ruliweb"><img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">루리웹</button>
          </div>
        </div>
      </div>
      <div class="news-card">
        <div class="news-container">
          <div class="news-panel" id="community-dcinside">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);">
              <img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">디시 실시간 베스트</span>
              <a href="https://gall.dcinside.com/board/lists?id=dcbest" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${dcsideCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-fmkorea">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);">
              <img src="https://www.google.com/s2/favicons?domain=fmkorea.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">에펨코리아 포텐</span>
              <a href="https://www.fmkorea.com/best2" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${fmkoreaCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-arca">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
              <img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">아카라이브 베스트</span>
              <a href="https://arca.live/b/live?sort=rating" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${arcaCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-ruliweb">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
              <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹 게임 베스트</span>
              <a href="https://bbs.ruliweb.com/best/game?orderby=recommend&range=7d" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${ruliwebCommunityHTML}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 마켓 순위 섹션 -->
    <section class="section" id="rankings">
      <div class="rankings-controls">
        <div class="control-group">
          <div class="tab-group" id="storeTab">
            <button class="tab-btn ios-btn active" data-store="ios"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="" class="news-favicon">App Store</button>
            <button class="tab-btn android-btn" data-store="android"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="" class="news-favicon">Google Play</button>
          </div>
        </div>
        <div class="control-group">
          <div class="tab-group" id="chartTab">
            <button class="tab-btn grossing-btn active" data-chart="grossing">매출 순위</button>
            <button class="tab-btn free-btn" data-chart="free">인기 순위</button>
          </div>
        </div>
      </div>

      <div class="rankings-card">
        <div class="chart-section active" id="ios-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="ios-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.free)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.free)}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 스팀 순위 섹션 -->
    <section class="section" id="steam">
      <div class="steam-controls">
        <div class="tab-group" id="steamTab">
          <button class="tab-btn steam-btn active" data-steam="mostplayed"><img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="" class="news-favicon">최다 플레이</button>
          <button class="tab-btn steam-btn" data-steam="topsellers"><img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="" class="news-favicon">최고 판매</button>
        </div>
      </div>

      <!-- 최다 플레이 -->
      <div class="steam-section active" id="steam-mostplayed">
        <div class="steam-table">
          <div class="steam-table-header">
            <div>순위</div>
            <div>게임</div>
            <div>접속자수</div>
          </div>
          ${steam.mostPlayed.map((game, i) => `
            <div class="steam-table-row">
              <div class="steam-col-rank">
                <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="steam-col-game">
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" onerror="this.onerror=null;this.src='https://cdn.cloudflare.steamstatic.com/store/home/store_home_share.jpg';">
                <div class="steam-game-info">
                  <div class="steam-game-name">${game.name}</div>
                  <div class="steam-game-dev">${game.developer}</div>
                </div>
              </div>
              <div class="steam-col-players">${game.ccu.toLocaleString()}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 최고 판매 -->
      <div class="steam-section" id="steam-topsellers">
        <div class="steam-table">
          <div class="steam-table-header">
            <div>순위</div>
            <div>게임</div>
            <div>가격</div>
          </div>
          ${steam.topSellers.map((game, i) => `
            <div class="steam-table-row">
              <div class="steam-col-rank">
                <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="steam-col-game">
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" onerror="this.onerror=null;this.src='https://cdn.cloudflare.steamstatic.com/store/home/store_home_share.jpg';">
                <div class="steam-game-info">
                  <div class="steam-game-name">${game.name}</div>
                  <div class="steam-game-dev">${game.developer}</div>
                </div>
              </div>
              <div class="steam-col-players steam-price-info">${game.discount ? `<span class="steam-discount">${game.discount}</span>` : ''}<span class="steam-price">${game.price}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- 영상 섹션 -->
    <section class="section" id="youtube">
      <div class="video-controls">
        <div class="tab-group" id="videoTab">
          <button class="tab-btn active" data-video="gaming"><img src="https://www.google.com/s2/favicons?domain=youtube.com&sz=32" alt="" class="news-favicon">유튜브 인기</button>
          <button class="tab-btn" data-video="chzzk"><img src="https://www.google.com/s2/favicons?domain=chzzk.naver.com&sz=32" alt="" class="news-favicon">치지직 라이브</button>
        </div>
      </div>

      <!-- 게임 (유튜브 게임 카테고리) -->
      <div class="video-section active" id="video-gaming">
        ${youtube.gaming.length > 0 ? `
        <div class="youtube-grid">
          ${youtube.gaming.map((video, i) => `
            <a class="youtube-card" href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank">
              <div class="youtube-thumbnail">
                <img src="${video.thumbnail}" alt="" loading="lazy">
                <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="youtube-info">
                <div class="youtube-title">${video.title}</div>
                <div class="youtube-channel">${video.channel}</div>
                <div class="youtube-views">조회수 ${video.views.toLocaleString()}회</div>
              </div>
            </a>
          `).join('')}
        </div>
        ` : `<div class="youtube-empty"><p>데이터를 불러올 수 없습니다.</p></div>`}
      </div>

      <!-- 치지직 라이브 -->
      <div class="video-section" id="video-chzzk">
        ${chzzk.length > 0 ? `
        <div class="youtube-grid">
          ${chzzk.map((live, i) => `
            <a class="youtube-card" href="https://chzzk.naver.com/live/${live.channelId}" target="_blank">
              <div class="youtube-thumbnail">
                <img src="${live.thumbnail}" alt="" loading="lazy">
                <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
                <span class="live-badge">LIVE</span>
              </div>
              <div class="youtube-info">
                <div class="youtube-title">${live.title}</div>
                <div class="youtube-channel">${live.channel}</div>
                <div class="youtube-views">시청자 ${live.viewers.toLocaleString()}명</div>
              </div>
            </a>
          `).join('')}
        </div>
        ` : `<div class="youtube-empty"><p>치지직 데이터를 불러올 수 없습니다.</p></div>`}
      </div>

    </section>
  </main>

  <footer class="footer">
    <div class="footer-content">
      <div class="footer-links">
        <a href="/privacy" target="_blank">개인정보처리방침</a>
      </div>
      <div class="footer-info">
        <p>데이터 출처: Apple App Store, Google Play Store, Steam, YouTube, 치지직, 게임 뉴스 매체</p>
      </div>
    </div>
  </footer>

  <script>
    // 폰트 로딩 완료 감지 - FOUT 방지
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      // fallback: 100ms 후 표시
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }

    // 로고 클릭 시 홈(뉴스)으로 이동
    document.getElementById('logo-home')?.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelector('.nav-item[data-section="news"]')?.classList.add('active');
      document.getElementById('news')?.classList.add('active');
    });

    // 뉴스 탭 요소
    const newsTab = document.getElementById('newsTab');
    const newsContainer = document.querySelector('.news-container');

    // 커뮤니티 탭 요소
    const communityTab = document.getElementById('communityTab');
    const communityContainer = document.querySelector('#community .news-container');

    // 마켓 순위 탭 요소
    const storeTab = document.getElementById('storeTab');
    const chartTab = document.getElementById('chartTab');
    let currentStore = 'ios';
    let currentChart = 'grossing';

    // Steam 탭 요소
    const steamTab = document.getElementById('steamTab');

    // 서브탭 초기화 함수
    function resetSubTabs() {
      // 뉴스 탭 초기화
      newsTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      // 마켓 순위 탭 초기화
      storeTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      chartTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      currentStore = 'ios';
      currentChart = 'grossing';
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById('ios-grossing')?.classList.add('active');
      // 스팀 탭 초기화
      steamTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
      document.getElementById('steam-mostplayed')?.classList.add('active');
      // 영상 탭 초기화
      document.getElementById('videoTab')?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.video-section').forEach(s => s.classList.remove('active'));
      document.getElementById('video-gaming')?.classList.add('active');
    }

    // 메인 네비게이션
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(item.dataset.section)?.classList.add('active');
        resetSubTabs();
      });
    });

    // 뉴스 탭 - 선택한 패널을 맨 위로 이동
    newsTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      newsTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const selectedPanel = document.getElementById('news-' + btn.dataset.news);
      if (selectedPanel && newsContainer) {
        newsContainer.prepend(selectedPanel);
      }
    });

    // 커뮤니티 탭 - 선택한 패널을 맨 위로 이동
    communityTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      communityTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const selectedPanel = document.getElementById('community-' + btn.dataset.community);
      if (selectedPanel && communityContainer) {
        communityContainer.prepend(selectedPanel);
      }
    });

    function updateRankings() {
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById(currentStore + '-' + currentChart)?.classList.add('active');
    }

    storeTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      storeTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStore = btn.dataset.store;
      updateRankings();
    });

    chartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      chartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChart = btn.dataset.chart;
      updateRankings();
    });

    // Steam 탭 이벤트
    steamTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      steamTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
      document.getElementById('steam-' + btn.dataset.steam)?.classList.add('active');
    });

    // 영상 탭 이벤트
    const videoTab = document.getElementById('videoTab');
    videoTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      videoTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.video-section').forEach(s => s.classList.remove('active'));
      document.getElementById('video-' + btn.dataset.video)?.classList.add('active');
    });

    // Twemoji로 국기 이모지 렌더링
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, {
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
        folder: 'svg',
        ext: '.svg'
      });
    }
  </script>
</body>
</html>`;
}

async function main() {
  console.log('📰 뉴스 크롤링 중 (인벤, 루리웹, 게임메카, 디스이즈게임)...\n');
  const news = await fetchNews();
  const totalNews = news.inven.length + news.ruliweb.length + news.gamemeca.length + news.thisisgame.length;
  console.log(`\n  총 ${totalNews}개 뉴스 수집 완료`);

  console.log('\n💬 커뮤니티 인기글 수집 중 (루리웹, 아카라이브)...');
  const community = await fetchCommunityPosts();

  console.log('\n🔄 5대 마켓 순위 데이터 수집 중 (200위까지)...\n');
  const rankings = await fetchRankings();

  console.log('\n🎮 Steam 순위 데이터 수집 중...');
  const steam = await fetchSteamRankings();

  console.log('\n📺 YouTube 인기 동영상 수집 중...');
  const youtube = await fetchYouTubeVideos();

  console.log('\n📡 치지직 라이브 수집 중...');
  const chzzk = await fetchChzzkLives();

  console.log('\n📄 GAMERSCRAWL 일일 보고서 생성 중...');
  const html = generateHTML(rankings, news, steam, youtube, chzzk, community);

  const filename = `index.html`;
  fs.writeFileSync(filename, html, 'utf8');

  console.log(`\n✅ 완료! 파일: ${filename}`);
}

main().catch(console.error);
