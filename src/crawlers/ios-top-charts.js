// iOS Top Charts - Apple 내부 API (viewTop)
// RSS 피드의 100개 제한을 우회하여 200위까지 조회

const STORE_FRONTS = {
  kr: '143466',
  jp: '143462',
  us: '143441',
  cn: '143465',
  tw: '143470'
};

const CHART_IDS = {
  topFree: '27',
  topGrossing: '38'
};

const GENRE_GAMES = '6014';
const BATCH_SIZE = 100;

async function fetchIosTopApps({ chart, country, num = 200 }) {
  const storeFront = STORE_FRONTS[country] || STORE_FRONTS.us;
  const chartId = CHART_IDS[chart];
  if (!chartId) throw new Error(`Unknown chart type: ${chart}`);

  // 1) viewTop API로 앱 ID 목록 (최대 200개) 조회
  const url = `https://itunes.apple.com/WebObjects/MZStore.woa/wa/viewTop?genreId=${GENRE_GAMES}&popId=${chartId}`;
  const res = await fetch(url, {
    headers: { 'X-Apple-Store-Front': `${storeFront},29` }
  });

  if (!res.ok) throw new Error(`viewTop ${res.status}`);

  const data = await res.json();
  const adamIds = data?.pageData?.segmentedControl?.segments?.[0]
    ?.pageData?.selectedChart?.adamIds;

  if (!adamIds?.length) throw new Error('No adamIds in response');

  const ids = adamIds.slice(0, num);

  // 2) iTunes Lookup API로 메타데이터 일괄 조회 (100개씩 배치)
  const appMap = new Map();

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const lookupUrl = `https://itunes.apple.com/lookup?id=${batch.join(',')}&country=${country}&entity=software`;

    const lookupRes = await fetch(lookupUrl);
    if (!lookupRes.ok) continue;

    const lookupData = await lookupRes.json();
    for (const r of (lookupData.results || [])) {
      if (r.wrapperType && r.wrapperType !== 'software') continue;
      appMap.set(String(r.trackId), {
        id: r.trackId,
        appId: r.bundleId,
        title: r.trackName,
        icon: r.artworkUrl512 || r.artworkUrl100 || r.artworkUrl60,
        url: r.trackViewUrl,
        developer: r.artistName,
        released: r.releaseDate
      });
    }
  }

  // 3) 원래 순위 순서대로 반환
  const apps = [];
  for (const id of ids) {
    const app = appMap.get(String(id));
    if (app) apps.push(app);
  }

  return apps;
}

module.exports = { fetchIosTopApps };
