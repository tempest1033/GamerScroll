// 치지직 라이브 순위 가져오기 (게임 카테고리만)
async function fetchChzzkLives(axios) {
  const lives = [];
  try {
    const res = await axios.get('https://api.chzzk.naver.com/service/v1/home/lives', {
      params: { size: 200 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const streamingList = res.data?.content?.streamingLiveList || [];
    let rank = 1;
    for (const item of streamingList) {
      if (rank > 50) break;
      if (item.categoryType === 'GAME' || item.liveCategory === 'GAME') {
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
async function fetchSoopLives(axios) {
  const lives = [];
  try {
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

module.exports = { fetchChzzkLives, fetchSoopLives };
