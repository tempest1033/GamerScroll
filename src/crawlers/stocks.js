/**
 * 네이버 증권 주가 크롤러
 * 게임주 현황 카드에 사용할 주가 데이터 수집
 * 게임 업종 종목 목록 자동 조회
 */

// 캐시된 게임주 목록
let cachedGameStocks = {};

/**
 * 네이버 증권에서 게임 업종 종목 목록 자동 조회
 * @param {Object} axios - axios 인스턴스
 * @param {Object} cheerio - cheerio 인스턴스
 * @returns {Object} 종목명 -> 종목코드 맵
 */
async function fetchGameStockList(axios, cheerio) {
  console.log('📈 게임 업종 종목 목록 조회 중...');
  try {
    // 네이버 증권 게임엔터테인먼트 업종 페이지
    const url = 'https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=263';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com/'
      },
      timeout: 10000,
      responseType: 'arraybuffer'
    });

    // EUC-KR 디코딩
    const iconv = require('iconv-lite');
    const html = iconv.decode(res.data, 'euc-kr');
    const $ = cheerio.load(html);

    const stockMap = {};
    // 테이블에서 종목 추출
    $('table.type_5 tbody tr').each((i, el) => {
      const nameEl = $(el).find('td:nth-child(1) a');
      const name = nameEl.text().trim();
      const href = nameEl.attr('href') || '';
      const codeMatch = href.match(/code=(\d{6})/);
      if (name && codeMatch) {
        stockMap[name] = codeMatch[1];
      }
    });

    if (Object.keys(stockMap).length > 0) {
      cachedGameStocks = stockMap;
      console.log(`  - 게임 업종 ${Object.keys(stockMap).length}개 종목 조회 완료`);
      return stockMap;
    }

    console.log('  - 게임 업종 종목 없음');
    return {};
  } catch (error) {
    console.error('  - 게임 업종 목록 조회 실패:', error.message);
    return cachedGameStocks;
  }
}

/**
 * 네이버 증권에서 종목 주가 데이터 가져오기 (웹 스크래핑)
 * 전일 종가와 등락률을 가져옴
 * @param {Object} axios - axios 인스턴스
 * @param {Object} cheerio - cheerio 인스턴스
 * @param {string} code - 종목 코드
 * @returns {Object|null} 주가 데이터
 */
async function fetchStockPrice(axios, cheerio, code) {
  try {
    const url = `https://finance.naver.com/item/sise_day.naver?code=${code}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com/'
      },
      timeout: 10000,
      responseType: 'arraybuffer'
    });

    const iconv = require('iconv-lite');
    const html = iconv.decode(res.data, 'euc-kr');
    const $ = cheerio.load(html);

    // 일별 시세 테이블에서 어제(전일) 종가 데이터 가져오기
    // 첫 번째 행은 오늘 장중 데이터, 두 번째 행이 어제 종가
    const rows = $('table.type2 tr');
    const dataRows = [];

    rows.each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 7) {
        const dateText = $(tds[0]).text().trim();
        if (dateText && dateText.match(/\d{4}\.\d{2}\.\d{2}/)) {
          const priceText = $(tds[1]).text().trim().replace(/,/g, '');
          const price = parseInt(priceText, 10);

          // 등락 방향 및 변동값 확인
          const changeCell = $(tds[2]);
          // span.tah 에서 숫자만 추출 (예: "7,000")
          const changeNumText = changeCell.find('span.tah').text().trim().replace(/,/g, '');
          let change = parseInt(changeNumText, 10) || 0;
          // em.bu_pdn 클래스가 있으면 하락 (음수)
          if (changeCell.find('em.bu_pdn').length > 0) {
            change = -change;
          }

          const changePercent = price > 0 ? (change / (price - change)) * 100 : 0;

          dataRows.push({
            date: dateText,
            price: price,
            change: change,
            changePercent: parseFloat(changePercent.toFixed(2)),
            high: parseInt($(tds[3]).text().trim().replace(/,/g, ''), 10) || price,
            low: parseInt($(tds[4]).text().trim().replace(/,/g, ''), 10) || price,
            volume: parseInt($(tds[5]).text().trim().replace(/,/g, ''), 10) || 0
          });
        }
      }
    });

    // 두 번째 행(어제 종가) 반환, 없으면 첫 번째 행
    return dataRows.length >= 2 ? dataRows[1] : dataRows[0] || null;
  } catch (error) {
    console.error(`  - ${code} 주가 조회 실패:`, error.message);
    return null;
  }
}

/**
 * AI가 선정한 종목들의 주가 데이터 가져오기
 * @param {Object} axios - axios 인스턴스
 * @param {Object} cheerio - cheerio 인스턴스
 * @param {Array} stocksList - AI가 선정한 종목 [{name, comment}]
 * @returns {Object} { stockMap: 전체종목맵, pricesMap: 주가데이터맵 }
 */
async function fetchStockPrices(axios, cheerio, stocksList) {
  // 1. 게임 업종 종목 목록 자동 조회
  const stockMap = await fetchGameStockList(axios, cheerio);

  // 2. AI가 선정한 종목들의 코드 찾기
  const codes = stocksList.map(stock => stockMap[stock.name]).filter(Boolean);

  // 3. 주가 조회
  console.log('📈 게임주 주가 데이터 수집 중...');
  const pricesMap = {};

  const promises = codes.map(async (code) => {
    const priceData = await fetchStockPrice(axios, cheerio, code);
    if (priceData) {
      pricesMap[code] = priceData;
    }
  });

  await Promise.all(promises);
  console.log(`  - ${Object.keys(pricesMap).length}개 종목 주가 수집 완료`);

  return { stockMap, pricesMap };
}

/**
 * 종목명으로 종목코드 조회 (캐시 사용)
 */
function getStockCode(name) {
  return cachedGameStocks[name] || null;
}

module.exports = {
  fetchGameStockList,
  fetchStockPrices,
  fetchStockPrice,
  getStockCode
};
