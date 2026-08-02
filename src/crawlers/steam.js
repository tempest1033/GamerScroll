const fs = require('fs');
const path = require('path');

// Steam 상세(개발사/이미지) 캐시 — 거의 안 바뀌는 데이터라 7일 TTL로 재조회 최소화.
// data/ 경로는 CI가 커밋하는 위치라 러너 간에도 캐시가 유지된다.
const STEAM_DETAILS_CACHE_FILE = path.join(__dirname, '../../data/steam-details-cache.json');
const STEAM_DETAILS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadSteamDetailsCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(STEAM_DETAILS_CACHE_FILE, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function saveSteamDetailsCache(cache) {
  try {
    fs.writeFileSync(STEAM_DETAILS_CACHE_FILE, JSON.stringify(cache), 'utf8');
  } catch (e) {
    // 캐시 저장 실패는 무시 (다음 실행에서 재조회)
  }
}

// Steam 개발사 + 이미지 정보 가져오기 (배치 처리 + 7일 TTL 파일 캐시)
async function fetchSteamDetails(axios, appids) {
  const detailsMap = {};
  const batchSize = 10;
  const cache = loadSteamDetailsCache();
  const now = Date.now();

  // 캐시 히트 분리: TTL 이내 + developer 확보된 항목은 재조회하지 않음
  const staleAppids = [];
  for (const appid of appids) {
    const entry = cache[appid];
    if (entry && entry.developer && entry.ts && now - entry.ts < STEAM_DETAILS_TTL_MS) {
      detailsMap[appid] = { developer: entry.developer, img: entry.img || '' };
    } else {
      staleAppids.push(appid);
    }
  }
  if (appids.length > 0) {
    console.log(`  Steam 상세 캐시: ${appids.length - staleAppids.length}/${appids.length} 히트`);
  }

  for (let i = 0; i < staleAppids.length; i += batchSize) {
    const batch = staleAppids.slice(i, i + batchSize);
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
          cache[appid] = { ...detailsMap[appid], ts: now };
        }
      } catch (e) {
        // 개별 실패는 무시
      }
    });
    await Promise.all(promises);
    if (i + batchSize < staleAppids.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (staleAppids.length > 0) {
    // 만료 항목 정리 후 저장 (파일 무한 성장 방지)
    for (const [appid, entry] of Object.entries(cache)) {
      if (!entry || !entry.ts || now - entry.ts >= STEAM_DETAILS_TTL_MS) delete cache[appid];
    }
    saveSteamDetailsCache(cache);
  }
  return detailsMap;
}

// Steam 순위 데이터 (steamcharts.com 실시간 스크래핑)
async function fetchSteamRankings(axios, cheerio) {
  const mostPlayed = [];
  const topSellers = [];
  const rankLimit = 100;
  const steamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.google.com/'
  };

  try {
    // 스토어 검색을 100개까지 받아 이미지 매핑 확보
    let mostPlayedHtml = '';
    try {
      const storeRes = await axios.get(
        'https://store.steampowered.com/search/results/?query&start=0&count=100&filter=mostplayed&cc=kr&infinite=1',
        { headers: steamHeaders, timeout: 15000 }
      );
      mostPlayedHtml = storeRes.data?.results_html || storeRes.data || '';
    } catch (e) {
      console.log('  Steam 최다 플레이 이미지 로드 실패:', e.message);
    }

    const imgMap = {};
    if (mostPlayedHtml) {
      const $store = cheerio.load(mostPlayedHtml);
      $store('a.search_result_row').each((i, el) => {
        const appid = $store(el).attr('data-ds-appid');
        const img = $store(el).find('.search_capsule img').attr('src');
        if (appid && img) imgMap[appid] = img;
      });
    }

    const chartPages = [1, 2, 3, 4]; // 25개씩 4페이지 = 100위
    for (const page of chartPages) {
      const url = page === 1 ? 'https://steamcharts.com/top' : `https://steamcharts.com/top/p.${page}`;
      const res = await axios.get(url, { headers: steamHeaders, timeout: 15000 });
      const $ = cheerio.load(res.data);
      $('#top-games tbody tr').each((i, el) => {
        const rank = (page - 1) * 25 + i + 1;
        if (rank > rankLimit) return false;
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
      if (page !== chartPages[chartPages.length - 1]) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    console.log(`  Steam 최다 플레이: ${mostPlayed.length}개 (목표 ${rankLimit})`);
  } catch (e) {
    console.log('  Steam 최다 플레이 로드 실패:', e.message);
  }

  try {
    let sellersHtml = '';
    const sellersRes = await axios.get(
      'https://store.steampowered.com/search/results/?query&start=0&count=100&filter=topsellers&cc=kr&infinite=1',
      {
        headers: steamHeaders,
        timeout: 15000
      }
    );
    sellersHtml = sellersRes.data?.results_html || sellersRes.data || '';

    const $s = cheerio.load(sellersHtml);

    $s('a.search_result_row').each((i, el) => {
      if (i >= rankLimit) return false;
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
    console.log(`  Steam 최고 판매: ${topSellers.length}개 (목표 ${rankLimit})`);
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
