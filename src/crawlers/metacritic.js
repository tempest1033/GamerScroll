// 메타크리틱 연도별 게임 평점 크롤러
async function fetchMetacriticGames(axios, cheerio, year = null) {
  let targetYear = year || new Date().getFullYear();
  const games = [];
  const seenTitles = new Set(); // 중복 체크용

  // 내부 크롤링 함수
  async function crawlYear(crawlYear, axios, cheerio, headers, cleanTitle, games, seenTitles) {
    for (let page = 1; page <= 2; page++) {
      if (games.length >= 30) break;

      const url = `https://www.metacritic.com/browse/game/?releaseYearMin=${crawlYear}&releaseYearMax=${crawlYear}&page=${page}`;
      const res = await axios.get(url, { headers, timeout: 15000 });
      const $ = cheerio.load(res.data);

      // 게임 카드 파싱
      $('div[class*="c-finderProductCard"]').each((i, el) => {
        if (games.length >= 30) return false;

        const $card = $(el);
        let title = $card.find('h3[class*="c-finderProductCard_titleHeading"]').text().trim() ||
                    $card.find('span[class*="c-finderProductCard_title"]').text().trim();
        title = cleanTitle(title);

        if (seenTitles.has(title)) return;

        const scoreText = $card.find('div[class*="c-siteReviewScore"]').first().text().trim();
        const score = parseInt(scoreText) || null;
        const platform = $card.find('span[class*="c-finderProductCard_meta"]').first().text().trim();
        const releaseDate = $card.find('span[class*="c-finderProductCard_meta"]').last().text().trim();

        if (title && score) {
          seenTitles.add(title);
          games.push({
            rank: games.length + 1,
            title,
            score,
            platform,
            releaseDate,
            img: '',
            year: crawlYear
          });
        }
      });

      // 백업 셀렉터
      if (games.length === 0) {
        $('a[class*="c-finderProductCard"]').each((i, el) => {
          if (games.length >= 30) return false;
          const $card = $(el);
          let title = $card.find('[class*="title"]').text().trim();
          title = cleanTitle(title);
          if (seenTitles.has(title)) return;
          const scoreText = $card.find('[class*="score"]').text().trim();
          const score = parseInt(scoreText) || null;
          if (title && score) {
            seenTitles.add(title);
            games.push({ rank: games.length + 1, title, score, platform: '', releaseDate: '', img: '', year: crawlYear });
          }
        });
      }
    }
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Referer': 'https://www.metacritic.com/'
  };

  // 제목에서 순위 번호 제거 (예: "1. Game Name" -> "Game Name")
  const cleanTitle = (title) => {
    return title.replace(/^\d+\.\s*/, '').trim();
  };

  // RAWG API로 게임 이미지 가져오기 (스크린샷 제외)
  const fetchGameImage = async (title) => {
    try {
      // 검색어 정리 (부제목, 에디션 등 제거)
      const searchTitle = title
        .replace(/[-–:]\s*(Nintendo Switch 2 Edition|Remastered|Definitive Edition|Game of the Year|GOTY|Deluxe|Ultimate|Complete|Enhanced|HD|Remake).*$/i, '')
        .replace(/\s+(II|III|IV|V|2|3|4|5)$/i, match => match) // 시리즈 번호는 유지
        .trim();

      const searchUrl = `https://api.rawg.io/api/games?key=c542e67aec3a4340908f9de9e86038af&search=${encodeURIComponent(searchTitle)}&page_size=5`;
      const res = await axios.get(searchUrl, { timeout: 10000 });

      if (res.data && res.data.results && res.data.results.length > 0) {
        // 결과 중에서 스크린샷이 아닌 이미지를 가진 게임 찾기
        for (const game of res.data.results) {
          const img = game.background_image;
          // 스크린샷 경로가 아닌 게임 이미지만 사용
          if (img && !img.includes('/screenshots/')) {
            return img;
          }
        }
        // 모든 결과가 스크린샷이면 첫 번째 결과의 이미지라도 반환
        // (스크린샷이라도 없는 것보단 나음)
        return res.data.results[0].background_image || '';
      }
    } catch (err) {
      console.log(`    RAWG 이미지 검색 실패: ${title}`);
    }
    return '';
  };

  try {
    // 현재 연도 크롤링 시도
    await crawlYear(targetYear, axios, cheerio, headers, cleanTitle, games, seenTitles);
    console.log(`  메타크리틱 ${targetYear}년: ${games.length}개`);

    // 데이터가 10개 미만이면 이전 연도 시도
    if (games.length < 10 && !year) {
      const prevYear = targetYear - 1;
      console.log(`  ⚠️ ${targetYear}년 데이터 부족, ${prevYear}년으로 재시도...`);
      games.length = 0;
      seenTitles.clear();
      targetYear = prevYear;
      await crawlYear(targetYear, axios, cheerio, headers, cleanTitle, games, seenTitles);
      console.log(`  메타크리틱 ${targetYear}년: ${games.length}개`);
    }

    // RAWG API로 각 게임의 포스터 이미지 가져오기
    console.log('  📸 게임 이미지 수집 중...');
    let imageCount = 0;
    for (const game of games) {
      const img = await fetchGameImage(game.title);
      if (img) {
        game.img = img;
        imageCount++;
      }
      // API 레이트 리밋 방지
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`  📸 이미지 수집 완료: ${imageCount}/${games.length}개`);

  } catch (err) {
    console.error('메타크리틱 크롤링 실패:', err.message);
  }

  return { year: targetYear, games };
}

module.exports = { fetchMetacriticGames };
