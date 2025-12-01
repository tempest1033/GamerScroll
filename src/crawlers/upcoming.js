// Steam 출시 예정 게임 (위시리스트 TOP)
async function fetchSteamUpcoming() {
  const games = [];

  try {
    const response = await fetch(
      'https://store.steampowered.com/search/results/?query&start=0&count=50&sort_by=_ASC&filter=popularwishlist&infinite=1',
      { headers: { 'Accept-Language': 'ko-KR,ko;q=0.9' } }
    );
    const data = await response.json();

    if (data.success && data.results_html) {
      const html = data.results_html;
      const appidMatches = [...html.matchAll(/data-ds-appid="(\d+)"/g)];
      const nameMatches = [...html.matchAll(/class="title">([^<]+)</g)];
      const releaseDateMatches = [...html.matchAll(/class="search_released">([^<]*)</g)];

      for (let i = 0; i < Math.min(20, appidMatches.length); i++) {
        const appid = appidMatches[i][1];
        const name = nameMatches[i]?.[1]?.trim() || '';
        let releaseDate = releaseDateMatches[i]?.[1]?.trim() || '';

        if (releaseDate && !releaseDate.toLowerCase().includes('coming') &&
            !releaseDate.toLowerCase().includes('tba') &&
            !releaseDate.toLowerCase().includes('tbd')) {
          const parsedDate = new Date(releaseDate);
          if (!isNaN(parsedDate) && parsedDate < new Date()) {
            continue;
          }
        }

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

// 닌텐도 출시 예정 게임
async function fetchNintendoUpcoming(FirecrawlClient, firecrawlApiKey) {
  const games = [];
  try {
    if (!firecrawlApiKey) {
      console.log('  Nintendo: FIRECRAWL_API_KEY 없음');
      return games;
    }

    const fc = new FirecrawlClient({ apiKey: firecrawlApiKey });
    const result = await fc.scrape('https://www.nintendo.com/kr/schedule', {
      formats: ['markdown'],
      maxAge: 3600000
    });

    if (result && result.markdown) {
      const seenNames = new Set();
      let currentDate = '';
      const md = result.markdown.replace(/\\\\/g, '');
      const sections = md.split(/\n(?=\d{4}\.\d{1,2})/);

      for (const section of sections) {
        const dateMatch = section.match(/^(\d{4}\.\d{1,2}\.?\d*[월화수목금토일]*)/);
        if (dateMatch) {
          currentDate = dateMatch[1];
        }

        const gameRegex = /\*\*([^*]+)\*\*\s*\\?\[([^\]]+)\]\s*\]\((https?:\/\/[^)]+)\)/g;
        let match;

        while ((match = gameRegex.exec(section)) !== null && games.length < 20) {
          const name = match[1].trim();
          const publisher = match[2].trim().replace(/\\$/g, '');
          const link = match[3];

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

// PS5 출시 예정 게임
async function fetchPS5Upcoming(FirecrawlClient, firecrawlApiKey) {
  const games = [];
  try {
    if (!firecrawlApiKey) {
      console.log('  PS5: FIRECRAWL_API_KEY 없음');
      return games;
    }

    const fc = new FirecrawlClient({ apiKey: firecrawlApiKey });
    const result = await fc.scrape('https://store.playstation.com/ko-kr/category/a7c97306-69bd-45cb-a44f-c9ffd9eaa7d3/1', {
      formats: ['markdown'],
      maxAge: 3600000
    });

    if (result && result.markdown) {
      const seenNames = new Set();
      const gameBlocks = result.markdown.split(/\n-\s+\[/).slice(1);

      for (const block of gameBlocks) {
        if (games.length >= 20) break;

        const nameMatch = block.match(/^([^\]]+)\]\((https:\/\/store\.playstation\.com\/ko-kr\/concept\/[^)]+)\)/);
        if (!nameMatch) continue;

        const name = nameMatch[1].trim();
        const link = nameMatch[2];

        if (name === 'PlayStation Store' || name.includes('최신') || name.includes('카테고리') ||
            name.includes('프로모션') || name.includes('구독') || name.includes('둘러보기')) {
          continue;
        }

        if (seenNames.has(name)) continue;

        const imgMatch = block.match(/!\[\]\((https:\/\/image\.api\.playstation\.com\/[^?]+)\?w=1920\)/);
        const img = imgMatch ? imgMatch[1] + '?w=440' : '';

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

// 모바일 신규 인기 게임 (iOS)
async function fetchMobileUpcoming(store) {
  const games = [];
  try {
    const topApps = await store.list({
      collection: store.collection.TOP_FREE_IOS,
      category: store.category.GAMES,
      country: 'kr',
      num: 200
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newGameApps = topApps.filter(app => {
      if (!app.released) return false;
      const releaseDate = new Date(app.released);
      return releaseDate >= thirtyDaysAgo;
    });

    newGameApps.slice(0, 20).forEach((app, i) => {
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
async function fetchUpcomingGames(store, FirecrawlClient, firecrawlApiKey) {
  console.log('\n📅 출시 예정 게임 수집 중...');

  const [steam, nintendo, ps5, mobile] = await Promise.all([
    fetchSteamUpcoming(),
    fetchNintendoUpcoming(FirecrawlClient, firecrawlApiKey),
    fetchPS5Upcoming(FirecrawlClient, firecrawlApiKey),
    fetchMobileUpcoming(store)
  ]);

  return { steam, nintendo, ps5, mobile };
}

module.exports = {
  fetchSteamUpcoming,
  fetchNintendoUpcoming,
  fetchPS5Upcoming,
  fetchMobileUpcoming,
  fetchUpcomingGames
};
