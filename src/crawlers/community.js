// 커뮤니티 인기글 크롤링 (루리웹, 아카라이브, 디시인사이드, 인벤)
async function fetchCommunityPosts(axios, cheerio, FirecrawlClient, firecrawlApiKey) {
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

    const tempList = [];
    $('table.board_list_table tbody tr').each((i, el) => {
      if (tempList.length >= 15) return false;
      const $el = $(el);
      const titleEl = $el.find('a.deco, a.subject_link');
      const link = titleEl.attr('href');

      let title = '';
      const strongEl = $el.find('strong.text_over, span.text_over');
      if (strongEl.length) {
        const cloned = strongEl.clone();
        cloned.find('span.subject_tag').remove();
        title = cloned.text().trim();
      } else {
        title = titleEl.text().trim();
      }

      if (/^\d+$/.test(title.trim())) return;

      if (title && link) {
        tempList.push({
          title: title.substring(0, 60),
          link: link.startsWith('http') ? link : 'https://bbs.ruliweb.com' + link
        });
      }
    });

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
    if (firecrawlApiKey) {
      const firecrawl = new FirecrawlClient({ apiKey: firecrawlApiKey });
      const scrapeResult = await firecrawl.scrape('https://arca.live/b/live', { formats: ['markdown'], maxAge: 0 });

      if (scrapeResult && scrapeResult.markdown) {
        const md = scrapeResult.markdown;
        const urlRegex = /\[((?:[^\[\]]|\\[\[\]])+)\]\((https:\/\/arca\.live\/b\/live\/\d+[^)]*)\)/g;
        const seenUrls = new Set();
        let match;

        while ((match = urlRegex.exec(md)) !== null && result.arca.length < 15) {
          const [, textRaw, url] = match;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          if (textRaw.match(/\d+\s*(hour|minute|day)s?\s*ago/i)) continue;

          let title = textRaw
            .replace(/\\\\n/g, ' ')
            .replace(/\\\\/g, '')
            .replace(/\\n/g, ' ')
            .replace(/\\\[/g, '[')
            .replace(/\\\]/g, ']')
            .replace(/\[\d+\]$/, '')
            .trim();

          if (title.includes('모바일 앱 이용 안내') || title.length === 0) continue;

          const urlIdx = md.indexOf(url);
          let channel = '';
          if (urlIdx > 0) {
            const beforeText = md.substring(Math.max(0, urlIdx - 500), urlIdx);
            const channelMatches = [...beforeText.matchAll(/\d+\[([^\]]+)\]\(https:\/\/arca\.live\/b\/\w+[^)]*\)/g)];
            if (channelMatches.length > 0) {
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
    if (firecrawlApiKey) {
      const firecrawl = new FirecrawlClient({ apiKey: firecrawlApiKey });
      const scrapeResult = await firecrawl.scrape('https://gall.dcinside.com/board/lists?id=dcbest', { formats: ['markdown'], maxAge: 0 });

      if (scrapeResult && scrapeResult.markdown) {
        const md = scrapeResult.markdown;
        const postRegex = /\*\*\\\[([^\]]+)\\\]\*\*\s*([^\]]+)\]\((https:\/\/gall\.dcinside\.com\/board\/view\/[^)]+)\)/g;
        let match;
        const seenUrls = new Set();

        while ((match = postRegex.exec(md)) !== null && result.dcinside.length < 15) {
          const [, channel, titleRaw, url] = match;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          let title = titleRaw.trim();
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
    if (firecrawlApiKey) {
      const firecrawl = new FirecrawlClient({ apiKey: firecrawlApiKey });
      const scrapeResult = await firecrawl.scrape('https://hot.inven.co.kr/', { formats: ['markdown'], maxAge: 0 });

      if (scrapeResult && scrapeResult.markdown) {
        const md = scrapeResult.markdown;
        const postRegex = /\[(\d+)\\\\\n\\\\\n([^\n\\]+)\\\\\n\\\\\n([^\n]+)\s*\\\n\\\[(\d+)\\\]\]\((https:\/\/www\.inven\.co\.kr\/board\/[^)]+)\)/g;
        let match;
        const seenUrls = new Set();

        while ((match = postRegex.exec(md)) !== null && result.inven.length < 15) {
          const [, rank, game, titleRaw, comments, url] = match;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

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

module.exports = { fetchCommunityPosts };
