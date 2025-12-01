// Steam 개발사 + 이미지 정보 가져오기 (배치 처리)
async function fetchSteamDetails(axios, appids) {
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
    if (i + batchSize < appids.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return detailsMap;
}

// Steam 순위 데이터 (steamcharts.com 실시간 스크래핑)
async function fetchSteamRankings(axios, cheerio) {
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
    const chartsRes1 = await axios.get('https://steamcharts.com/top', { headers: steamHeaders, timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const chartsRes2 = await axios.get('https://steamcharts.com/top/p.2', { headers: steamHeaders, timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const storeRes = await axios.get('https://store.steampowered.com/search/?filter=mostplayed&cc=kr', { headers: steamHeaders, timeout: 15000 });

    const $store = cheerio.load(storeRes.data);
    const imgMap = {};
    $store('#search_resultsRows a.search_result_row').each((i, el) => {
      const appid = $store(el).attr('data-ds-appid');
      const img = $store(el).find('.search_capsule img').attr('src');
      if (appid && img) imgMap[appid] = img;
    });

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
            img: imgMap[appid] || ''
          });
        }
      });
    });
    console.log(`  Steam 최다 플레이: ${mostPlayed.length}개`);
  } catch (e) {
    console.log('  Steam 최다 플레이 로드 실패:', e.message);
  }

  try {
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
          img: img || ''
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
  const detailsMap = await fetchSteamDetails(axios, allAppids);

  const PLACEHOLDER_IMG = 'https://cdn.cloudflare.steamstatic.com/store/home/store_home_share.jpg';

  mostPlayed.forEach(g => {
    const details = detailsMap[g.appid];
    g.developer = details?.developer || '';
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

module.exports = { fetchSteamDetails, fetchSteamRankings };
