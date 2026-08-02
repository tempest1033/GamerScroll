const { fetchIosTopApps } = require('./ios-top-charts');

const countries = [
  { code: 'kr', name: '대한민국', flag: '🇰🇷' },
  { code: 'jp', name: '일본', flag: '🇯🇵' },
  { code: 'us', name: '미국', flag: '🇺🇸' },
  { code: 'cn', name: '중국', flag: '🇨🇳' },
  { code: 'tw', name: '대만', flag: '🇹🇼' }
];

// iOS 순위 조회 (viewTop API → RSS fallback)
async function fetchIosRanking(store, chart, collection, country) {
  try {
    const apps = await fetchIosTopApps({ chart, country });
    console.log(`  iOS ${chart} (${country}): ${apps.length}개 (viewTop)`);
    return apps.map(a => ({
      title: a.title,
      developer: a.developer,
      icon: a.icon,
      appId: a.id || a.appId || ''
    }));
  } catch (e) {
    console.log(`  iOS ${chart} viewTop 실패 (${e.message}), RSS fallback`);
    const apps = await store.list({
      collection,
      category: store.category.GAMES,
      country,
      num: 200
    });
    return apps.map(a => ({
      title: a.title,
      developer: a.developer,
      icon: a.icon,
      appId: a.id || a.appId || ''
    }));
  }
}

// Android 앱 매핑
function mapAndroidApp(a) {
  return {
    title: a.title,
    developer: a.developer,
    icon: a.icon,
    appId: a.appId || ''
  };
}

// 국가 하나의 iOS/Android 순위 수집 (국가 내부는 순차 → 스토어별 동시 요청 부하 제한)
async function fetchCountryRankings(gplay, store, c) {
  const out = { code: c.code, grossingIos: [], freeIos: [], grossingAndroid: [], freeAndroid: [] };

  // iOS - Grossing
  try {
    out.grossingIos = await fetchIosRanking(
      store, 'topGrossing', store.collection.TOP_GROSSING_IOS, c.code
    );
  } catch (e) {
    console.log(`  iOS Grossing error (${c.code}): ${e.message}`);
  }

  // iOS - Free
  try {
    out.freeIos = await fetchIosRanking(
      store, 'topFree', store.collection.TOP_FREE_IOS, c.code
    );
  } catch (e) {
    console.log(`  iOS Free error (${c.code}): ${e.message}`);
  }

  // Android (중국 제외)
  if (c.code !== 'cn') {
    // 국가별 언어 매핑
    const langMap = { kr: 'ko', jp: 'ja', us: 'en', tw: 'zh-TW' };
    const lang = langMap[c.code] || 'en';

    try {
      const androidGrossing = await gplay.list({
        collection: gplay.collection.GROSSING,
        category: gplay.category.GAME,
        country: c.code,
        lang: lang,
        num: 200
      });
      out.grossingAndroid = androidGrossing.map(mapAndroidApp);
    } catch (e) {
      console.log(`  Android Grossing error (${c.code}): ${e.message}`);
    }

    try {
      const androidFree = await gplay.list({
        collection: gplay.collection.TOP_FREE,
        category: gplay.category.GAME,
        country: c.code,
        lang: lang,
        num: 200
      });
      out.freeAndroid = androidFree.map(mapAndroidApp);
    } catch (e) {
      console.log(`  Android Free error (${c.code}): ${e.message}`);
    }
  }

  return out;
}

// 마켓 순위 데이터 (국가 단위 병렬 수집 — 결과 구조는 기존과 동일)
async function fetchRankings(gplay, store) {
  const results = {
    grossing: {},
    free: {}
  };

  console.log(`Fetching ${countries.map(c => c.name).join(', ')} (병렬)...`);
  const perCountry = await Promise.all(
    countries.map(c => fetchCountryRankings(gplay, store, c))
  );

  for (const r of perCountry) {
    results.grossing[r.code] = { ios: r.grossingIos, android: r.grossingAndroid };
    results.free[r.code] = { ios: r.freeIos, android: r.freeAndroid };
  }
  return results;
}

module.exports = { fetchRankings, countries };
