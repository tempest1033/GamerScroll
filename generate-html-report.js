require('dotenv').config();
const fs = require('fs');

// 커맨드라인 인자 파싱
const isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');

// 캐시 파일 경로
const CACHE_FILE = './data-cache.json';

// 퀵 모드가 아닐 때만 무거운 모듈 로드
let gplay, store, axios, cheerio, cloudscraper, FirecrawlClient, puppeteer;
if (!isQuickMode) {
  gplay = require('google-play-scraper').default;
  store = require('app-store-scraper');
  axios = require('axios');
  cheerio = require('cheerio');
  cloudscraper = require('cloudscraper');
  FirecrawlClient = require('@mendable/firecrawl-js').FirecrawlClient;
  puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
}

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
    inven: []
  };

  // 루리웹 게임 베스트 (axios + cheerio)
  try {
    const res = await axios.get('https://bbs.ruliweb.com/best/game?orderby=recommend&range=24h', {
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
      const scrapeResult = await firecrawl.scrape('https://arca.live/b/live', { formats: ['markdown'], maxAge: 0 });

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
      const scrapeResult = await firecrawl.scrape('https://gall.dcinside.com/board/lists?id=dcbest', { formats: ['markdown'], maxAge: 0 });

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

  // 인벤 핫이슈 (Firecrawl SDK 사용)
  try {
    if (FIRECRAWL_API_KEY) {
      const firecrawl = new FirecrawlClient({ apiKey: FIRECRAWL_API_KEY });
      const scrapeResult = await firecrawl.scrape('https://hot.inven.co.kr/', { formats: ['markdown'], maxAge: 0 });

      if (scrapeResult && scrapeResult.markdown) {
        const md = scrapeResult.markdown;
        // 패턴: [순위\\\n\\\n게임명\\\n\\\n제목 \\\n\[댓글수\]](URL)
        const postRegex = /\[(\d+)\\\\\n\\\\\n([^\n\\]+)\\\\\n\\\\\n([^\n]+)\s*\\\n\\\[(\d+)\\\]\]\((https:\/\/www\.inven\.co\.kr\/board\/[^)]+)\)/g;
        let match;
        const seenUrls = new Set();

        while ((match = postRegex.exec(md)) !== null && result.inven.length < 15) {
          const [, rank, game, titleRaw, comments, url] = match;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          // 제목 정리
          let title = titleRaw.replace(/\s*\\$/, '').trim();

          result.inven.push({
            title: title.length > 50 ? title.substring(0, 50) + '...' : title,
            link: url,
            channel: game.trim()
          });
        }
      }
      console.log(`  인벤 핫이슈: ${result.inven.length}개`);
    }
  } catch (e) {
    console.log('  인벤 핫이슈 실패:', e.message);
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

    // 인기뉴스 리스트에서 가져오기 - span.cols.title 구조
    $('a[href*="/webzine/news/?news="]').each((i, el) => {
      if (newsBySource.inven.length >= 15) return false;
      const href = $(el).attr('href');
      if (!href) return;

      // 제목 추출 - span.cols.title에서 가져오기
      const titleEl = $(el).find('span.cols.title');
      if (!titleEl.length) return;

      let rawTitle = titleEl.clone().children('.cmtnum').remove().end().text().trim();
      rawTitle = rawTitle.split('\n')[0].trim();

      // 태그 추출
      const tag = extractGameTag(rawTitle);

      // 제목 정리 - [취재], [기획], [인터뷰] 등 태그 제거
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

  // 게임메카 인기뉴스 스크래핑 (뉴스 목록 페이지)
  try {
    const res = await axios.get('https://www.gamemeca.com/news.php', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);

    // 뉴스 목록에서 가져오기 - tit_thumb, tit_thumb_h 클래스
    $('strong.tit_thumb a, strong.tit_thumb_h a').each((i, el) => {
      if (newsBySource.gamemeca.length >= 15) return false;
      const rawTitle = $(el).text().trim();
      const link = $(el).attr('href');
      if (!rawTitle || !link) return;

      const tag = extractGameTag(rawTitle);
      // 불필요한 텍스트 정리
      const cleanTitle = rawTitle.replace(/\[.*?\]/g, '').trim().split('\n')[0];

      if (cleanTitle && cleanTitle.length > 10 && !newsBySource.gamemeca.find(n => n.title === cleanTitle)) {
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

// ========== 출시 예정 게임 섹션 ==========

// Steam 출시 예정 게임 (explore/upcoming 페이지 스크래핑)
async function fetchSteamUpcoming() {
  const games = [];

  try {
    // Steam 위시리스트 상위 게임 API (인기 기대작)
    const response = await fetch(
      'https://store.steampowered.com/search/results/?query&start=0&count=50&sort_by=_ASC&filter=popularwishlist&infinite=1',
      { headers: { 'Accept-Language': 'ko-KR,ko;q=0.9' } }
    );
    const data = await response.json();

    if (data.success && data.results_html) {
      const html = data.results_html;

      // 정규식으로 게임 정보 추출
      const appidMatches = [...html.matchAll(/data-ds-appid="(\d+)"/g)];
      const nameMatches = [...html.matchAll(/class="title">([^<]+)</g)];
      const releaseDateMatches = [...html.matchAll(/class="search_released">([^<]*)</g)];

      for (let i = 0; i < Math.min(20, appidMatches.length); i++) {
        const appid = appidMatches[i][1];
        const name = nameMatches[i]?.[1]?.trim() || '';
        let releaseDate = releaseDateMatches[i]?.[1]?.trim() || '';

        // 이미 출시된 게임 제외 (출시일이 과거인 경우)
        if (releaseDate && !releaseDate.toLowerCase().includes('coming') &&
            !releaseDate.toLowerCase().includes('tba') &&
            !releaseDate.toLowerCase().includes('tbd')) {
          // 날짜 파싱 시도
          const parsedDate = new Date(releaseDate);
          if (!isNaN(parsedDate) && parsedDate < new Date()) {
            continue; // 이미 출시된 게임 스킵
          }
        }

        // DLC, Soundtrack 등 제외
        if (name.includes('Supporter Pack') || name.includes('Soundtrack') ||
            name.includes('Demo') || name.includes('DLC')) continue;

        games.push({
          rank: games.length + 1,
          name: name,
          img: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
          appid: appid,
          link: `https://store.steampowered.com/app/${appid}`,
          releaseDate: releaseDate || 'Coming Soon',
          publisher: '위시리스트 TOP ' + (i + 1)
        });

        if (games.length >= 20) break;
      }
    }

    console.log(`  Steam 기대작 (위시리스트 TOP): ${games.length}개`);
  } catch (e) {
    console.log('  Steam 기대작 로드 실패:', e.message);
  }
  return games;
}

// 닌텐도 출시 예정 게임 (nintendo.com/kr/schedule)
async function fetchNintendoUpcoming() {
  const games = [];
  try {
    // Firecrawl로 스크래핑
    if (!FIRECRAWL_API_KEY) {
      console.log('  Nintendo: FIRECRAWL_API_KEY 없음');
      return games;
    }

    const fc = new FirecrawlClient({ apiKey: FIRECRAWL_API_KEY });

    // 마크다운 형식으로 가져오기
    const result = await fc.scrape('https://www.nintendo.com/kr/schedule', {
      formats: ['markdown'],
      maxAge: 3600000 // 1시간 캐시
    });

    if (result && result.markdown) {
      const seenNames = new Set();
      let currentDate = '';

      // **게임명**\[퍼블리셔\]](링크) 패턴 - 전체 마크다운에서 추출
      // 백슬래시 이스케이프 처리
      const md = result.markdown.replace(/\\\\/g, '');

      // 날짜 섹션별로 처리
      const sections = md.split(/\n(?=\d{4}\.\d{1,2})/);

      for (const section of sections) {
        // 날짜 추출
        const dateMatch = section.match(/^(\d{4}\.\d{1,2}\.?\d*[월화수목금토일]*)/);
        if (dateMatch) {
          currentDate = dateMatch[1];
        }

        // 게임 패턴: **게임명**\[퍼블리셔\]](URL) 또는 **게임명**[퍼블리셔]](URL)
        const gameRegex = /\*\*([^*]+)\*\*\s*\\?\[([^\]]+)\]\s*\]\((https?:\/\/[^)]+)\)/g;
        let match;

        while ((match = gameRegex.exec(section)) !== null && games.length < 20) {
          const name = match[1].trim();
          const publisher = match[2].trim().replace(/\\$/g, ''); // 끝의 백슬래시 제거
          const link = match[3];

          // 중복 제거 및 필터링
          if (!seenNames.has(name) &&
              name.length > 1 &&
              !name.includes('업그레이드 패스') &&
              !link.includes('youtube.com')) {
            seenNames.add(name);
            games.push({
              rank: games.length + 1,
              name,
              publisher,
              releaseDate: currentDate || '발매 예정',
              img: '',
              link
            });
          }
        }
      }
    }
    console.log(`  닌텐도 출시예정: ${games.length}개`);
  } catch (e) {
    console.log('  닌텐도 출시예정 로드 실패:', e.message);
  }
  return games;
}

// PS5 출시 예정 게임 (PlayStation Store 공식)
async function fetchPS5Upcoming() {
  const games = [];
  try {
    if (!FIRECRAWL_API_KEY) {
      console.log('  PS5: FIRECRAWL_API_KEY 없음');
      return games;
    }

    const fc = new FirecrawlClient({ apiKey: FIRECRAWL_API_KEY });
    const result = await fc.scrape('https://store.playstation.com/ko-kr/category/a7c97306-69bd-45cb-a44f-c9ffd9eaa7d3/1', {
      formats: ['markdown'],
      maxAge: 3600000 // 1시간 캐시
    });

    if (result && result.markdown) {
      const seenNames = new Set();

      // 게임 블록 패턴: - [게임명](링크) 다음에 이미지와 가격
      // 마크다운을 게임 단위로 분리
      const gameBlocks = result.markdown.split(/\n-\s+\[/).slice(1); // 첫 번째 분할은 헤더

      for (const block of gameBlocks) {
        if (games.length >= 20) break;

        // 게임명과 링크 추출
        const nameMatch = block.match(/^([^\]]+)\]\((https:\/\/store\.playstation\.com\/ko-kr\/concept\/[^)]+)\)/);
        if (!nameMatch) continue;

        const name = nameMatch[1].trim();
        const link = nameMatch[2];

        // 네비게이션 링크 제외
        if (name === 'PlayStation Store' || name.includes('최신') || name.includes('카테고리') ||
            name.includes('프로모션') || name.includes('구독') || name.includes('둘러보기')) {
          continue;
        }

        // 이미 추가된 게임 스킵
        if (seenNames.has(name)) continue;

        // 이미지 추출 (w=1920 버전)
        const imgMatch = block.match(/!\[\]\((https:\/\/image\.api\.playstation\.com\/[^?]+)\?w=1920\)/);
        const img = imgMatch ? imgMatch[1] + '?w=440' : '';

        // 가격 추출
        let price = '출시 예정';
        const priceMatch = block.match(/([\d,]+원)/);
        if (priceMatch) {
          price = priceMatch[1];
        } else if (block.includes('발표됨')) {
          price = '발표됨';
        }

        seenNames.add(name);
        games.push({
          rank: games.length + 1,
          name,
          link,
          img,
          releaseDate: price,
          publisher: 'PlayStation'
        });
      }
    }

    console.log(`  PS5 출시예정: ${games.length}개`);
  } catch (e) {
    console.log('  PS5 출시예정 로드 실패:', e.message);
  }
  return games;
}

// 모바일 신규 인기 게임 (iOS App Store - 인기 무료 게임 중 30일 이내 출시)
async function fetchMobileUpcoming() {
  const games = [];
  try {
    // 인기 무료 게임에서 가져오기
    const topApps = await store.list({
      collection: store.collection.TOP_FREE_IOS,
      category: store.category.GAMES,
      country: 'kr',
      num: 200  // 많이 가져와서 신규 게임 필터링
    });

    // 30일 이내 출시된 게임만 필터링
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newGameApps = topApps.filter(app => {
      if (!app.released) return false;
      const releaseDate = new Date(app.released);
      return releaseDate >= thirtyDaysAgo;
    });

    newGameApps.slice(0, 20).forEach((app, i) => {
      // 출시일 포맷팅
      const releaseDate = new Date(app.released);
      const formattedDate = `${releaseDate.getMonth() + 1}/${releaseDate.getDate()} 출시`;

      games.push({
        rank: i + 1,
        name: app.title,
        img: app.icon,
        link: app.url,
        releaseDate: formattedDate,
        publisher: app.developer || ''
      });
    });

    console.log(`  모바일 신규인기 (iOS 30일 이내): ${games.length}개`);
  } catch (e) {
    console.log('  모바일 신규인기 로드 실패:', e.message);
  }
  return games;
}

// 출시 예정 게임 통합 수집
async function fetchUpcomingGames() {
  console.log('\n📅 출시 예정 게임 수집 중...');

  const [steam, nintendo, ps5, mobile] = await Promise.all([
    fetchSteamUpcoming(),
    fetchNintendoUpcoming(),
    fetchPS5Upcoming(),
    fetchMobileUpcoming()
  ]);

  return { steam, nintendo, ps5, mobile };
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

function generateHTML(rankings, news, steam, youtube, chzzk, community, upcoming) {
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

  // 플랫폼별 기본 로고 SVG
  const platformLogos = {
    steam: '<svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.26-.626.263-1.316.009-1.946-.254-.63-.729-1.121-1.354-1.38a2.51 2.51 0 0 0-1.921-.046l1.522.63a1.846 1.846 0 0 1-.943 3.538 1.846 1.846 0 0 1-.486-.061zm8.412-5.88a3.017 3.017 0 0 0 3.015-3.015 3.017 3.017 0 0 0-3.015-3.015 3.017 3.017 0 0 0-3.015 3.015 3.019 3.019 0 0 0 3.015 3.015zm0-5.426a2.411 2.411 0 1 1 0 4.822 2.411 2.411 0 0 1 0-4.822z"/></svg>',
    nintendo: '<svg viewBox="0 0 24 24" fill="#e60012"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>',
    ps5: '<svg viewBox="0 0 24 24" fill="#003791"><path d="M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.876c2.441 1.193 4.362-.002 4.362-3.153 0-3.237-.794-4.819-3.067-5.559-1.445-.454-3.764-1.771-3.764-1.771v18.37l-2.997-.97V2.596z"/><path d="M2.015 17.206c0 .688.343 1.152.984.913l6.258-2.204v-2.21l-4.636 1.615c-.49.171-.761-.056-.761-.746V8.45L2.015 9.3v7.906z"/><path d="M19.016 13.066c1.027-.478 1.969-.078 1.969 1.155v4.192c0 1.233-.942 1.634-1.969 1.155l-5.966-2.738v-2.21l5.966 2.733z"/></svg>',
    mobile: '<svg viewBox="0 0 24 24" fill="#34a853"><rect x="5" y="2" width="14" height="20" rx="2" stroke="#34a853" stroke-width="2" fill="none"/><circle cx="12" cy="18" r="1.5" fill="#34a853"/></svg>'
  };

  // 출시 예정 게임 HTML 생성 (게임명 > 발매일 > 회사 순서)
  function generateUpcomingSection(items, platform) {
    if (!items || items.length === 0) {
      return '<div class="upcoming-empty">출시 예정 정보를 불러올 수 없습니다</div>';
    }
    const defaultLogo = platformLogos[platform] || platformLogos.mobile;
    return items.map((game, i) => {
      // Steam 게임인 경우 대체 이미지 URL 시도
      const isSteam = platform === 'steam' && game.appid;
      const fallbackImg = isSteam ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/capsule_231x87.jpg` : '';
      const onerrorHandler = isSteam
        ? `if(!this.dataset.retry){this.dataset.retry='1';this.src='${fallbackImg}';}else{this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none';}`
        : `this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none'`;

      return `
      <a class="upcoming-item" href="${game.link || '#'}" target="_blank" rel="noopener">
        <span class="upcoming-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
        ${game.img ? `<img class="upcoming-icon" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="${onerrorHandler}">` : ''}<div class="upcoming-icon-placeholder ${game.img ? 'hidden' : ''}">${defaultLogo}</div>
        <div class="upcoming-info">
          <div class="upcoming-name">${game.name}</div>
          ${game.releaseDate ? `<div class="upcoming-date">${game.releaseDate}</div>` : ''}
          ${game.publisher ? `<div class="upcoming-publisher">${game.publisher}</div>` : ''}
        </div>
      </a>
    `;
    }).join('');
  }

  const invenNewsHTML = generateNewsSection(news.inven);
  const ruliwebNewsHTML = generateNewsSection(news.ruliweb);
  const gamemecaNewsHTML = generateNewsSection(news.gamemeca);
  const thisisgameNewsHTML = generateNewsSection(news.thisisgame);

  // 커뮤니티 인기글 HTML 생성
  const communityUrls = {
    ruliweb: 'https://bbs.ruliweb.com/best/humor',
    arca: 'https://arca.live/b/live',
    dcinside: 'https://gall.dcinside.com/board/lists?id=dcbest',
    inven: 'https://www.inven.co.kr/board/webzine/2097'
  };

  function generateCommunitySection(items, source) {
    if (!items || items.length === 0) {
      return '<div class="no-data">인기글을 불러올 수 없습니다</div>';
    }
    return items.map((item, i) => {
      const channelTag = item.channel ? `<span class="community-tag">${item.channel}</span>` : '';
      return `
      <a class="news-item clickable" href="${item.link}" target="_blank" rel="noopener">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          ${channelTag}<span class="news-title">${item.title}</span>
        </div>
      </a>
    `;
    }).join('');
  }

  const ruliwebCommunityHTML = generateCommunitySection(community?.ruliweb || [], 'ruliweb');
  const arcaCommunityHTML = generateCommunitySection(community?.arca || [], 'arca');
  const dcsideCommunityHTML = generateCommunitySection(community?.dcinside || [], 'dcinside');
  const invenCommunityHTML = generateCommunitySection(community?.inven || [], 'inven');

  // 국가별 컬럼 생성 함수
  function generateCountryColumns(chartData) {
    return countries.map(c => {
      const items = chartData[c.code]?.ios || [];
      const rows = items.length > 0 ? items.map((app, i) => `
        <div class="rank-row">
          <span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
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
            <img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
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
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%234f46e5'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='4' y='26' width='7' height='16' rx='3.5' fill='url(%23g)' opacity='.4'/%3E%3Crect x='14' y='20' width='7' height='28' rx='3.5' fill='url(%23g)' opacity='.7'/%3E%3Crect x='24' y='14' width='7' height='40' rx='3.5' fill='url(%23g)'/%3E%3Crect x='33' y='14' width='7' height='40' rx='3.5' fill='url(%23g)'/%3E%3Crect x='43' y='20' width='7' height='28' rx='3.5' fill='url(%23g)' opacity='.7'/%3E%3Crect x='53' y='26' width='7' height='16' rx='3.5' fill='url(%23g)' opacity='.4'/%3E%3C/svg%3E">
  <!-- 폰트 preload로 FOUT 방지 -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <!-- 이미지 도메인 preconnect -->
  <link rel="preconnect" href="https://play-lh.googleusercontent.com">
  <link rel="preconnect" href="https://is1-ssl.mzstatic.com">
  <link rel="preconnect" href="https://i.ytimg.com">
  <link rel="preconnect" href="https://cdn.cloudflare.steamstatic.com">
  <link rel="preconnect" href="https://www.google.com">
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
      /* === Primary Colors === */
      --primary: #4f46e5; /* Indigo 600 */
      --primary-light: #6366f1; /* Indigo 500 */
      --primary-dark: #4338ca; /* Indigo 700 */
      --accent: #f97316;

      /* === Background & Surface === */
      --bg: #f8fafc; /* Slate 50 */
      --bg-elevated: #ffffff;
      --card: #ffffff;
      --card-hover: #f8fafc;

      /* === Border === */
      --border: #e2e8f0; /* Slate 200 */
      --border-subtle: #f1f5f9;

      /* === Text === */
      --text: #0f172a; /* Slate 900 */
      --text-secondary: #64748b; /* Slate 500 */
      --text-muted: #94a3b8; /* Slate 400 */

      /* === Shadows (Multi-layer Soft) === */
      --shadow-xs: 0 1px 2px rgb(0 0 0 / 0.04);
      --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.04), 0 2px 4px rgb(0 0 0 / 0.04);
      --shadow: 0 1px 3px rgb(0 0 0 / 0.04), 0 4px 8px rgb(0 0 0 / 0.06), 0 8px 16px rgb(0 0 0 / 0.04);
      --shadow-lg: 0 2px 4px rgb(0 0 0 / 0.04), 0 8px 16px rgb(0 0 0 / 0.08), 0 16px 32px rgb(0 0 0 / 0.06);
      --shadow-xl: 0 4px 8px rgb(0 0 0 / 0.04), 0 16px 32px rgb(0 0 0 / 0.08), 0 32px 64px rgb(0 0 0 / 0.06);

      /* === Glass Effect === */
      --glass-bg: rgba(255, 255, 255, 0.7);
      --glass-bg-solid: rgba(255, 255, 255, 0.9);
      --glass-border: rgba(255, 255, 255, 0.5);

      /* === Interactive States === */
      --hover-bg: #f1f5f9;
      --active-bg: #eef2ff;
      --item-bg: #ffffff;

      /* === Semantic Colors === */
      --success: #16a34a;

      /* === Layout === */
      --radius: 16px;
      --radius-sm: 10px;
      --radius-lg: 20px;

      /* === Animation === */
      --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
      --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
      --transition-fast: 0.15s var(--ease-in-out);
      --transition-normal: 0.25s var(--ease-out-expo);
      --transition-slow: 0.4s var(--ease-out-expo);
    }

    /* === Dark Mode === */
    @media (prefers-color-scheme: dark) {
      :root {
        /* Primary Colors - 밝게 조정 */
        --primary: #818cf8; /* Indigo 400 */
        --primary-light: #a5b4fc; /* Indigo 300 */
        --primary-dark: #6366f1; /* Indigo 500 */
        --accent: #fb923c; /* Orange 400 */

        /* Background & Surface */
        --bg: #0f172a; /* Slate 900 */
        --bg-elevated: #1e293b; /* Slate 800 */
        --card: #1e293b; /* Slate 800 */
        --card-hover: #334155; /* Slate 700 */

        /* Border */
        --border: #334155; /* Slate 700 */
        --border-subtle: #1e293b; /* Slate 800 */

        /* Text */
        --text: #f1f5f9; /* Slate 100 */
        --text-secondary: #94a3b8; /* Slate 400 */
        --text-muted: #64748b; /* Slate 500 */

        /* Shadows - 다크모드용 더 깊은 그림자 */
        --shadow-xs: 0 1px 2px rgb(0 0 0 / 0.2);
        --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.2), 0 2px 4px rgb(0 0 0 / 0.15);
        --shadow: 0 1px 3px rgb(0 0 0 / 0.2), 0 4px 8px rgb(0 0 0 / 0.25), 0 8px 16px rgb(0 0 0 / 0.2);
        --shadow-lg: 0 2px 4px rgb(0 0 0 / 0.2), 0 8px 16px rgb(0 0 0 / 0.3), 0 16px 32px rgb(0 0 0 / 0.25);
        --shadow-xl: 0 4px 8px rgb(0 0 0 / 0.2), 0 16px 32px rgb(0 0 0 / 0.3), 0 32px 64px rgb(0 0 0 / 0.25);

        /* Glass Effect - 다크모드 */
        --glass-bg: rgba(30, 41, 59, 0.7);
        --glass-bg-solid: rgba(30, 41, 59, 0.95);
        --glass-border: rgba(255, 255, 255, 0.1);

        /* Interactive States - 다크모드 */
        --hover-bg: #334155;

        /* Semantic Colors - 다크모드 */
        --success: #4ade80;
        --active-bg: rgba(99, 102, 241, 0.15);
        --item-bg: #1e293b;
      }

      /* 다크모드 메인탭 - 흰색 톤 */
      .nav-item {
        color: rgba(255, 255, 255, 0.85) !important;
      }
      .nav-item:hover {
        color: #fff !important;
      }
      .nav-item.active {
        color: #fff !important;
      }
      .nav-item svg {
        stroke: rgba(255, 255, 255, 0.85) !important;
        opacity: 1 !important;
      }
      .nav-item:hover svg,
      .nav-item.active svg {
        stroke: #fff !important;
      }

      /* 다크모드 서브탭 - 흰색 톤 */
      .tab-btn {
        color: rgba(255, 255, 255, 0.85) !important;
      }
      .tab-btn:hover {
        color: #fff !important;
      }
      .tab-btn.active {
        color: #fff !important;
      }
      .tab-btn .news-favicon {
        filter: brightness(1.5) contrast(0.9) !important;
      }
    }

    /* === Custom Scrollbar === */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--text-muted);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-secondary);
    }

    /* Firefox */
    * {
      scrollbar-width: thin;
      scrollbar-color: var(--text-muted) transparent;
    }

    /* Reduced Motion 지원 */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
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
      background: var(--glass-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 24px 0;
      position: relative;
      z-index: 101;
      transition: background var(--transition-normal);
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
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--glass-bg);
      padding: 6px 12px;
      border-radius: 20px;
      border: 1px solid var(--border);
    }

    .header-title {
      font-size: 2.2rem;
      font-weight: 800;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      user-select: none;
    }

    .logo-svg {
      height: 68px;
      width: auto;
      max-width: 100%;
      color: var(--text);
      filter: drop-shadow(0 2px 4px rgba(99, 102, 241, 0.2));
      transition: transform var(--transition-normal), color var(--transition-normal);
    }

    .logo-svg:hover {
        transform: scale(1.02);
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
      background: var(--glass-bg-solid);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: var(--shadow-sm);
      transition: background var(--transition-normal);
    }

    .nav-inner {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      justify-content: center;
      gap: 8px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      transition: transform 0.3s ease;
    }
    .nav-inner::-webkit-scrollbar {
      display: none;
    }

    .nav-item {
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      position: relative;
      transition: all var(--transition-normal);
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      flex-shrink: 0;
      border-radius: var(--radius-sm);
      margin: 6px 0;
      border-bottom: none;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      user-select: none;
    }

    /* ===== PC 전용 스타일 (769px 이상) ===== */
    @media (min-width: 769px) {
      /* 메인 메뉴 가운데 정렬 */
      .nav-inner {
        justify-content: center !important;
      }

      /* 모든 컨트롤 영역 (뉴스/커뮤니티 제외 - PC에서 숨김) */
      .rankings-controls,
      .steam-controls,
      .video-controls,
      .upcoming-controls {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        padding: 12px 24px !important;
      }

      /* 컨트롤 그룹 */
      .control-group {
        width: auto !important;
        flex: 0 0 auto !important;
      }

      /* 탭 그룹 */
      .tab-group {
        width: auto !important;
        justify-content: center !important;
        gap: 8px !important;
      }

      /* PC 탭 버튼 */
      .tab-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
        padding: 12px 28px !important;
        font-size: 15px !important;
      }

      .tab-btn .news-favicon {
        width: 18px !important;
        height: 18px !important;
        flex-shrink: 0 !important;
        margin-right: 0 !important;
      }

      /* PC 서브탭 버튼 */
      .tab-group .tab-btn {
        flex: 0 0 auto !important;
        min-width: auto !important;
        min-height: auto !important;
        padding: 12px 28px !important;
        font-size: 15px !important;
        gap: 8px !important;
        overflow: visible !important;
      }

      .tab-group .tab-btn .news-favicon {
        width: 18px !important;
        height: 18px !important;
      }

      /* 모바일순위 - 두 그룹 사이 간격 */
      .rankings-controls {
        gap: 60px !important;
      }

      /* 스팀 순위 - 모바일과 동일하게 작게 유지 */
      .steam-controls .tab-btn {
        min-width: auto !important;
        padding: 12px 20px !important;
        font-size: 14px !important;
      }
    }

    /* 모바일 캐러셀 네비게이션 - 5개 표시 */
    @media (max-width: 768px) {
      .nav {
        overflow: hidden;
      }
      .nav-inner {
        justify-content: flex-start;
        padding: 0;
        gap: 0;
        overflow: visible;
      }
      .nav-item {
        min-width: 20%;
        flex: 0 0 20%;
        justify-content: center;
        text-align: center;
        padding: 10px 4px;
        margin: 4px 0;
        font-size: 12px;
        gap: 4px;
        flex-direction: column;
      }
      .nav-item svg {
        width: 18px;
        height: 18px;
      }
    }

    /* 데스크톱에서만 hover */
    @media (hover: hover) {
      .nav-item:hover {
        color: var(--text);
        background: var(--hover-bg);
      }
    }

    .nav-item.active {
      color: var(--primary);
      background: var(--active-bg);
      border-bottom: none;
    }

    .nav-item svg {
      width: 20px;
      height: 20px;
      opacity: 0.8;
    }
    
    .nav-item.active svg {
        opacity: 1;
        stroke-width: 2.5px;
    }

    /* Container */
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 24px 60px;
    }

    /* Sections */
    .section {
      display: none;
      animation: fadeIn 0.3s ease-out;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .section.active {
      display: block;
    }

    /* ===== 공통 컨트롤 영역 스타일 (모든 섹션 통일) ===== */
    .news-controls,
    .rankings-controls,
    .steam-controls,
    .video-controls,
    .upcoming-controls {
      background: var(--card) !important;
      border-radius: var(--radius) !important;
      box-shadow: var(--shadow) !important;
      padding: 8px 8px !important;
      margin-top: 12px !important;
      margin-bottom: 14px !important;
      justify-content: center !important;
      align-items: center !important;
    }

    /* 랭킹, 스팀, 영상, 출시작품: 항상 표시 */
    .rankings-controls,
    .steam-controls,
    .video-controls,
    .upcoming-controls {
      display: flex !important;
    }

    /* 뉴스/커뮤니티: PC에서 탭 숨김, 모바일에서만 표시 */
    #news .news-controls,
    #community .news-controls {
      display: none;
    }

    @media (max-width: 768px) {
      #news .news-controls,
      #community .news-controls {
        display: flex !important;
      }
    }

    .news-controls .control-group,
    .rankings-controls .control-group,
    .steam-controls .control-group,
    .video-controls .control-group,
    .upcoming-controls .control-group {
      width: 100%;
    }

    /* ===== 공통 탭 스타일 (모바일 기본) ===== */
    #newsTab, #communityTab, #storeTab, #chartTab, #steamTab, #videoTab, #upcomingTab {
      width: 100%;
    }

    .tab-group .tab-btn {
      flex: 1 1 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px 8px;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.2;
      min-width: 0;
      min-height: 44px;
      box-sizing: border-box;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .tab-group .tab-btn .news-favicon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .news-card {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 32px;
      border: 1px solid var(--border);
    }

    @media (min-width: 769px) {
      .news-card {
        margin-top: 16px;
      }
      .steam-controls, .video-controls, .rankings-controls, .upcoming-controls {
        padding: 8px 20px;
        margin-bottom: 12px;
      }
    }

    .news-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
    }

    .news-panel {
      display: block;
      border-right: none; 
      padding: 0;
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
      gap: 10px;
      margin-bottom: 20px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--card-hover);
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.03);
    }

    #news-inven .news-panel-header { background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); }
    #news-ruliweb .news-panel-header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3); }
    #news-gamemeca .news-panel-header { background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); box-shadow: 0 4px 10px rgba(217, 119, 6, 0.3); }
    #news-thisisgame .news-panel-header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); box-shadow: 0 4px 10px rgba(220, 38, 38, 0.3); }
    
    #community-dcinside .news-panel-header { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3); }
    #community-inven .news-panel-header { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3); }
    #community-arca .news-panel-header { background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3); }
    #community-ruliweb .news-panel-header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3); }

    .news-panel-title {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .news-more-link {
      margin-left: auto;
      font-size: 12px;
      color: rgba(255,255,255,0.9);
      text-decoration: none;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(255,255,255,0.1);
      transition: background 0.2s;
    }

    .news-more-link:hover {
      color: #fff;
      background: rgba(255,255,255,0.25);
    }

    .news-favicon {
      width: 20px;
      height: 20px;
      margin-right: 6px;
      vertical-align: middle;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
    }

    @media (max-width: 1400px) {
      .news-container { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 768px) {
      .news-controls {
        display: flex;
      }
      .news-card {
        padding: 20px;
      }
      .news-container {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .news-panel {
        display: block;
        background: var(--card);
        border-radius: 12px;
        border: 1px solid var(--border);
        padding: 20px;
        border-right: none;
      }

      /* 스팀 순위 - 모바일용 축소 */
      .steam-table-header {
        grid-template-columns: 50px 1fr 80px;
        padding: 12px 12px;
        font-size: 11px;
      }
      .steam-table-row {
        grid-template-columns: 50px 1fr 80px;
        padding: 10px 12px;
      }
      .steam-col-game {
        gap: 10px;
      }
      .steam-img {
        width: 80px;
        height: 30px;
      }
      .steam-game-name {
        font-size: 13px;
      }
      .steam-game-dev {
        font-size: 10px;
      }
      .steam-col-players {
        font-size: 12px;
      }

      /* 탭 버튼 - 태블릿 */
      .tab-group .tab-btn {
        padding: 10px 6px;
        font-size: 13px;
        gap: 5px;
        min-height: 42px;
        overflow: hidden;
      }
      .tab-group .tab-btn .news-favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
    }

    .section-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 20px;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title svg {
      width: 20px;
      height: 20px;
      color: var(--primary);
    }

    .news-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }

    .news-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: var(--item-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      transition: all var(--transition-normal);
      min-width: 0;
      overflow: hidden;
    }

    /* 데스크톱에서만 hover 효과 */
    @media (hover: hover) {
      .news-item:hover {
        background: var(--card-hover);
        transform: translateX(4px);
        border-color: var(--border);
        box-shadow: var(--shadow-sm);
      }
    }

    a.news-item.clickable {
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    /* 데스크톱에서만 hover 효과 */
    @media (hover: hover) {
      a.news-item.clickable:hover {
        background: var(--active-bg);
        border-color: var(--primary);
      }
    }

    /* 터치 디바이스에서 active 효과 */
    @media (hover: none) {
      a.news-item.clickable:active {
        background: var(--active-bg);
        border-color: var(--primary);
      }
    }

    .news-num {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--hover-bg);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 700;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .news-item:nth-child(1) .news-num,
    .news-item:nth-child(2) .news-num,
    .news-item:nth-child(3) .news-num {
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
      color: white;
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
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
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      text-decoration: none;
      display: block;
      line-height: 1.5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      transition: color 0.2s;
    }

    .news-content a:hover {
      color: var(--primary);
    }

    .news-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
      line-height: 1.5;
    }

    .community-tag {
      font-size: 11px;
      font-weight: 700;
      color: var(--primary);
      background: var(--active-bg);
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Rankings Section */
    /* Rankings Section - 고유 속성만 */
    .rankings-controls {
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
      gap: 12px;
      flex: 1;
    }

    .rankings-controls .tab-group {
      width: 100%;
    }

    .control-label {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .tab-group {
      display: flex;
      background: var(--hover-bg);
      border-radius: var(--radius-sm);
      padding: 4px;
      gap: 4px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .tab-group::-webkit-scrollbar {
      display: none;
    }

    /* 탭 버튼 기본 스타일 */
    .tab-btn {
      font-weight: 600;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all var(--transition-normal);
      white-space: nowrap;
      text-align: center;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      user-select: none;
    }

    .tab-btn:hover {
      color: var(--text);
      background: var(--glass-bg);
    }

    .tab-btn.active {
      background: var(--card);
      color: var(--primary);
      box-shadow: var(--shadow-sm);
      font-weight: 700;
    }


    /* Rankings Table */
    .rankings-card {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      border: 1px solid var(--border);
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
      border-right: 1px solid var(--border);
    }

    .country-column:last-child {
      border-right: none;
    }

    .column-header {
      padding: 16px 12px;
      background: var(--card-hover);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(4px);
    }

    .flag {
      font-size: 1.4rem;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));
    }

    .country-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }

    .rank-list {
      padding: 8px 0;
    }

    .rank-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-subtle);
      transition: all var(--transition-normal);
    }

    .rank-row:hover {
      background: var(--card-hover);
      transform: scale(1.01);
      box-shadow: var(--shadow-sm);
      z-index: 1;
      position: relative;
    }

    .rank-row:last-child {
      border-bottom: none;
    }

    .rank-num {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-muted);
      flex-shrink: 0;
      border-radius: 8px;
      background: var(--hover-bg);
    }

    .rank-num.top1 {
      background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);
    }

    .rank-num.top2 {
      background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(148, 163, 184, 0.3);
    }

    .rank-num.top3 {
      background: linear-gradient(135deg, #fdba74 0%, #f97316 100%);
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.2);
      box-shadow: 0 4px 6px rgba(249, 115, 22, 0.3);
    }

    .app-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      object-fit: cover;
      flex-shrink: 0;
      background: var(--hover-bg);
      box-shadow: 0 2px 5px rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.05);
    }

    .app-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .app-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .app-dev {
      font-size: 12px;
      color: var(--text-secondary);
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
    /* Steam Section */
    .steam-controls .tab-group {
      width: 100%;
    }

    .steam-section {
      display: none;
    }

    .steam-section.active {
      display: block;
    }

    .steam-table {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .steam-table-header {
      display: grid;
      grid-template-columns: 70px 1fr 140px;
      padding: 16px 24px;
      background: var(--card-hover);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .steam-table-header > div:nth-child(1) {
      text-align: center;
    }

    .steam-table-header > div:nth-child(2) {
      text-align: center;
    }

    .steam-table-header > div:nth-child(3) {
      text-align: right;
    }

    .steam-table-row {
      display: grid;
      grid-template-columns: 70px 1fr 140px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--border-subtle);
      align-items: center;
      transition: all var(--transition-normal);
    }

    .steam-table-row:hover {
      background: var(--card-hover);
      transform: translateX(4px);
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
      width: 140px;
      height: 52px;
      border-radius: 8px;
      object-fit: cover;
      background: linear-gradient(135deg, #1b2838 0%, #2a475e 100%);
      flex-shrink: 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .steam-img-placeholder {
      width: 140px;
      height: 52px;
      border-radius: 8px;
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
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .steam-game-dev {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .steam-col-players {
      text-align: right;
      font-size: 14px;
      font-weight: 600;
      color: var(--success);
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
      font-weight: 800;
      box-shadow: 0 2px 4px rgba(34, 197, 94, 0.2);
    }

    .steam-price {
      color: var(--text);
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
      color: var(--text-secondary);
      background: var(--hover-bg);
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
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Video Section (영상) */
    /* Video Section - 고유 속성만 */
    .video-controls {
      flex-wrap: wrap;
      gap: 16px;
    }

    .video-controls .tab-group {
      width: 100%;
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
      background: var(--hover-bg);
      border: none;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
    }

    .external-link-btn:hover {
      background: var(--border);
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
      gap: 24px;
    }

    .youtube-card {
      background: var(--card);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
      text-decoration: none;
      transition: all 0.3s ease;
      border: none;
    }

    .youtube-card:hover {
      transform: translateY(-6px);
      box-shadow: var(--shadow-lg);
    }

    .youtube-thumbnail {
      position: relative;
      aspect-ratio: 16/9;
      background: #0f0f0f;
      overflow: hidden;
      border-radius: var(--radius) var(--radius) 0 0;
    }

    .youtube-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }
    
    .youtube-card:hover .youtube-thumbnail img {
        transform: scale(1.05);
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
      backdrop-filter: blur(4px);
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
      padding: 16px;
    }

    .youtube-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .youtube-channel {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .youtube-views {
      font-size: 11px;
      color: var(--text-muted);
    }

    .youtube-empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
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
        gap: 16px;
      }
    }

    @media (max-width: 480px) {
      .youtube-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .youtube-info {
        padding: 8px;
      }
      .youtube-title {
        font-size: 12px;
        -webkit-line-clamp: 2;
      }
      .youtube-channel {
        font-size: 10px;
      }
      .youtube-views {
        font-size: 10px;
      }
      .youtube-rank {
        width: 22px;
        height: 22px;
        font-size: 11px;
      }
    }

    /* Top Banner */
    .top-banner {
      max-width: 728px;
      margin: 0 auto;
      padding: 12px 24px 0 24px;
      text-align: center;
    }

    .top-banner-placeholder {
      background: var(--hover-bg);
      border: 2px dashed var(--border);
      border-radius: 4px;
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    /* Footer */
    .footer {
      background: var(--card);
      border-top: 1px solid var(--border);
      padding: 32px 20px;
      text-align: center;
      margin-top: 40px;
    }

    .footer-content {
      max-width: 1200px;
      margin: 0 auto;
    }

    .footer-links {
      margin-bottom: 12px;
    }

    .footer-links a {
      color: var(--text);
      text-decoration: none;
      font-size: 14px;
    }

    .footer-links a:hover {
      text-decoration: underline;
    }

    .footer-info {
      color: var(--text-secondary);
      font-size: 12px;
    }

    .footer-info p {
      margin: 0;
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
      .nav-item { padding: 10px 14px; font-size: 13px; }
      .nav-item svg { width: 15px; height: 15px; }
      .rankings-controls { gap: 16px; }
      .control-group { flex-shrink: 1; }
    }

    @media (max-width: 768px) {
      /* 모바일 순위 - 비율로 화면에 딱 맞게 */
      .columns-grid { display: flex; width: 100%; }
      .country-column { flex: 1; min-width: 0; transition: flex 0.3s ease; }
      .country-column.expanded, .country-column:first-child:not(.collapsed) { flex: 3; }
      .column-header { cursor: pointer; padding: 6px 4px; flex-direction: column; gap: 2px; }
      .country-name { font-size: 9px; }
      .flag { font-size: 1.1rem; }
      .rank-row { padding: 5px 3px; gap: 3px; flex-direction: column; align-items: center; }
      .rank-num { width: 20px; height: 20px; font-size: 10px; border-radius: 4px; }
      /* 선택되지 않은 국가의 순위 번호 숨김 + 행 높이 고정 */
      .country-column:not(.expanded):not(:first-child) .rank-num,
      .country-column.collapsed .rank-num { display: none; }
      .country-column:not(.expanded):not(:first-child) .rank-row,
      .country-column.collapsed .rank-row { height: 48px; min-height: 48px; justify-content: center; box-sizing: border-box; }
      .app-icon { width: 36px; height: 36px; border-radius: 8px; }
      .app-info { display: none; }
      .country-column.expanded .rank-row, .country-column:first-child:not(.collapsed) .rank-row { flex-direction: row; padding: 8px 10px; gap: 8px; height: 48px; min-height: 48px; box-sizing: border-box; }
      .country-column.expanded .app-info, .country-column:first-child:not(.collapsed) .app-info { display: block; flex: 1; min-width: 0; }
      .country-column.expanded .app-icon, .country-column:first-child:not(.collapsed) .app-icon { width: 32px; height: 32px; }
      .country-column.expanded .rank-num, .country-column:first-child:not(.collapsed) .rank-num { width: 22px; height: 22px; font-size: 11px; }
      .app-name { font-size: 11px; margin-bottom: 2px; }
      .app-dev { font-size: 9px; }
    }

    @media (max-width: 576px) {
      .nav-item { padding: 10px 12px; font-size: 12px; gap: 4px; }
      .nav-item svg { width: 14px; height: 14px; }
      .logo-svg { height: 44px; }
      .rankings-controls { gap: 12px; }
      .news-favicon { width: 14px; height: 14px; }
      .rank-num { width: 18px; height: 18px; font-size: 9px; }
      .app-icon { width: 32px; height: 32px; border-radius: 6px; }
      .country-column.expanded .app-icon, .country-column:first-child:not(.collapsed) .app-icon { width: 28px; height: 28px; }
    }

    @media (max-width: 480px) {
      /* 좌우 여백 최소화 */
      .container { padding: 0 8px 40px; }
      .nav-inner { padding: 0 4px; }

      /* 메인 메뉴 크기 증가 */
      .nav-item { padding: 12px 8px; font-size: 12px; gap: 4px; }
      .nav-item svg { width: 20px; height: 20px; }
      .logo-svg { height: 36px; }

      /* 컨트롤 영역 */
      .rankings-controls { gap: 8px; }
      .control-group { gap: 6px; }

      /* 뉴스/커뮤니티 컨트롤 - 공통 스타일 사용 */

      /* 뉴스/커뮤니티 아이템 */
      .news-item { padding: 8px 6px; gap: 6px; }
      .news-panel { padding: 8px 6px; gap: 6px; }
      .news-card { padding: 10px; }
      .news-favicon { width: 14px; height: 14px; }

      /* 순위 */
      .rank-num { width: 16px; height: 16px; font-size: 8px; }
      .app-icon { width: 28px; height: 28px; }
      .country-column.expanded { flex: 3.5; }

      /* Steam 테이블 모바일 */
      .steam-table-row {
        grid-template-columns: 32px 1fr 80px;
        padding: 10px 12px;
        gap: 8px;
      }
      .steam-col-game {
        gap: 8px;
      }
      .steam-img {
        width: 60px;
        height: 28px;
      }
      .steam-game-name {
        font-size: 12px;
      }
      .steam-game-dev {
        font-size: 10px;
      }
      .steam-col-players {
        font-size: 11px;
        text-align: right;
      }
      .steam-price-info {
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
      }
      .steam-discount {
        font-size: 10px;
        padding: 2px 4px;
      }
      .steam-price {
        font-size: 11px;
      }

      /* 탭 버튼 - 모바일 */
      .tab-group .tab-btn {
        padding: 10px 6px;
        font-size: 12px;
        gap: 4px;
        min-height: 40px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tab-group .tab-btn .news-favicon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }
    }

    @media (max-width: 360px) {
      .nav-item { padding: 6px 8px; font-size: 10px; gap: 2px; }
      .nav-item svg { width: 12px; height: 12px; }
      .logo-svg { height: 32px; }
      .rankings-controls { gap: 8px; flex-wrap: wrap; justify-content: center; }
      .control-group { gap: 6px; }
      .news-favicon { width: 12px; height: 12px; }
      .rank-num { width: 14px; height: 14px; font-size: 7px; }
      .app-icon { width: 24px; height: 24px; border-radius: 4px; }
      .country-column.expanded { flex: 4; }
      .country-column.expanded .app-icon { width: 24px; height: 24px; }
      .app-name { font-size: 9px; }
      .app-dev { display: none; }

      /* Steam 테이블 초소형 모바일 */
      .steam-table-row {
        grid-template-columns: 28px 1fr 70px;
        padding: 8px 10px;
        gap: 6px;
      }
      .steam-img {
        width: 50px;
        height: 24px;
      }
      .steam-game-name {
        font-size: 11px;
      }
      .steam-col-players {
        font-size: 10px;
      }

      /* 탭 버튼 - 초소형 모바일 */
      .tab-group .tab-btn {
        padding: 8px 2px;
        font-size: 12px;
        min-height: 38px;
        justify-content: center;
      }
      .tab-group .tab-btn .news-favicon {
        display: none;
      }
    }

    /* ========== Upcoming Games Section ========== */
    .upcoming-controls .tab-group {
      width: 100%;
    }

    .upcoming-section {
      display: none;
    }

    .upcoming-section.active {
      display: block;
    }

    .upcoming-card {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .upcoming-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      transition: background 0.2s;
      text-decoration: none;
      color: inherit;
    }

    .upcoming-item:hover {
      background: var(--card-hover);
    }

    .upcoming-item:last-child {
      border-bottom: none;
    }

    .upcoming-rank {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--border);
      color: var(--text-secondary);
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
      flex-shrink: 0;
    }

    .upcoming-rank.top1 { background: linear-gradient(135deg, #ffd700 0%, #ffed4a 100%); color: #92400e; }
    .upcoming-rank.top2 { background: linear-gradient(135deg, #c0c0c0 0%, #e5e5e5 100%); color: #374151; }
    .upcoming-rank.top3 { background: linear-gradient(135deg, #cd7f32 0%, #daa06d 100%); color: #fff; }

    .upcoming-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      object-fit: cover;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      background: var(--hover-bg);
    }

    .upcoming-icon-placeholder {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      flex-shrink: 0;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
    }

    .upcoming-icon-placeholder svg {
      width: 100%;
      height: 100%;
      opacity: 0.7;
    }

    .upcoming-icon-placeholder.hidden {
      display: none;
    }

    .upcoming-info {
      flex: 1;
      min-width: 0;
    }

    .upcoming-name {
      font-weight: 600;
      font-size: 14px;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .upcoming-date {
      font-size: 12px;
      color: var(--primary);
      font-weight: 500;
    }

    .upcoming-publisher {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .upcoming-price {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .upcoming-empty {
      padding: 40px 20px;
      text-align: center;
      color: var(--text-secondary);
    }

    /* Upcoming responsive */
    @media (max-width: 768px) {
      .upcoming-item { padding: 12px 16px; gap: 10px; }
      .upcoming-icon { width: 48px; height: 48px; border-radius: 10px; }
      .upcoming-icon-placeholder { width: 48px; height: 48px; border-radius: 10px; }
      .upcoming-name { font-size: 13px; }
      .upcoming-rank { width: 24px; height: 24px; font-size: 11px; }
    }

    @media (max-width: 480px) {
      .upcoming-item { padding: 10px 12px; gap: 8px; }
      .upcoming-icon { width: 40px; height: 40px; border-radius: 8px; }
      .upcoming-icon-placeholder { width: 40px; height: 40px; border-radius: 8px; }
      .upcoming-name { font-size: 12px; }
      .upcoming-date { font-size: 11px; }
      .upcoming-rank { width: 22px; height: 22px; font-size: 10px; }
    }

</style>
  <script src="https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
  <!-- Firebase Analytics -->
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
    import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js";
    const firebaseConfig = {
      apiKey: "AIzaSyBlVfvAGVrhEEMPKpDKJBrOPF7BINleV7I",
      authDomain: "gamerscrawl-b104b.firebaseapp.com",
      projectId: "gamerscrawl-b104b",
      storageBucket: "gamerscrawl-b104b.firebasestorage.app",
      messagingSenderId: "831886529376",
      appId: "1:831886529376:web:2d9f0f64782fa5e5e80405",
      measurementId: "G-2269FV044J"
    };
    const app = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);
  </script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825"
     crossorigin="anonymous"></script>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <h1 class="header-title" id="logo-home" style="cursor: pointer;">
        <svg class="logo-svg" viewBox="0 0 660 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#4f46e5" />
              <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
          </defs>

          <!-- 중앙 정렬 텍스트 -->
          <!-- dominant-baseline을 사용하여 수직 중앙 정렬 보정 -->
          <text class="logo-text-svg" x="50%" y="50%" dy="2" font-family="'Pretendard', -apple-system, sans-serif" font-size="62" font-weight="900" fill="currentColor" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.5">GAMERS CRAWL</text>

          <!-- 장식: Tech Signals (Bar Width: 10px, Corner: 5px) -->
          <!-- 높이 72px 기준 수직 중앙 정렬 (Y = (72-H)/2) -->

          <!-- 왼쪽 안테나 -->
          <rect x="8" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
          <rect x="26" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
          <rect x="44" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>

          <!-- 오른쪽 안테나 (왼쪽과 완벽 대칭) -->
          <rect x="606" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
          <rect x="624" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
          <rect x="642" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
        </svg>
      </h1>
    </div>
  </header>

  <nav class="nav">
    <div class="nav-inner">
      <div class="nav-item active" data-section="community">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/></svg>
        커뮤니티
      </div>
      <div class="nav-item" data-section="youtube">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        영상 순위
      </div>
      <div class="nav-item" data-section="news">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
        주요 뉴스
      </div>
      <div class="nav-item" data-section="rankings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
        모바일 순위
      </div>
      <div class="nav-item" data-section="steam">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>
        스팀 순위
      </div>
      <div class="nav-item" data-section="upcoming">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        출시 작품
      </div>
    </div>
  </nav>

  <main class="container">
    <!-- 주요 뉴스 섹션 -->
    <section class="section" id="news">
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
    <section class="section active" id="community">
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="communityTab">
            <button class="tab-btn active" data-community="dcinside"><img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="" class="news-favicon">디시인사이드</button>
            <button class="tab-btn" data-community="arca"><img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">아카라이브</button>
            <button class="tab-btn" data-community="inven"><img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">인벤</button>
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
          <div class="news-panel" id="community-arca">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
              <img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">아카라이브 베스트</span>
              <a href="https://arca.live/b/live" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${arcaCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-inven">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);">
              <img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">인벤 핫이슈</span>
              <a href="https://hot.inven.co.kr/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${invenCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-ruliweb">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
              <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹 게임 베스트</span>
              <a href="https://bbs.ruliweb.com/best/game?orderby=recommend&range=24h" target="_blank" class="news-more-link">더보기 →</a>
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
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="steam-img-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg></div>
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
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="steam-img-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg></div>
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
                <img src="${video.thumbnail}" alt="" loading="lazy" decoding="async">
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
                <img src="${live.thumbnail}" alt="" loading="lazy" decoding="async">
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

    <!-- 출시 작품 섹션 -->
    <section class="section" id="upcoming">
      <div class="upcoming-controls">
        <div class="tab-group" id="upcomingTab">
          <button class="tab-btn active" data-upcoming="mobile">
            <img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="" class="news-favicon">모바일
          </button>
          <button class="tab-btn" data-upcoming="steam">
            <img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="" class="news-favicon">스팀
          </button>
          <button class="tab-btn" data-upcoming="ps5">
            <img src="https://www.google.com/s2/favicons?domain=playstation.com&sz=32" alt="" class="news-favicon">PS5
          </button>
          <button class="tab-btn" data-upcoming="nintendo">
            <svg viewBox="0 0 24 24" fill="#e60012" class="news-favicon" style="width:20px;height:20px"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>닌텐도
          </button>
        </div>
      </div>

      <div class="upcoming-card">
        <div class="upcoming-section active" id="upcoming-mobile">
          ${generateUpcomingSection(upcoming?.mobile || [], 'mobile')}
        </div>
        <div class="upcoming-section" id="upcoming-steam">
          ${generateUpcomingSection(upcoming?.steam || [], 'steam')}
        </div>
        <div class="upcoming-section" id="upcoming-ps5">
          ${generateUpcomingSection(upcoming?.ps5 || [], 'ps5')}
        </div>
        <div class="upcoming-section" id="upcoming-nintendo">
          ${generateUpcomingSection(upcoming?.nintendo || [], 'nintendo')}
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="footer-content">
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
      document.querySelector('.nav-item[data-section="community"]')?.classList.add('active');
      document.getElementById('community')?.classList.add('active');
      window.scrollTo(0, 0); // 즉시 맨 위로
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

    // 출시 작품 탭 요소
    const upcomingTab = document.getElementById('upcomingTab');

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
      // 출시 작품 탭 초기화
      upcomingTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.upcoming-section').forEach(s => s.classList.remove('active'));
      document.getElementById('upcoming-mobile')?.classList.add('active');
    }

    // 메인 네비게이션 - 캐러셀 슬라이드 기능
    const navInner = document.querySelector('.nav-inner');
    const allNavItems = document.querySelectorAll('.nav-item');
    const totalNavCount = allNavItems.length; // 6개
    const visibleCount = 5;

    function updateNavCarousel(index) {
      // 모바일에서만 슬라이드 (5개 보이고, 6개 메뉴)
      if (window.innerWidth <= 768 && navInner) {
        // index가 4 이상이면 마지막 메뉴들이 보이도록 이동
        // 0~3: 0% (처음 5개 보임), 4~5: -20% (마지막 5개 보임)
        const offset = index >= visibleCount - 1 ? -20 : 0;
        navInner.style.transform = 'translateX(' + offset + '%)';
      }
    }

    document.querySelectorAll('.nav-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(item.dataset.section)?.classList.add('active');
        resetSubTabs();
        resetCountryColumns();
        updateNavCarousel(idx);
        window.scrollTo(0, 0); // 즉시 맨 위로
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
    const communityTypes = ['dcinside', 'arca', 'inven', 'ruliweb'];
    let currentCommunityIndex = 0;

    function switchCommunity(index) {
      if (index < 0) index = communityTypes.length - 1;
      if (index >= communityTypes.length) index = 0;
      currentCommunityIndex = index;

      communityTab.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === index);
      });
      const selectedPanel = document.getElementById('community-' + communityTypes[index]);
      if (selectedPanel && communityContainer) {
        communityContainer.prepend(selectedPanel);
      }
    }

    communityTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const index = communityTypes.indexOf(btn.dataset.community);
      if (index !== -1) switchCommunity(index);
    });

    // 모바일 스와이프 기능 - 메인 메뉴 전환
    let touchStartX = 0;
    let touchStartY = 0;
    const navItems = document.querySelectorAll('.nav-item');
    const navSections = ['community', 'youtube', 'news', 'rankings', 'steam', 'upcoming'];

    function getCurrentNavIndex() {
      const activeNav = document.querySelector('.nav-item.active');
      if (!activeNav) return 0;
      const section = activeNav.dataset.section;
      return navSections.indexOf(section);
    }

    function switchNavSection(index) {
      if (index < 0) index = navSections.length - 1;
      if (index >= navSections.length) index = 0;

      const targetSection = navSections[index];
      navItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

      document.querySelector('.nav-item[data-section="' + targetSection + '"]')?.classList.add('active');
      document.getElementById(targetSection)?.classList.add('active');

      // 캐러셀 슬라이드 업데이트
      const navInner = document.querySelector('.nav-inner');
      if (window.innerWidth <= 768 && navInner) {
        const offset = index >= 4 ? -20 : 0;
        navInner.style.transform = 'translateX(' + offset + '%)';
      }

      // 상단으로 즉시 스크롤
      window.scrollTo(0, 0);
    }

    // 전체 페이지에서 스와이프
    document.body.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;

      // 상하 이동이 30px 이상이면 스크롤로 간주 → 무시
      if (Math.abs(diffY) > 30) return;
      // 좌우 이동이 상하 이동의 2배 이상이어야 스와이프로 인식
      if (Math.abs(diffX) < Math.abs(diffY) * 2) return;

      if (Math.abs(diffX) > 50) { // 50px 이상 수평 스와이프
        const currentIndex = getCurrentNavIndex();
        if (diffX > 0) {
          // 왼쪽으로 스와이프 → 다음 섹션
          switchNavSection(currentIndex + 1);
        } else {
          // 오른쪽으로 스와이프 → 이전 섹션
          switchNavSection(currentIndex - 1);
        }
      }
    }, { passive: true });

    function updateRankings() {
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById(currentStore + '-' + currentChart)?.classList.add('active');
    }

    // 국가 컬럼 초기화 함수
    function resetCountryColumns() {
      document.querySelectorAll('.country-column').forEach(c => {
        c.classList.remove('expanded', 'collapsed');
      });
    }

    storeTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      storeTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStore = btn.dataset.store;
      updateRankings();
      resetCountryColumns();
    });

    chartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      chartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChart = btn.dataset.chart;
      updateRankings();
      resetCountryColumns();
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

    // 출시 작품 탭 이벤트
    upcomingTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      upcomingTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.upcoming-section').forEach(s => s.classList.remove('active'));
      document.getElementById('upcoming-' + btn.dataset.upcoming)?.classList.add('active');
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

    // 모바일 디바이스 감지 (터치 + 포인터)
    const isMobileDevice = () => {
      return window.matchMedia('(pointer: coarse)').matches ||
             'ontouchstart' in window ||
             navigator.maxTouchPoints > 0;
    };

    // 모바일에서 국가 컬럼 클릭 시 펼치기 (768px 이하)
    document.querySelectorAll('.columns-grid').forEach(grid => {
      grid.addEventListener('click', (e) => {
        if (window.innerWidth > 768) return;
        const column = e.target.closest('.country-column');
        if (!column) return;
        const columns = grid.querySelectorAll('.country-column');
        const firstCol = columns[0];
        const isFirst = column === firstCol;
        columns.forEach(c => c.classList.remove('expanded'));
        if (isFirst) {
          firstCol.classList.remove('collapsed');
        } else {
          firstCol.classList.add('collapsed');
          column.classList.add('expanded');
        }
      });
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
  let news, community, rankings, steam, youtube, chzzk, upcoming;

  if (isQuickMode) {
    // 퀵 모드: 캐시에서 로드
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('❌ 캐시 파일이 없습니다. 먼저 일반 모드로 실행해주세요.');
      return;
    }
    console.log('⚡ 퀵 모드 - 캐시 데이터로 빠르게 HTML 생성\n');
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`📂 캐시 로드 완료 (생성: ${cache.timestamp})\n`);
    news = cache.news;
    community = cache.community;
    rankings = cache.rankings;
    steam = cache.steam;
    youtube = cache.youtube;
    chzzk = cache.chzzk;
    upcoming = cache.upcoming;
  } else {
    // 일반 모드: 크롤링 실행
    console.log('📰 뉴스 크롤링 중 (인벤, 루리웹, 게임메카, 디스이즈게임)...\n');
    news = await fetchNews();
    const totalNews = news.inven.length + news.ruliweb.length + news.gamemeca.length + news.thisisgame.length;
    console.log(`\n  총 ${totalNews}개 뉴스 수집 완료`);

    console.log('\n💬 커뮤니티 인기글 수집 중 (루리웹, 아카라이브)...');
    community = await fetchCommunityPosts();

    console.log('\n🔄 5대 마켓 순위 데이터 수집 중 (200위까지)...\n');
    rankings = await fetchRankings();

    console.log('\n🎮 Steam 순위 데이터 수집 중...');
    steam = await fetchSteamRankings();

    console.log('\n📺 YouTube 인기 동영상 수집 중...');
    youtube = await fetchYouTubeVideos();

    console.log('\n📡 치지직 라이브 수집 중...');
    chzzk = await fetchChzzkLives();

    // 출시 예정 게임 수집
    upcoming = await fetchUpcomingGames();

    // 캐시 저장
    const cache = { timestamp: new Date().toISOString(), news, community, rankings, steam, youtube, chzzk, upcoming };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('\n💾 캐시 저장 완료');
  }

  console.log('\n📄 GAMERSCRAWL 일일 보고서 생성 중...');
  const html = generateHTML(rankings, news, steam, youtube, chzzk, community, upcoming);

  const filename = `index.html`;
  fs.writeFileSync(filename, html, 'utf8');

  console.log(`\n✅ 완료! 파일: ${filename}`);
}

main().catch(console.error);
