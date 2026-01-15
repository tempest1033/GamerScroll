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
      if (tempList.length >= 20) return false;
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
        // 새 패턴: [제목\\\n\\\n\[댓글수\]](https://arca.live/b/live/ID?p=1)
        const urlRegex = /\[([^\]]+)\]\((https:\/\/arca\.live\/b\/live\/\d+[^)]*)\)/g;
        const seenUrls = new Set();
        let match;

        while ((match = urlRegex.exec(md)) !== null && result.arca.length < 20) {
          const [, textRaw, url] = match;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          // 시간 정보만 있는 링크 건너뛰기
          if (textRaw.match(/^\d+\s*(hour|minute|day|hours|minutes|days)\s*ago$/i)) continue;
          if (textRaw.match(/^\w+\d+\s*(hour|minute|day|hours|minutes|days)\s*ago/i)) continue;

          let title = textRaw
            .replace(/\\\\n/g, ' ')
            .replace(/\\\\/g, '')
            .replace(/\\n/g, ' ')
            .replace(/\\\[/g, '[')
            .replace(/\\\]/g, ']')
            .replace(/\[\d+\]$/, '')
            .trim();

          if (title.includes('모바일 앱 이용 안내') || title.length === 0) continue;
          // 작성자+시간+조회수 패턴 건너뛰기 (예: ASH2hours ago18626)
          if (/^\w+\d+\s*(hour|minute|day)/i.test(title)) continue;

          // 채널 찾기: 게시글 URL 앞에 있는 채널 링크
          const urlIdx = md.indexOf(url);
          let channel = '';
          if (urlIdx > 0) {
            const beforeText = md.substring(Math.max(0, urlIdx - 500), urlIdx);
            // 패턴: [채널명](https://arca.live/b/채널코드 "채널명 채널")
            const channelMatches = [...beforeText.matchAll(/\[([^\]]+)\]\(https:\/\/arca\.live\/b\/([a-zA-Z0-9_]+)\s*(?:"[^"]*")?\)/g)];
            if (channelMatches.length > 0) {
              const lastMatch = channelMatches[channelMatches.length - 1];
              // "베스트 라이브" 같은 것은 건너뛰기
              if (lastMatch[1] !== '베스트 라이브' && !lastMatch[1].includes('알림')) {
                channel = lastMatch[1];
              }
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
        // 새 패턴: **\\[갤러리\\]** 제목](URL) - 테이블 형식
        // 예: **\\[몬갤\\]** 5시간 전에 올라온 와일즈 최적화 문제에 대한 레딧 글](https://gall.dcinside.com/board/view/?id=dcbest&no=397077...)
        const postRegex = /\*\*\\\[([^\]]+)\\\]\*\*\s+([^\]]+)\]\((https:\/\/gall\.dcinside\.com\/board\/view\/\?[^)]+)\)/g;
        let match;
        const seenUrls = new Set();

        while ((match = postRegex.exec(md)) !== null && result.dcinside.length < 20) {
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
        // 인벤 핫이슈: ](URL) 패턴으로 URL 찾고, 앞의 [ 까지 텍스트 추출
        const linkPattern = /\]\((https:\/\/www\.inven\.co\.kr\/board\/[^)]+)\)/g;
        let match;
        const seenUrls = new Set();

        while ((match = linkPattern.exec(md)) !== null && result.inven.length < 20) {
          const url = match[1];
          if (seenUrls.has(url)) continue;

          // URL 앞의 [ 찾기 (\\[가 아닌 순수 [만)
          const urlStart = match.index;
          const beforeUrl = md.substring(Math.max(0, urlStart - 300), urlStart);
          let bracketIdx = -1;
          for (let i = beforeUrl.length - 1; i >= 0; i--) {
            if (beforeUrl[i] === '[' && (i === 0 || beforeUrl[i - 1] !== '\\')) {
              bracketIdx = i;
              break;
            }
          }
          if (bracketIdx === -1) continue;

          const textRaw = beforeUrl.substring(bracketIdx + 1);
          seenUrls.add(url);

          // 줄바꿈으로 split, 백슬래시만 있는 요소와 trailing 백슬래시 제거
          const parts = textRaw.split(/\n/)
            .map(p => p.replace(/\\+$/, '').trim())
            .filter(p => p && !/^\\+$/.test(p));

          // 최소 3부분: 순위, 게임, 제목
          if (parts.length >= 3) {
            const rank = parts[0];
            const game = parts[1] || '';
            // 제목에서 댓글수 제거: \[19\] 형태
            let title = parts[2]?.replace(/\s*\\\[\d+\\?\]?$/, '').trim() || '';

            // 순위가 숫자인지 확인 (1~200)
            if (!/^\d{1,3}$/.test(rank)) continue;
            if (title.length === 0) continue;

            result.inven.push({
              title: title.length > 50 ? title.substring(0, 50) + '...' : title,
              link: url,
              channel: game
            });
          }
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
