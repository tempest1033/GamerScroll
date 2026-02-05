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

// 마켓 순위 데이터
async function fetchRankings(gplay, store) {
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
      results.grossing[c.code].ios = await fetchIosRanking(
        store, 'topGrossing', store.collection.TOP_GROSSING_IOS, c.code
      );
    } catch (e) {
      console.log(`  iOS Grossing error: ${e.message}`);
    }

    // iOS - Free
    try {
      results.free[c.code].ios = await fetchIosRanking(
        store, 'topFree', store.collection.TOP_FREE_IOS, c.code
      );
    } catch (e) {
      console.log(`  iOS Free error: ${e.message}`);
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
        results.grossing[c.code].android = androidGrossing.map(a => ({
          title: a.title,
          developer: a.developer,
          icon: a.icon,
          appId: a.appId || ''
        }));
      } catch (e) {
        console.log(`  Android Grossing error: ${e.message}`);
      }

      try {
        const androidFree = await gplay.list({
          collection: gplay.collection.TOP_FREE,
          category: gplay.category.GAME,
          country: c.code,
          lang: lang,
          num: 200
        });
        results.free[c.code].android = androidFree.map(a => ({
          title: a.title,
          developer: a.developer,
          icon: a.icon,
          appId: a.appId || ''
        }));
      } catch (e) {
        console.log(`  Android Free error: ${e.message}`);
      }
    }
  }
  return results;
}

module.exports = { fetchRankings, countries };
