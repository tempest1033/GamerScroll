const { countries } = require('../crawlers/rankings');
function generateHTML(rankings, news, steam, youtube, chzzk, community, upcoming) {
  const now = new Date();
  // 15분 단위로 내림 (21:37 → 21:30)
  const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
  const reportDate = `${now.getMonth() + 1}월 ${now.getDate()}일 ${String(now.getHours()).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  const reportTime = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // 뉴스 HTML 생성 (소스별 분리)
  function generateNewsSection(items, sourceName, sourceUrl) {
    if (!items || items.length === 0) {
      return '<div class="no-data">뉴스를 불러올 수 없습니다</div>';
    }
    return items.map((item, i) => `
      <div class="news-item">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          <a href="${item.link}" target="_blank" rel="noopener">${item.title}</a>
        </div>
      </div>
    `).join('');
  }

  // 플랫폼별 기본 로고 SVG
  const platformLogos = {
    steam: '<svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.26-.626.263-1.316.009-1.946-.254-.63-.729-1.121-1.354-1.38a2.51 2.51 0 0 0-1.921-.046l1.522.63a1.846 1.846 0 0 1-.943 3.538 1.846 1.846 0 0 1-.486-.061zm8.412-5.88a3.017 3.017 0 0 0 3.015-3.015 3.017 3.017 0 0 0-3.015-3.015 3.017 3.017 0 0 0-3.015 3.015 3.019 3.019 0 0 0 3.015 3.015zm0-5.426a2.411 2.411 0 1 1 0 4.822 2.411 2.411 0 0 1 0-4.822z"/></svg>',
    nintendo: '<svg viewBox="0 0 24 24" fill="#e60012"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>',
    ps5: '<svg viewBox="0 0 24 24" fill="#003791"><path d="M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.876c2.441 1.193 4.362-.002 4.362-3.153 0-3.237-.794-4.819-3.067-5.559-1.445-.454-3.764-1.771-3.764-1.771v18.37l-2.997-.97V2.596z"/><path d="M2.015 17.206c0 .688.343 1.152.984.913l6.258-2.204v-2.21l-4.636 1.615c-.49.171-.761-.056-.761-.746V8.45L2.015 9.3v7.906z"/><path d="M19.016 13.066c1.027-.478 1.969-.078 1.969 1.155v4.192c0 1.233-.942 1.634-1.969 1.155l-5.966-2.738v-2.21l5.966 2.733z"/></svg>',
    mobile: '<svg viewBox="0 0 24 24" fill="#34a853"><rect x="5" y="2" width="14" height="20" rx="2" stroke="#34a853" stroke-width="2" fill="none"/><circle cx="12" cy="18" r="1.5" fill="#34a853"/></svg>'
  };

  // 출시 예정 게임 HTML 생성 (게임명 > 발매일 > 회사 순서)
  function generateUpcomingSection(items, platform) {
    if (!items || items.length === 0) {
      return '<div class="upcoming-empty">출시 예정 정보를 불러올 수 없습니다</div>';
    }
    const defaultLogo = platformLogos[platform] || platformLogos.mobile;
    return items.map((game, i) => {
      // Steam 게임인 경우 대체 이미지 URL 시도
      const isSteam = platform === 'steam' && game.appid;
      const fallbackImg = isSteam ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/capsule_231x87.jpg` : '';
      const onerrorHandler = isSteam
        ? `if(!this.dataset.retry){this.dataset.retry='1';this.src='${fallbackImg}';}else{this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none';}`
        : `this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none'`;

      return `
      <a class="upcoming-item" href="${game.link || '#'}" target="_blank" rel="noopener">
        <span class="upcoming-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
        ${game.img ? `<img class="upcoming-icon" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="${onerrorHandler}">` : ''}<div class="upcoming-icon-placeholder ${game.img ? 'hidden' : ''}">${defaultLogo}</div>
        <div class="upcoming-info">
          <div class="upcoming-name">${game.name}</div>
          ${game.releaseDate ? `<div class="upcoming-date">${game.releaseDate}</div>` : ''}
          ${game.publisher ? `<div class="upcoming-publisher">${game.publisher}</div>` : ''}
        </div>
      </a>
    `;
    }).join('');
  }

  const invenNewsHTML = generateNewsSection(news.inven);
  const ruliwebNewsHTML = generateNewsSection(news.ruliweb);
  const gamemecaNewsHTML = generateNewsSection(news.gamemeca);
  const thisisgameNewsHTML = generateNewsSection(news.thisisgame);

  // 커뮤니티 인기글 HTML 생성
  const communityUrls = {
    ruliweb: 'https://bbs.ruliweb.com/best/humor',
    arca: 'https://arca.live/b/live',
    dcinside: 'https://gall.dcinside.com/board/lists?id=dcbest',
    inven: 'https://www.inven.co.kr/board/webzine/2097'
  };

  function generateCommunitySection(items, source) {
    if (!items || items.length === 0) {
      return '<div class="no-data">인기글을 불러올 수 없습니다</div>';
    }
    return items.map((item, i) => {
      const channelTag = item.channel ? `<span class="community-tag">${item.channel}</span>` : '';
      return `
      <a class="news-item clickable" href="${item.link}" target="_blank" rel="noopener">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          ${channelTag}<span class="news-title">${item.title}</span>
        </div>
      </a>
    `;
    }).join('');
  }

  const ruliwebCommunityHTML = generateCommunitySection(community?.ruliweb || [], 'ruliweb');
  const arcaCommunityHTML = generateCommunitySection(community?.arca || [], 'arca');
  const dcsideCommunityHTML = generateCommunitySection(community?.dcinside || [], 'dcinside');
  const invenCommunityHTML = generateCommunitySection(community?.inven || [], 'inven');

  // ========== 홈 서머리 섹션 생성 ==========

  // 홈 뉴스 요약 (좌: 카드, 우: 리스트)
  function generateHomeNews() {
    const sources = [
      { key: 'inven', items: news.inven || [], name: '인벤', icon: 'https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32' },
      { key: 'thisisgame', items: news.thisisgame || [], name: '디스이즈게임', icon: 'https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32' },
      { key: 'gamemeca', items: news.gamemeca || [], name: '게임메카', icon: 'https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32' },
      { key: 'ruliweb', items: news.ruliweb || [], name: '루리웹', icon: 'https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32' }
    ];

    const fixUrl = (url) => url && url.startsWith('//') ? 'https:' + url : url;

    // 뉴스 컨텐츠 생성 함수
    function renderNewsContent(items, sourceName = null) {
      if (items.length === 0) {
        return '<div class="home-empty">뉴스를 불러올 수 없습니다</div>';
      }
      const withThumb = items.filter(item => item.thumbnail);
      const mainCard = withThumb[0];
      const subCards = withThumb.slice(1, 3);
      const listItems = withThumb.slice(3, 9);

      return `
        <div class="home-news-split">
          <div class="home-news-cards">
            ${mainCard ? `
              <a class="home-news-card home-news-card-main" href="${mainCard.link}" target="_blank" rel="noopener">
                <div class="home-news-card-thumb">
                  <img src="${fixUrl(mainCard.thumbnail)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>'">
                </div>
                <div class="home-news-card-info">
                  <span class="home-news-card-title">${mainCard.title}</span>
                  <span class="home-news-card-source">${sourceName || mainCard.source}</span>
                </div>
              </a>
            ` : ''}
            <div class="home-news-sub-cards">
              ${subCards.map(item => `
                <a class="home-news-card home-news-card-sub" href="${item.link}" target="_blank" rel="noopener">
                  <div class="home-news-card-thumb">
                    <img src="${fixUrl(item.thumbnail)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>'">
                  </div>
                  <div class="home-news-card-info">
                    <span class="home-news-card-title">${item.title}</span>
                    <span class="home-news-card-source">${sourceName || item.source}</span>
                  </div>
                </a>
              `).join('')}
            </div>
          </div>
          <div class="home-news-list">
            ${listItems.map(item => `
              <a class="home-news-item" href="${item.link}" target="_blank" rel="noopener">
                <div class="home-news-item-thumb">
                  <img src="${fixUrl(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">
                </div>
                <div class="home-news-item-info">
                  <span class="home-news-title">${item.title}</span>
                  <span class="home-news-source-tag">${sourceName || item.source}</span>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 전체 탭용 데이터 (각 소스에서 섞어서 + 랜덤 셔플)
    let allCombined = [];
    sources.forEach(src => {
      src.items.slice(0, 4).forEach(item => {
        allCombined.push({ ...item, source: src.name, icon: src.icon });
      });
    });
    // 랜덤 셔플
    for (let i = allCombined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCombined[i], allCombined[j]] = [allCombined[j], allCombined[i]];
    }

    // 탭 버튼 + 컨텐츠 (iOS/Android 스타일)
    return `
      <div class="home-news-tabs">
        <button class="home-news-tab active" data-news="all">전체</button>
        <button class="home-news-tab" data-news="inven">
          <img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="">인벤
        </button>
        <button class="home-news-tab" data-news="thisisgame">
          <img src="https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32" alt="">디스이즈게임
        </button>
        <button class="home-news-tab" data-news="gamemeca">
          <img src="https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32" alt="">게임메카
        </button>
        <button class="home-news-tab" data-news="ruliweb">
          <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="">루리웹
        </button>
      </div>
      <div class="home-news-body">
        <div class="home-news-panel active" id="home-news-all">${renderNewsContent(allCombined)}</div>
        <div class="home-news-panel" id="home-news-inven">${renderNewsContent(sources[0].items.map(item => ({ ...item, source: '인벤' })), '인벤')}</div>
        <div class="home-news-panel" id="home-news-thisisgame">${renderNewsContent(sources[1].items.map(item => ({ ...item, source: '디스이즈게임' })), '디스이즈게임')}</div>
        <div class="home-news-panel" id="home-news-gamemeca">${renderNewsContent(sources[2].items.map(item => ({ ...item, source: '게임메카' })), '게임메카')}</div>
        <div class="home-news-panel" id="home-news-ruliweb">${renderNewsContent(sources[3].items.map(item => ({ ...item, source: '루리웹' })), '루리웹')}</div>
      </div>
    `;
  }

  // 홈 커뮤니티 요약 (탭 + 좌우 5개씩 총 10개)
  function generateHomeCommunity() {
    const sources = [
      { key: 'dcinside', items: community?.dcinside || [], name: '디시인사이드', icon: 'https://www.google.com/s2/favicons?domain=dcinside.com&sz=32' },
      { key: 'arca', items: community?.arca || [], name: '아카라이브', icon: 'https://www.google.com/s2/favicons?domain=arca.live&sz=32' },
      { key: 'inven', items: community?.inven || [], name: '인벤', icon: 'https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32' },
      { key: 'ruliweb', items: community?.ruliweb || [], name: '루리웹', icon: 'https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32' }
    ];

    // 전체 탭용 데이터 (각 소스에서 섞어서 + 랜덤 셔플)
    let allCombined = [];
    sources.forEach(src => {
      src.items.slice(0, 3).forEach(item => {
        allCombined.push({ ...item, source: src.name, icon: src.icon });
      });
    });
    // 랜덤 셔플
    for (let i = allCombined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCombined[i], allCombined[j]] = [allCombined[j], allCombined[i]];
    }
    allCombined = allCombined.slice(0, 10);

    // 좌우 분할 렌더링 함수
    function renderCommunitySplit(items, sourceName = null) {
      if (items.length === 0) {
        return '<div class="home-empty">인기글을 불러올 수 없습니다</div>';
      }
      const leftItems = items.slice(0, 5);
      const rightItems = items.slice(5, 10);

      function renderColumn(columnItems) {
        return columnItems.map(item => `
          <a class="home-community-item" href="${item.link}" target="_blank" rel="noopener">
            <span class="home-community-title">${item.title}</span>
            <span class="home-community-meta">
              <img src="${item.icon}" alt="">
              <span class="home-community-source">${sourceName || item.source}</span>
              ${item.channel ? `<span class="home-community-channel">· ${item.channel}</span>` : ''}
            </span>
          </a>
        `).join('');
      }

      return `
        <div class="home-community-split">
          <div class="home-community-column">${renderColumn(leftItems)}</div>
          <div class="home-community-column">${renderColumn(rightItems)}</div>
        </div>
      `;
    }

    return `
      <div class="home-community-tabs">
        <button class="home-community-tab active" data-community="all">전체</button>
        <button class="home-community-tab" data-community="dcinside">
          <img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="">디시인사이드
        </button>
        <button class="home-community-tab" data-community="arca">
          <img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="">아카라이브
        </button>
        <button class="home-community-tab" data-community="inven">
          <img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="">인벤
        </button>
        <button class="home-community-tab" data-community="ruliweb">
          <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="">루리웹
        </button>
      </div>
      <div class="home-community-body">
        <div class="home-community-panel active" id="home-community-all">${renderCommunitySplit(allCombined)}</div>
        <div class="home-community-panel" id="home-community-dcinside">${renderCommunitySplit(sources[0].items.slice(0, 10).map(item => ({ ...item, icon: sources[0].icon })), '디시인사이드')}</div>
        <div class="home-community-panel" id="home-community-arca">${renderCommunitySplit(sources[1].items.slice(0, 10).map(item => ({ ...item, icon: sources[1].icon })), '아카라이브')}</div>
        <div class="home-community-panel" id="home-community-inven">${renderCommunitySplit(sources[2].items.slice(0, 10).map(item => ({ ...item, icon: sources[2].icon })), '인벤')}</div>
        <div class="home-community-panel" id="home-community-ruliweb">${renderCommunitySplit(sources[3].items.slice(0, 10).map(item => ({ ...item, icon: sources[3].icon })), '루리웹')}</div>
      </div>
    `;
  }

  // 홈 영상 요약 (유튜브 인기 / 치지직 탭)
  function generateHomeVideo() {
    const youtubeItems = (youtube?.gaming || []).slice(0, 9).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: `https://www.youtube.com/watch?v=${item.videoId}`,
      platform: 'youtube'
    }));

    const chzzkItems = (chzzk || []).slice(0, 9).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: `https://chzzk.naver.com/live/${item.channelId}`,
      platform: 'chzzk',
      viewers: item.viewers
    }));

    function renderVideoGrid(items) {
      if (items.length === 0) {
        return '<div class="home-empty">영상을 불러올 수 없습니다</div>';
      }
      const mainItem = items[0];
      const subItems = items.slice(1, 3);
      const listItems = items.slice(3, 9);
      return `
        <div class="home-video-split">
          <div class="home-video-cards">
            <a class="home-video-card home-video-card-main" href="${mainItem.link}" target="_blank" rel="noopener">
              <div class="home-video-card-thumb">
                <img src="${mainItem.thumbnail}" alt="" loading="lazy">
                ${mainItem.viewers ? `<span class="home-video-live">🔴 LIVE ${mainItem.viewers.toLocaleString()}</span>` : ''}
              </div>
              <div class="home-video-card-info">
                <div class="home-video-card-title">${mainItem.title}</div>
                <div class="home-video-card-channel">${mainItem.channel}</div>
              </div>
            </a>
            <div class="home-video-sub-cards">
              ${subItems.map(item => `
                <a class="home-video-card home-video-card-sub" href="${item.link}" target="_blank" rel="noopener">
                  <div class="home-video-card-thumb">
                    <img src="${item.thumbnail}" alt="" loading="lazy">
                    ${item.viewers ? `<span class="home-video-live">🔴 ${item.viewers.toLocaleString()}</span>` : ''}
                  </div>
                  <div class="home-video-card-info">
                    <div class="home-video-card-title">${item.title}</div>
                    <div class="home-video-card-channel">${item.channel}</div>
                  </div>
                </a>
              `).join('')}
            </div>
          </div>
          <div class="home-video-list">
            ${listItems.map(item => `
              <a class="home-video-item" href="${item.link}" target="_blank" rel="noopener">
                <div class="home-video-item-thumb">
                  <img src="${item.thumbnail}" alt="" loading="lazy">
                  ${item.viewers ? `<span class="home-video-live-sm">🔴 ${item.viewers.toLocaleString()}</span>` : ''}
                </div>
                <div class="home-video-item-info">
                  <div class="home-video-item-title">${item.title}</div>
                  <div class="home-video-item-channel">${item.channel}</div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="home-video-tabs">
        <button class="home-video-tab active" data-video="youtube">
          <img src="https://www.google.com/s2/favicons?domain=youtube.com&sz=32" alt="">인기 동영상
        </button>
        <button class="home-video-tab" data-video="chzzk">
          <img src="https://www.google.com/s2/favicons?domain=chzzk.naver.com&sz=32" alt="">치지직
        </button>
      </div>
      <div class="home-video-body">
        <div class="home-video-panel active" id="home-video-youtube">${renderVideoGrid(youtubeItems)}</div>
        <div class="home-video-panel" id="home-video-chzzk">${renderVideoGrid(chzzkItems)}</div>
      </div>
    `;
  }

  // 홈 모바일 랭킹 (한국 iOS/Android 매출/인기 Top 10)
  function generateHomeMobileRank() {
    const grossingKr = rankings?.grossing?.kr || {};
    const freeKr = rankings?.free?.kr || {};

    function renderList(items) {
      if (items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map((app, i) => `
        <div class="home-rank-row">
          <span class="home-rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="home-rank-icon" src="${app.icon || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <span class="home-rank-name">${app.title}</span>
        </div>
      `).join('');
    }

    return `
      <div class="home-rank-tabs">
        <button class="home-rank-tab active" data-platform="ios">
          <img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="">iOS
        </button>
        <button class="home-rank-tab" data-platform="android">
          <img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="">Android
        </button>
      </div>
      <div class="home-rank-content">
        <!-- 매출 순위 -->
        <div class="home-rank-chart active" id="home-chart-grossing">
          <div class="home-rank-list active" id="home-rank-grossing-ios">${renderList((grossingKr.ios || []).slice(0, 10))}</div>
          <div class="home-rank-list" id="home-rank-grossing-android">${renderList((grossingKr.android || []).slice(0, 10))}</div>
        </div>
        <!-- 인기 순위 -->
        <div class="home-rank-chart" id="home-chart-free">
          <div class="home-rank-list active" id="home-rank-free-ios">${renderList((freeKr.ios || []).slice(0, 10))}</div>
          <div class="home-rank-list" id="home-rank-free-android">${renderList((freeKr.android || []).slice(0, 10))}</div>
        </div>
      </div>
    `;
  }

  // 홈 스팀 순위 (인기/매출 Top 10)
  function generateHomeSteam() {
    const mostPlayed = (steam?.mostPlayed || []).slice(0, 10);
    const topSellers = (steam?.topSellers || []).slice(0, 10);

    function renderList(items, showPlayers = false) {
      if (items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map((game, i) => {
        const link = game.appid ? `https://store.steampowered.com/app/${game.appid}` : '#';
        return `
        <a class="home-steam-row" href="${link}" target="_blank" rel="noopener">
          <span class="home-rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="home-steam-icon" src="${game.img || ''}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23374151%22 width=%2240%22 height=%2240%22 rx=%228%22/><text x=%2250%%22 y=%2255%%22 font-size=%2216%22 fill=%22%239ca3af%22 text-anchor=%22middle%22>🎮</text></svg>'">
          <div class="home-steam-info">
            <span class="home-steam-name">${game.name || ''}</span>
            ${showPlayers ? `<span class="home-steam-players">${game.ccu?.toLocaleString() || '-'} 명</span>` : ''}
          </div>
        </a>
      `}).join('');
    }

    return `
      <div class="home-steam-chart active" id="home-steam-mostplayed">${renderList(mostPlayed, true)}</div>
      <div class="home-steam-chart" id="home-steam-topsellers">${renderList(topSellers, false)}</div>
    `;
  }

  // 홈 신규 게임 (모바일/스팀/PS5/닌텐도 탭)
  function generateHomeUpcoming() {
    const platforms = {
      mobile: { name: '모바일', items: (upcoming?.mobile || []).slice(0, 10) },
      steam: { name: '스팀', items: (upcoming?.steam || []).slice(0, 10) },
      ps5: { name: 'PS5', items: (upcoming?.ps5 || []).slice(0, 10) },
      nintendo: { name: '닌텐도', items: (upcoming?.nintendo || []).slice(0, 10) }
    };

    function renderList(items) {
      if (items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map((game, i) => `
        <a class="home-upcoming-row" href="${game.link || '#'}" target="_blank" rel="noopener">
          <span class="home-rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="home-upcoming-icon" src="${game.img || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="home-upcoming-info">
            <span class="home-upcoming-name">${game.name || game.title || ''}</span>
            ${game.releaseDate ? `<span class="home-upcoming-date">${game.releaseDate}</span>` : ''}
          </div>
        </a>
      `).join('');
    }

    return `
      <div class="home-upcoming-tabs">
        <button class="home-upcoming-tab active" data-upcoming="mobile">모바일</button>
        <button class="home-upcoming-tab" data-upcoming="steam">스팀</button>
        <button class="home-upcoming-tab" data-upcoming="ps5">PS5</button>
        <button class="home-upcoming-tab" data-upcoming="nintendo">닌텐도</button>
      </div>
      <div class="home-upcoming-content">
        <div class="home-upcoming-list active" id="home-upcoming-mobile">${renderList(platforms.mobile.items)}</div>
        <div class="home-upcoming-list" id="home-upcoming-steam">${renderList(platforms.steam.items)}</div>
        <div class="home-upcoming-list" id="home-upcoming-ps5">${renderList(platforms.ps5.items)}</div>
        <div class="home-upcoming-list" id="home-upcoming-nintendo">${renderList(platforms.nintendo.items)}</div>
      </div>
    `;
  }

  // 국가별 컬럼 생성 함수
  function generateCountryColumns(chartData) {
    return countries.map(c => {
      const items = chartData[c.code]?.ios || [];
      const rows = items.length > 0 ? items.map((app, i) => `
        <div class="rank-row">
          <span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
          <div class="app-info">
            <div class="app-name">${app.title}</div>
            <div class="app-dev">${app.developer}</div>
          </div>
        </div>
      `).join('') : '<div class="no-data">데이터 없음</div>';

      return `
        <div class="country-column">
          <div class="column-header">
            <span class="flag">${c.flag}</span>
            <span class="country-name">${c.name}</span>
          </div>
          <div class="rank-list">${rows}</div>
        </div>
      `;
    }).join('');
  }

  function generateAndroidColumns(chartData) {
    return countries.map(c => {
      const items = chartData[c.code]?.android || [];
      let rows;

      if (c.code === 'cn') {
        rows = '';
      } else if (items.length > 0) {
        rows = items.map((app, i) => `
          <div class="rank-row">
            <span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
            <img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
            <div class="app-info">
              <div class="app-name">${app.title}</div>
              <div class="app-dev">${app.developer}</div>
            </div>
          </div>
        `).join('');
      } else {
        rows = '<div class="no-data">데이터 없음</div>';
      }

      return `
        <div class="country-column">
          <div class="column-header">
            <span class="flag">${c.flag}</span>
            <span class="country-name">${c.name}</span>
          </div>
          <div class="rank-list">${rows}</div>
        </div>
      `;
    }).join('');
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GAMERS CRAWL | Daily Report</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%234f46e5'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='4' y='26' width='7' height='16' rx='3.5' fill='url(%23g)' opacity='.4'/%3E%3Crect x='14' y='20' width='7' height='28' rx='3.5' fill='url(%23g)' opacity='.7'/%3E%3Crect x='24' y='14' width='7' height='40' rx='3.5' fill='url(%23g)'/%3E%3Crect x='33' y='14' width='7' height='40' rx='3.5' fill='url(%23g)'/%3E%3Crect x='43' y='20' width='7' height='28' rx='3.5' fill='url(%23g)' opacity='.7'/%3E%3Crect x='53' y='26' width='7' height='16' rx='3.5' fill='url(%23g)' opacity='.4'/%3E%3C/svg%3E">
  <!-- 폰트 preload로 FOUT 방지 -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <!-- 이미지 도메인 preconnect -->
  <link rel="preconnect" href="https://play-lh.googleusercontent.com">
  <link rel="preconnect" href="https://is1-ssl.mzstatic.com">
  <link rel="preconnect" href="https://i.ytimg.com">
  <link rel="preconnect" href="https://cdn.cloudflare.steamstatic.com">
  <link rel="preconnect" href="https://www.google.com">
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-SemiBold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="styles.css">
  <script src="https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
  <!-- Firebase Analytics -->
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
    import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js";
    const firebaseConfig = {
      apiKey: "AIzaSyBlVfvAGVrhEEMPKpDKJBrOPF7BINleV7I",
      authDomain: "gamerscrawl-b104b.firebaseapp.com",
      projectId: "gamerscrawl-b104b",
      storageBucket: "gamerscrawl-b104b.firebasestorage.app",
      messagingSenderId: "831886529376",
      appId: "1:831886529376:web:2d9f0f64782fa5e5e80405",
      measurementId: "G-2269FV044J"
    };
    const app = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);
  </script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825"
     crossorigin="anonymous"></script>
  <script>
    // 전체 크롤링 데이터 (랜덤 선택용)
    const allNewsData = ${JSON.stringify([
      ...(news.inven || []).map(item => ({ ...item, source: '인벤', icon: 'https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32' })),
      ...(news.thisisgame || []).map(item => ({ ...item, source: '디스이즈게임', icon: 'https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32' })),
      ...(news.gamemeca || []).map(item => ({ ...item, source: '게임메카', icon: 'https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32' })),
      ...(news.ruliweb || []).map(item => ({ ...item, source: '루리웹', icon: 'https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32' }))
    ].filter(item => item.thumbnail))};
    const allCommunityData = ${JSON.stringify([
      ...(community?.dcinside || []).map(item => ({ ...item, source: '디시인사이드', icon: 'https://www.google.com/s2/favicons?domain=dcinside.com&sz=32' })),
      ...(community?.arca || []).map(item => ({ ...item, source: '아카라이브', icon: 'https://www.google.com/s2/favicons?domain=arca.live&sz=32' })),
      ...(community?.inven || []).map(item => ({ ...item, source: '인벤', icon: 'https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32' })),
      ...(community?.ruliweb || []).map(item => ({ ...item, source: '루리웹', icon: 'https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32' }))
    ])};
    const allYoutubeData = ${JSON.stringify((youtube?.gaming || []).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: 'https://www.youtube.com/watch?v=' + item.videoId
    })))};
    const allChzzkData = ${JSON.stringify((chzzk || []).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: 'https://chzzk.naver.com/live/' + item.channelId,
      viewers: item.viewers
    })))};
  </script>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <h1 class="header-title" id="logo-home" style="cursor: pointer;">
        <svg class="logo-svg" viewBox="0 0 660 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#4f46e5" />
              <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
          </defs>

          <!-- 중앙 정렬 텍스트 -->
          <!-- dominant-baseline을 사용하여 수직 중앙 정렬 보정 -->
          <text class="logo-text-svg" x="50%" y="50%" dy="2" font-family="'Pretendard', -apple-system, sans-serif" font-size="62" font-weight="900" fill="currentColor" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.5">GAMERS CRAWL</text>

          <!-- 장식: Tech Signals (Bar Width: 10px, Corner: 5px) -->
          <!-- 높이 72px 기준 수직 중앙 정렬 (Y = (72-H)/2) -->

          <!-- 왼쪽 안테나 -->
          <rect x="8" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
          <rect x="26" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
          <rect x="44" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>

          <!-- 오른쪽 안테나 (왼쪽과 완벽 대칭) -->
          <rect x="606" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
          <rect x="624" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
          <rect x="642" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
        </svg>
      </h1>
    </div>
  </header>

  <nav class="nav">
    <div class="nav-inner">
      <div class="nav-item" data-section="community">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/></svg>
        커뮤니티
      </div>
      <div class="nav-item" data-section="youtube">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        영상 순위
      </div>
      <div class="nav-item" data-section="news">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
        주요 뉴스
      </div>
      <div class="nav-item" data-section="rankings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
        모바일 순위
      </div>
      <div class="nav-item" data-section="steam">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>
        스팀 순위
      </div>
      <div class="nav-item" data-section="upcoming">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        출시 게임
      </div>
    </div>
  </nav>

  <main class="container">
    <!-- 홈 서머리 섹션 -->
    <section class="home-section active" id="home">
      <div class="home-container">
        <!-- 좌측 메인 영역 -->
        <div class="home-main">
          <!-- 상단 광고 (좌측 컬럼 위) -->
          <div class="ad-slot home-main-ad">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
          </div>

          <!-- 뉴스 요약 -->
          <div class="home-card">
            <div class="home-card-header">
              <div class="home-card-title">주요 뉴스</div>
              <a href="#" class="home-card-more" data-goto="news">더보기 →</a>
            </div>
            <div class="home-card-body" style="padding: 0;">${generateHomeNews()}</div>
          </div>

          <!-- 커뮤니티 요약 -->
          <div class="home-card">
            <div class="home-card-header">
              <div class="home-card-title">커뮤니티 베스트</div>
              <a href="#" class="home-card-more" data-goto="community">더보기 →</a>
            </div>
            <div class="home-card-body" style="padding: 0;">${generateHomeCommunity()}</div>
          </div>

          <!-- 광고 슬롯 2 -->
          <div class="ad-slot">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
          </div>

          <!-- 영상 요약 -->
          <div class="home-card">
            <div class="home-card-header">
              <div class="home-card-title">영상 순위</div>
              <a href="#" class="home-card-more" data-goto="youtube">더보기 →</a>
            </div>
            <div class="home-card-body" style="padding: 0;">${generateHomeVideo()}</div>
          </div>
        </div>

        <!-- 우측 사이드바 -->
        <div class="home-sidebar">
          <!-- 모바일 랭킹 (한국 Top 10) -->
          <div class="home-card">
            <div class="home-card-header">
              <div class="home-card-title">모바일 랭킹</div>
              <div class="home-card-controls">
                <div class="home-chart-toggle" id="homeChartTab">
                  <button class="tab-btn small active" data-home-chart="grossing">매출</button>
                  <button class="tab-btn small" data-home-chart="free">인기</button>
                </div>
                <a href="#" class="home-card-more" data-goto="rankings">더보기 →</a>
              </div>
            </div>
            <div class="home-card-body" style="padding: 0;">${generateHomeMobileRank()}</div>
          </div>

          <!-- 우측 광고 A -->
          <div class="ad-slot">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="rectangle" data-full-width-responsive="true"></ins>
          </div>

          <!-- 스팀 순위 -->
          <div class="home-card">
            <div class="home-card-header">
              <div class="home-card-title">스팀 순위</div>
              <div class="home-card-controls">
                <div class="home-chart-toggle" id="homeSteamTab">
                  <button class="tab-btn small active" data-home-steam="mostplayed">인기</button>
                  <button class="tab-btn small" data-home-steam="topsellers">매출</button>
                </div>
                <a href="#" class="home-card-more" data-goto="steam">더보기 →</a>
              </div>
            </div>
            <div class="home-card-body" style="padding: 8px 0;">${generateHomeSteam()}</div>
          </div>

          <!-- 우측 광고 B (PC only) -->
          <div class="ad-slot pc-only">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="rectangle" data-full-width-responsive="true"></ins>
          </div>

          <!-- 신규 게임 -->
          <div class="home-card">
            <div class="home-card-header">
              <div class="home-card-title">신규 게임</div>
              <a href="#" class="home-card-more" data-goto="upcoming">더보기 →</a>
            </div>
            <div class="home-card-body" style="padding: 0;">${generateHomeUpcoming()}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 주요 뉴스 섹션 -->
    <section class="section" id="news">
      <!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="newsTab">
            <button class="tab-btn active" data-news="inven"><img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">인벤</button>
            <button class="tab-btn" data-news="thisisgame"><img src="https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32" alt="" class="news-favicon">디스이즈게임</button>
            <button class="tab-btn" data-news="gamemeca"><img src="https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32" alt="" class="news-favicon">게임메카</button>
            <button class="tab-btn" data-news="ruliweb"><img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">루리웹</button>
          </div>
        </div>
      </div>
      <div class="news-card">
        <div class="news-container">
          <div class="news-panel" id="news-inven">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">인벤</span>
              <a href="https://www.inven.co.kr/webzine/news/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${invenNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-thisisgame">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">디스이즈게임</span>
              <a href="https://www.thisisgame.com" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${thisisgameNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-gamemeca">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">게임메카</span>
              <a href="https://www.gamemeca.com" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${gamemecaNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-ruliweb">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹</span>
              <a href="https://bbs.ruliweb.com/news" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${ruliwebNewsHTML}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 커뮤니티 인기글 섹션 -->
    <section class="section" id="community">
      <!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="communityTab">
            <button class="tab-btn active" data-community="dcinside"><img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="" class="news-favicon">디시인사이드</button>
            <button class="tab-btn" data-community="arca"><img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">아카라이브</button>
            <button class="tab-btn" data-community="inven"><img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">인벤</button>
            <button class="tab-btn" data-community="ruliweb"><img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">루리웹</button>
          </div>
        </div>
      </div>
      <div class="news-card">
        <div class="news-container">
          <div class="news-panel" id="community-dcinside">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);">
              <img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">디시 실시간 베스트</span>
              <a href="https://gall.dcinside.com/board/lists?id=dcbest" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${dcsideCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-arca">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
              <img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">아카라이브 베스트</span>
              <a href="https://arca.live/b/live" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${arcaCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-inven">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);">
              <img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">인벤 핫이슈</span>
              <a href="https://hot.inven.co.kr/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${invenCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-ruliweb">
            <div class="news-panel-header" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
              <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹 게임 베스트</span>
              <a href="https://bbs.ruliweb.com/best/game?orderby=recommend&range=24h" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${ruliwebCommunityHTML}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 마켓 순위 섹션 -->
    <section class="section" id="rankings">
      <!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>
      <div class="rankings-controls">
        <div class="control-group">
          <div class="tab-group" id="storeTab">
            <button class="tab-btn ios-btn active" data-store="ios"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="" class="news-favicon">App Store</button>
            <button class="tab-btn android-btn" data-store="android"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="" class="news-favicon">Google Play</button>
          </div>
        </div>
        <div class="control-group">
          <div class="tab-group" id="chartTab">
            <button class="tab-btn grossing-btn active" data-chart="grossing">매출 순위</button>
            <button class="tab-btn free-btn" data-chart="free">인기 순위</button>
          </div>
        </div>
      </div>

      <div class="rankings-card">
        <div class="chart-section active" id="ios-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="ios-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.free)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.free)}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 스팀 순위 섹션 -->
    <section class="section" id="steam">
      <!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>
      <div class="steam-controls">
        <div class="tab-group" id="steamTab">
          <button class="tab-btn steam-btn active" data-steam="mostplayed"><img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="" class="news-favicon">최다 플레이</button>
          <button class="tab-btn steam-btn" data-steam="topsellers"><img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="" class="news-favicon">최고 판매</button>
        </div>
      </div>

      <!-- 최다 플레이 -->
      <div class="steam-section active" id="steam-mostplayed">
        <div class="steam-table">
          <div class="steam-table-header">
            <div>순위</div>
            <div>게임</div>
            <div>접속자수</div>
          </div>
          ${steam.mostPlayed.map((game, i) => `
            <div class="steam-table-row">
              <div class="steam-col-rank">
                <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="steam-col-game">
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="steam-img-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg></div>
                <div class="steam-game-info">
                  <div class="steam-game-name">${game.name}</div>
                  <div class="steam-game-dev">${game.developer}</div>
                </div>
              </div>
              <div class="steam-col-players">${game.ccu.toLocaleString()}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 최고 판매 -->
      <div class="steam-section" id="steam-topsellers">
        <div class="steam-table">
          <div class="steam-table-header">
            <div>순위</div>
            <div>게임</div>
            <div>가격</div>
          </div>
          ${steam.topSellers.map((game, i) => `
            <div class="steam-table-row">
              <div class="steam-col-rank">
                <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="steam-col-game">
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="steam-img-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg></div>
                <div class="steam-game-info">
                  <div class="steam-game-name">${game.name}</div>
                  <div class="steam-game-dev">${game.developer}</div>
                </div>
              </div>
              <div class="steam-col-players steam-price-info">${game.discount ? `<span class="steam-discount">${game.discount}</span>` : ''}<span class="steam-price">${game.price}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- 영상 섹션 -->
    <section class="section" id="youtube">
      <!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>
      <div class="video-controls">
        <div class="tab-group" id="videoTab">
          <button class="tab-btn active" data-video="gaming"><img src="https://www.google.com/s2/favicons?domain=youtube.com&sz=32" alt="" class="news-favicon">유튜브 인기</button>
          <button class="tab-btn" data-video="chzzk"><img src="https://www.google.com/s2/favicons?domain=chzzk.naver.com&sz=32" alt="" class="news-favicon">치지직 라이브</button>
        </div>
      </div>

      <!-- 게임 (유튜브 게임 카테고리) -->
      <div class="video-section active" id="video-gaming">
        ${youtube.gaming.length > 0 ? `
        <div class="youtube-grid">
          ${youtube.gaming.map((video, i) => `
            <a class="youtube-card" href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank">
              <div class="youtube-thumbnail">
                <img src="${video.thumbnail}" alt="" loading="lazy" decoding="async">
                <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="youtube-info">
                <div class="youtube-title">${video.title}</div>
                <div class="youtube-channel">${video.channel}</div>
                <div class="youtube-views">조회수 ${video.views.toLocaleString()}회</div>
              </div>
            </a>
          `).join('')}
        </div>
        ` : `<div class="youtube-empty"><p>데이터를 불러올 수 없습니다.</p></div>`}
      </div>

      <!-- 치지직 라이브 -->
      <div class="video-section" id="video-chzzk">
        ${chzzk.length > 0 ? `
        <div class="youtube-grid">
          ${chzzk.map((live, i) => `
            <a class="youtube-card" href="https://chzzk.naver.com/live/${live.channelId}" target="_blank">
              <div class="youtube-thumbnail">
                <img src="${live.thumbnail}" alt="" loading="lazy" decoding="async">
                <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
                <span class="live-badge">LIVE</span>
              </div>
              <div class="youtube-info">
                <div class="youtube-title">${live.title}</div>
                <div class="youtube-channel">${live.channel}</div>
                <div class="youtube-views">시청자 ${live.viewers.toLocaleString()}명</div>
              </div>
            </a>
          `).join('')}
        </div>
        ` : `<div class="youtube-empty"><p>치지직 데이터를 불러올 수 없습니다.</p></div>`}
      </div>

    </section>

    <!-- 출시 게임 섹션 -->
    <section class="section" id="upcoming">
      <!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>
      <div class="upcoming-controls">
        <div class="tab-group" id="upcomingTab">
          <button class="tab-btn active" data-upcoming="mobile">
            <img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="" class="news-favicon">모바일
          </button>
          <button class="tab-btn" data-upcoming="steam">
            <img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="" class="news-favicon">스팀
          </button>
          <button class="tab-btn" data-upcoming="ps5">
            <img src="https://www.google.com/s2/favicons?domain=playstation.com&sz=32" alt="" class="news-favicon">PS5
          </button>
          <button class="tab-btn" data-upcoming="nintendo">
            <svg viewBox="0 0 24 24" fill="#e60012" class="news-favicon" style="width:20px;height:20px"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>닌텐도
          </button>
        </div>
      </div>

      <div class="upcoming-card">
        <div class="upcoming-section active" id="upcoming-mobile">
          ${generateUpcomingSection(upcoming?.mobile || [], 'mobile')}
        </div>
        <div class="upcoming-section" id="upcoming-steam">
          ${generateUpcomingSection(upcoming?.steam || [], 'steam')}
        </div>
        <div class="upcoming-section" id="upcoming-ps5">
          ${generateUpcomingSection(upcoming?.ps5 || [], 'ps5')}
        </div>
        <div class="upcoming-section" id="upcoming-nintendo">
          ${generateUpcomingSection(upcoming?.nintendo || [], 'nintendo')}
        </div>
      </div>
    </section>
  </main>

  <script>
    // 폰트 로딩 완료 감지 - FOUT 방지
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      // fallback: 100ms 후 표시
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }

    // 로고 클릭 시 홈으로 이동
    document.getElementById('logo-home')?.addEventListener('click', () => {
      // nav 활성화 해제
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      // 모든 섹션 숨기기
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      // 홈 섹션 표시
      document.querySelector('.home-section')?.classList.add('active');
      document.body.classList.remove('detail-page'); // 헤더 보이기
      // 모든 탭 초기화
      resetSubTabs();
      window.scrollTo(0, 0);
    });

    // 홈 더보기 클릭 시 해당 섹션으로 이동
    document.querySelectorAll('.home-card-more').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetSection = link.dataset.goto;
        if (!targetSection) return;

        // 홈 숨기기
        document.querySelector('.home-section')?.classList.remove('active');
        document.body.classList.add('detail-page'); // 헤더 숨기기
        // nav 활성화
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('.nav-item[data-section="' + targetSection + '"]')?.classList.add('active');
        // 해당 섹션 표시
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(targetSection)?.classList.add('active');
        window.scrollTo(0, 0);
      });
    });

    // 홈 뉴스 서브탭 전환
    document.querySelectorAll('.home-news-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-news-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetNews = tab.dataset.news;
        document.querySelectorAll('.home-news-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('home-news-' + targetNews)?.classList.add('active');
      });
    });

    // 홈 커뮤니티 서브탭 전환
    document.querySelectorAll('.home-community-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-community-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetCommunity = tab.dataset.community;
        document.querySelectorAll('.home-community-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('home-community-' + targetCommunity)?.classList.add('active');
      });
    });

    // 홈 영상 서브탭 전환
    document.querySelectorAll('.home-video-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-video-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetVideo = tab.dataset.video;
        document.querySelectorAll('.home-video-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('home-video-' + targetVideo)?.classList.add('active');
      });
    });

    // 홈 모바일 랭킹 - 매출/인기 탭 전환
    let homeCurrentChart = 'grossing';
    let homeCurrentPlatform = 'ios';
    const homeChartTab = document.getElementById('homeChartTab');
    homeChartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      homeChartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      homeCurrentChart = btn.dataset.homeChart;
      // 차트 전환
      document.querySelectorAll('.home-rank-chart').forEach(c => c.classList.remove('active'));
      const targetChart = document.getElementById('home-chart-' + homeCurrentChart);
      targetChart?.classList.add('active');
      // 현재 플랫폼 리스트도 active 설정
      targetChart?.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
      targetChart?.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform)?.classList.add('active');
    });

    // 홈 모바일 랭킹 - iOS/Android 탭 전환
    document.querySelectorAll('.home-rank-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-rank-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        homeCurrentPlatform = tab.dataset.platform;
        // 현재 활성화된 차트 내에서 플랫폼 전환
        document.querySelectorAll('.home-rank-chart').forEach(chart => {
          chart.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
          const targetList = chart.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform);
          targetList?.classList.add('active');
        });
      });
    });

    // 홈 스팀 순위 - 인기/매출 탭 전환
    const homeSteamTab = document.getElementById('homeSteamTab');
    homeSteamTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      homeSteamTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const steamChart = btn.dataset.homeSteam;
      document.querySelectorAll('.home-steam-chart').forEach(c => c.classList.remove('active'));
      document.getElementById('home-steam-' + steamChart)?.classList.add('active');
    });

    // 홈 신규 게임 - 플랫폼 탭 전환
    document.querySelectorAll('.home-upcoming-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-upcoming-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const platform = tab.dataset.upcoming;
        document.querySelectorAll('.home-upcoming-list').forEach(l => l.classList.remove('active'));
        document.getElementById('home-upcoming-' + platform)?.classList.add('active');
      });
    });

    // 뉴스 탭 요소
    const newsTab = document.getElementById('newsTab');
    const newsContainer = document.querySelector('.news-container');

    // 커뮤니티 탭 요소
    const communityTab = document.getElementById('communityTab');
    const communityContainer = document.querySelector('#community .news-container');

    // 마켓 순위 탭 요소
    const storeTab = document.getElementById('storeTab');
    const chartTab = document.getElementById('chartTab');
    let currentStore = 'ios';
    let currentChart = 'grossing';

    // Steam 탭 요소
    const steamTab = document.getElementById('steamTab');

    // 출시 게임 탭 요소
    const upcomingTab = document.getElementById('upcomingTab');

    // 전체 탭 랜덤 셔플 함수 (5분 주기, 내용만 변경)
    function shuffleAllTabs() {
      const SHUFFLE_INTERVAL = 5 * 60 * 1000; // 5분
      const now = Date.now();
      let shuffleCache = null;

      try {
        shuffleCache = JSON.parse(localStorage.getItem('shuffleCache'));
      } catch(e) {}

      // 5분 이내면 캐시 사용, 아니면 새로 셔플
      if (!shuffleCache || (now - shuffleCache.timestamp) > SHUFFLE_INTERVAL) {
        // 뉴스 랜덤 선택 (9개)
        const newsIndices = [];
        const newsPool = [...Array(allNewsData.length).keys()];
        for (let i = newsPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newsPool[i], newsPool[j]] = [newsPool[j], newsPool[i]];
        }
        shuffleCache = {
          timestamp: now,
          newsIndices: newsPool.slice(0, 9),
          communityIndices: []
        };
        // 커뮤니티 랜덤 선택 (10개)
        const commPool = [...Array(allCommunityData.length).keys()];
        for (let i = commPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [commPool[i], commPool[j]] = [commPool[j], commPool[i]];
        }
        shuffleCache.communityIndices = commPool.slice(0, 10);
        // 유튜브 랜덤 선택 (6개)
        const ytPool = [...Array(allYoutubeData.length).keys()];
        for (let i = ytPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ytPool[i], ytPool[j]] = [ytPool[j], ytPool[i]];
        }
        shuffleCache.youtubeIndices = ytPool.slice(0, 9);
        // 치지직 랜덤 선택 (9개)
        const chzzkPool = [...Array(allChzzkData.length).keys()];
        for (let i = chzzkPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [chzzkPool[i], chzzkPool[j]] = [chzzkPool[j], chzzkPool[i]];
        }
        shuffleCache.chzzkIndices = chzzkPool.slice(0, 9);
        localStorage.setItem('shuffleCache', JSON.stringify(shuffleCache));
      }

      // 뉴스 전체 탭 내용 업데이트
      const newsItems = shuffleCache.newsIndices.map(i => allNewsData[i]).filter(Boolean);
      const newsAllPanel = document.getElementById('home-news-all');
      if (newsAllPanel && newsItems.length >= 9) {
        const fixUrl = (url) => url && url.startsWith('//') ? 'https:' + url : url;
        // 메인 카드 (1개)
        const mainCard = newsAllPanel.querySelector('.home-news-card-main');
        if (mainCard && newsItems[0]) {
          mainCard.href = newsItems[0].link;
          mainCard.querySelector('.home-news-card-thumb img').src = fixUrl(newsItems[0].thumbnail);
          mainCard.querySelector('.home-news-card-title').textContent = newsItems[0].title;
          mainCard.querySelector('.home-news-card-source').textContent = newsItems[0].source;
        }
        // 서브 카드 (2개)
        const subCards = newsAllPanel.querySelectorAll('.home-news-card-sub');
        subCards.forEach((card, i) => {
          if (newsItems[i + 1]) {
            card.href = newsItems[i + 1].link;
            card.querySelector('.home-news-card-thumb img').src = fixUrl(newsItems[i + 1].thumbnail);
            card.querySelector('.home-news-card-title').textContent = newsItems[i + 1].title;
            card.querySelector('.home-news-card-source').textContent = newsItems[i + 1].source;
          }
        });
        // 리스트 아이템 (6개)
        const listItems = newsAllPanel.querySelectorAll('.home-news-item');
        listItems.forEach((item, i) => {
          if (newsItems[i + 3]) {
            item.href = newsItems[i + 3].link;
            item.querySelector('.home-news-item-thumb img').src = fixUrl(newsItems[i + 3].thumbnail);
            item.querySelector('.home-news-title').textContent = newsItems[i + 3].title;
            item.querySelector('.home-news-source-tag').textContent = newsItems[i + 3].source;
          }
        });
      }

      // 커뮤니티 전체 탭 내용 업데이트
      const commItems = shuffleCache.communityIndices.map(i => allCommunityData[i]).filter(Boolean);
      const communityAllPanel = document.getElementById('home-community-all');
      if (communityAllPanel && commItems.length >= 10) {
        const allCommItems = communityAllPanel.querySelectorAll('.home-community-item');
        allCommItems.forEach((item, i) => {
          if (commItems[i]) {
            item.href = commItems[i].link;
            item.querySelector('.home-community-title').textContent = commItems[i].title;
            item.querySelector('.home-community-meta img').src = commItems[i].icon;
            item.querySelector('.home-community-source').textContent = commItems[i].source;
            const channelEl = item.querySelector('.home-community-channel');
            if (channelEl) channelEl.textContent = commItems[i].channel ? '· ' + commItems[i].channel : '';
          }
        });
      }

      // 유튜브 영상 내용 업데이트
      const ytItems = (shuffleCache.youtubeIndices || []).map(i => allYoutubeData[i]).filter(Boolean);
      const ytPanel = document.getElementById('home-video-youtube');
      if (ytPanel && ytItems.length >= 9) {
        // 메인 카드 (1개)
        const mainCard = ytPanel.querySelector('.home-video-card-main');
        if (mainCard && ytItems[0]) {
          mainCard.href = ytItems[0].link;
          mainCard.querySelector('.home-video-card-thumb img').src = ytItems[0].thumbnail;
          mainCard.querySelector('.home-video-card-title').textContent = ytItems[0].title;
          mainCard.querySelector('.home-video-card-channel').textContent = ytItems[0].channel;
        }
        // 서브 카드 (2개)
        const subCards = ytPanel.querySelectorAll('.home-video-card-sub');
        subCards.forEach((card, i) => {
          if (ytItems[i + 1]) {
            card.href = ytItems[i + 1].link;
            card.querySelector('.home-video-card-thumb img').src = ytItems[i + 1].thumbnail;
            card.querySelector('.home-video-card-title').textContent = ytItems[i + 1].title;
            card.querySelector('.home-video-card-channel').textContent = ytItems[i + 1].channel;
          }
        });
        // 리스트 아이템 (6개)
        const listItems = ytPanel.querySelectorAll('.home-video-item');
        listItems.forEach((item, i) => {
          if (ytItems[i + 3]) {
            item.href = ytItems[i + 3].link;
            item.querySelector('.home-video-item-thumb img').src = ytItems[i + 3].thumbnail;
            item.querySelector('.home-video-item-title').textContent = ytItems[i + 3].title;
            item.querySelector('.home-video-item-channel').textContent = ytItems[i + 3].channel;
          }
        });
      }

      // 치지직 영상 내용 업데이트
      const chzzkItems = (shuffleCache.chzzkIndices || []).map(i => allChzzkData[i]).filter(Boolean);
      const chzzkPanel = document.getElementById('home-video-chzzk');
      if (chzzkPanel && chzzkItems.length >= 9) {
        // 메인 카드 (1개)
        const mainCard = chzzkPanel.querySelector('.home-video-card-main');
        if (mainCard && chzzkItems[0]) {
          mainCard.href = chzzkItems[0].link;
          mainCard.querySelector('.home-video-card-thumb img').src = chzzkItems[0].thumbnail;
          mainCard.querySelector('.home-video-card-title').textContent = chzzkItems[0].title;
          mainCard.querySelector('.home-video-card-channel').textContent = chzzkItems[0].channel;
          const liveEl = mainCard.querySelector('.home-video-live');
          if (liveEl) liveEl.textContent = chzzkItems[0].viewers ? '🔴 LIVE ' + chzzkItems[0].viewers.toLocaleString() : '';
        }
        // 서브 카드 (2개)
        const subCards = chzzkPanel.querySelectorAll('.home-video-card-sub');
        subCards.forEach((card, i) => {
          if (chzzkItems[i + 1]) {
            card.href = chzzkItems[i + 1].link;
            card.querySelector('.home-video-card-thumb img').src = chzzkItems[i + 1].thumbnail;
            card.querySelector('.home-video-card-title').textContent = chzzkItems[i + 1].title;
            card.querySelector('.home-video-card-channel').textContent = chzzkItems[i + 1].channel;
            const liveEl = card.querySelector('.home-video-live');
            if (liveEl) liveEl.textContent = chzzkItems[i + 1].viewers ? '🔴 ' + chzzkItems[i + 1].viewers.toLocaleString() : '';
          }
        });
        // 리스트 아이템 (6개)
        const listItems = chzzkPanel.querySelectorAll('.home-video-item');
        listItems.forEach((item, i) => {
          if (chzzkItems[i + 3]) {
            item.href = chzzkItems[i + 3].link;
            item.querySelector('.home-video-item-thumb img').src = chzzkItems[i + 3].thumbnail;
            item.querySelector('.home-video-item-title').textContent = chzzkItems[i + 3].title;
            item.querySelector('.home-video-item-channel').textContent = chzzkItems[i + 3].channel;
            const liveSmEl = item.querySelector('.home-video-live-sm');
            if (liveSmEl) liveSmEl.textContent = chzzkItems[i + 3].viewers ? '🔴 ' + chzzkItems[i + 3].viewers.toLocaleString() : '';
          }
        });
      }
    }

    // 서브탭 초기화 함수
    function resetSubTabs() {
      // 전체 탭 랜덤 셔플
      shuffleAllTabs();
      // 홈 뉴스 서브탭 초기화
      document.querySelectorAll('.home-news-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.home-news-tab[data-news="all"]')?.classList.add('active');
      document.querySelectorAll('.home-news-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('home-news-all')?.classList.add('active');
      // 홈 커뮤니티 서브탭 초기화
      document.querySelectorAll('.home-community-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.home-community-tab[data-community="all"]')?.classList.add('active');
      document.querySelectorAll('.home-community-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('home-community-all')?.classList.add('active');
      // 홈 영상 서브탭 초기화
      document.querySelectorAll('.home-video-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.home-video-tab[data-video="youtube"]')?.classList.add('active');
      document.querySelectorAll('.home-video-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('home-video-youtube')?.classList.add('active');
      // 홈 모바일 랭킹 플랫폼 탭 초기화
      document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.platform-tab[data-platform="ios"]')?.classList.add('active');
      document.querySelectorAll('.platform-content').forEach(c => c.classList.remove('active'));
      document.getElementById('ios-rankings')?.classList.add('active');
      // 홈 국가 탭 초기화
      document.querySelectorAll('.country-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.country-tab[data-country="kr"]')?.classList.add('active');
      document.querySelectorAll('.country-content').forEach(c => c.classList.remove('active'));
      document.getElementById('kr-rankings')?.classList.add('active');
      // 뉴스 탭 초기화
      newsTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      // 마켓 순위 탭 초기화
      storeTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      chartTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      currentStore = 'ios';
      currentChart = 'grossing';
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById('ios-grossing')?.classList.add('active');
      // 스팀 탭 초기화
      steamTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
      document.getElementById('steam-mostplayed')?.classList.add('active');
      // 영상 탭 초기화
      document.getElementById('videoTab')?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.video-section').forEach(s => s.classList.remove('active'));
      document.getElementById('video-gaming')?.classList.add('active');
      // 출시 게임 탭 초기화
      upcomingTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.upcoming-section').forEach(s => s.classList.remove('active'));
      document.getElementById('upcoming-mobile')?.classList.add('active');
    }

    // 메인 네비게이션 - 캐러셀 슬라이드 기능
    const navInner = document.querySelector('.nav-inner');
    const allNavItems = document.querySelectorAll('.nav-item');
    const totalNavCount = allNavItems.length; // 6개
    const visibleCount = 5;

    function updateNavCarousel(index) {
      // 모바일에서만 슬라이드 (5개 보이고, 6개 메뉴)
      if (window.innerWidth <= 768 && navInner) {
        // index가 4 이상이면 마지막 메뉴들이 보이도록 이동
        // 0~3: 0% (처음 5개 보임), 4~5: -20% (마지막 5개 보임)
        const offset = index >= visibleCount - 1 ? -20 : 0;
        navInner.style.transform = 'translateX(' + offset + '%)';
      }
    }

    document.querySelectorAll('.nav-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        // 홈 섹션 숨기기
        document.querySelector('.home-section')?.classList.remove('active');
        document.body.classList.add('detail-page'); // 헤더 숨기기
        // nav 활성화
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(item.dataset.section)?.classList.add('active');
        resetSubTabs();
        resetCountryColumns();
        updateNavCarousel(idx);
        window.scrollTo(0, 0);
      });
    });

    // 뉴스 탭 - 선택한 패널을 맨 위로 이동
    newsTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      newsTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const selectedPanel = document.getElementById('news-' + btn.dataset.news);
      if (selectedPanel && newsContainer) {
        newsContainer.prepend(selectedPanel);
      }
    });

    // 커뮤니티 탭 - 선택한 패널을 맨 위로 이동
    const communityTypes = ['dcinside', 'arca', 'inven', 'ruliweb'];
    let currentCommunityIndex = 0;

    function switchCommunity(index) {
      if (index < 0) index = communityTypes.length - 1;
      if (index >= communityTypes.length) index = 0;
      currentCommunityIndex = index;

      communityTab.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === index);
      });
      const selectedPanel = document.getElementById('community-' + communityTypes[index]);
      if (selectedPanel && communityContainer) {
        communityContainer.prepend(selectedPanel);
      }
    }

    communityTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const index = communityTypes.indexOf(btn.dataset.community);
      if (index !== -1) switchCommunity(index);
    });

    // 모바일 스와이프 기능 - 메인 메뉴 전환 (홈 포함)
    let touchStartX = 0;
    let touchStartY = 0;
    const navItems = document.querySelectorAll('.nav-item');
    const navSections = ['community', 'youtube', 'news', 'rankings', 'steam', 'upcoming'];

    // 홈이 활성화되어 있는지 확인
    function isHomeActive() {
      return document.querySelector('.home-section')?.classList.contains('active');
    }

    function getCurrentNavIndex() {
      if (isHomeActive()) return -1; // 홈은 -1
      const activeNav = document.querySelector('.nav-item.active');
      if (!activeNav) return -1;
      const section = activeNav.dataset.section;
      return navSections.indexOf(section);
    }

    // 홈으로 이동
    function goToHome() {
      navItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelector('.home-section')?.classList.add('active');
      document.body.classList.remove('detail-page'); // 헤더 보이기
      window.scrollTo(0, 0);
    }

    function switchNavSection(index) {
      // 홈으로 이동 (index < 0)
      if (index < 0) {
        goToHome();
        return;
      }
      // 마지막 섹션에서 다음으로 가면 홈으로
      if (index >= navSections.length) {
        goToHome();
        return;
      }

      // 홈 숨기기
      document.querySelector('.home-section')?.classList.remove('active');
      document.body.classList.add('detail-page'); // 헤더 숨기기

      const targetSection = navSections[index];
      navItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

      document.querySelector('.nav-item[data-section="' + targetSection + '"]')?.classList.add('active');
      document.getElementById(targetSection)?.classList.add('active');

      // 캐러셀 슬라이드 업데이트
      const navInner = document.querySelector('.nav-inner');
      if (window.innerWidth <= 768 && navInner) {
        const offset = index >= 4 ? -20 : 0;
        navInner.style.transform = 'translateX(' + offset + '%)';
      }

      // 상단으로 즉시 스크롤
      window.scrollTo(0, 0);
    }

    // 전체 페이지에서 스와이프
    document.body.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;

      // 수평 이동이 수직보다 커야 스와이프로 인식 (표준 감도)
      if (Math.abs(diffX) <= Math.abs(diffY)) return;

      if (Math.abs(diffX) > 75) { // 75px 이상 수평 스와이프 (표준)
        const currentIndex = getCurrentNavIndex();

        if (currentIndex === -1) {
          // 홈에서 스와이프
          if (diffX > 0) {
            // 왼쪽으로 스와이프 → 첫 번째 섹션 (community)
            switchNavSection(0);
          } else {
            // 오른쪽으로 스와이프 → 마지막 섹션 (upcoming)
            switchNavSection(navSections.length - 1);
          }
        } else {
          if (diffX > 0) {
            // 왼쪽으로 스와이프 → 다음 섹션
            switchNavSection(currentIndex + 1);
          } else {
            // 오른쪽으로 스와이프 → 이전 섹션
            switchNavSection(currentIndex - 1);
          }
        }
      }
    }, { passive: true });

    function updateRankings() {
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById(currentStore + '-' + currentChart)?.classList.add('active');
    }

    // 국가 컬럼 초기화 함수
    function resetCountryColumns() {
      document.querySelectorAll('.country-column').forEach(c => {
        c.classList.remove('expanded', 'collapsed');
      });
    }

    storeTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      storeTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStore = btn.dataset.store;
      updateRankings();
      resetCountryColumns();
    });

    chartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      chartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChart = btn.dataset.chart;
      updateRankings();
      resetCountryColumns();
    });

    // Steam 탭 이벤트
    steamTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      steamTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
      document.getElementById('steam-' + btn.dataset.steam)?.classList.add('active');
    });

    // 출시 게임 탭 이벤트
    upcomingTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      upcomingTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.upcoming-section').forEach(s => s.classList.remove('active'));
      document.getElementById('upcoming-' + btn.dataset.upcoming)?.classList.add('active');
    });

    // 영상 탭 이벤트
    const videoTab = document.getElementById('videoTab');
    videoTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      videoTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.video-section').forEach(s => s.classList.remove('active'));
      document.getElementById('video-' + btn.dataset.video)?.classList.add('active');
    });

    // 모바일 디바이스 감지 (터치 + 포인터)
    const isMobileDevice = () => {
      return window.matchMedia('(pointer: coarse)').matches ||
             'ontouchstart' in window ||
             navigator.maxTouchPoints > 0;
    };

    // 모바일에서 국가 컬럼 클릭 시 펼치기 (768px 이하)
    document.querySelectorAll('.columns-grid').forEach(grid => {
      grid.addEventListener('click', (e) => {
        if (window.innerWidth > 768) return;
        const column = e.target.closest('.country-column');
        if (!column) return;
        const columns = grid.querySelectorAll('.country-column');
        const firstCol = columns[0];
        const isFirst = column === firstCol;
        columns.forEach(c => c.classList.remove('expanded'));
        if (isFirst) {
          firstCol.classList.remove('collapsed');
        } else {
          firstCol.classList.add('collapsed');
          column.classList.add('expanded');
        }
      });
    });

    // 페이지 로드 시 전체 탭 랜덤 셔플
    shuffleAllTabs();

    // Twemoji로 국기 이모지 렌더링
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, {
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
        folder: 'svg',
        ext: '.svg'
      });
    }
  </script>
</body>
</html>`;
}

module.exports = { generateHTML };
