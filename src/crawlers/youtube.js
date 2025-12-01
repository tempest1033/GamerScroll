// YouTube 카테고리 ID
const YOUTUBE_CATEGORIES = {
  gaming: { id: '20', name: '게임 인기' },
  music: { id: '10', name: '음악' }
};

// YouTube 인기 동영상 가져오기
async function fetchYouTubeVideos(axios, apiKey) {
  const result = {
    gaming: [],
    music: []
  };

  if (!apiKey) {
    console.log('  YouTube API 키가 설정되지 않음 (YOUTUBE_API_KEY 환경변수 필요)');
    return result;
  }

  for (const [key, category] of Object.entries(YOUTUBE_CATEGORIES)) {
    try {
      const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'snippet,statistics',
          chart: 'mostPopular',
          regionCode: 'KR',
          videoCategoryId: category.id,
          maxResults: 50,
          key: apiKey
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

module.exports = { fetchYouTubeVideos, YOUTUBE_CATEGORIES };
