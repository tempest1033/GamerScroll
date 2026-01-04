/**
 * 홈/대시보드 페이지 템플릿
 * 각 섹션의 요약 카드를 표시
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

function generateIndexPage(data) {
  const { rankings, news, steam, youtube, chzzk, community, upcoming, insight, metacritic, weeklyInsight, popularGames = [], games = {} } = data;

  // AI 트렌드 데이터
  const aiInsight = insight?.ai || null;
  // 파일명 기준 날짜 (최신 리포트 링크용)
  const insightFileDate = insight?.insightDate || '';

  // URL 수정 헬퍼
  const fixUrl = function(url) {
    if (!url) return url;
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.includes('inven.co.kr')) {
      const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url);
      if (/\.avif(?:$|[?#])/i.test(url)) return proxyUrl + '&output=webp';
      return proxyUrl;
    }
    return url;
  };

  // 홈 뉴스 카드
  function generateHomeNews() {
    const sources = [
      { key: 'thisisgame', items: news?.thisisgame || [], name: '디스이즈게임', icon: 'https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32' },
      { key: 'gamemeca', items: news?.gamemeca || [], name: '게임메카', icon: 'https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32' },
      { key: 'ruliweb', items: news?.ruliweb || [], name: '루리웹', icon: 'https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32' }
    ];

    function renderNewsContent(items, sourceName) {
      if (items.length === 0) {
        return '<div class="home-empty">뉴스를 불러올 수 없습니다</div>';
      }
      const withThumb = items.filter(function(item) { return item.thumbnail; });
      const mainCard = withThumb[0];
      const subCard = withThumb[1];
      const listItems = withThumb.slice(2, 8);

      var mainCardHtml = '';
      if (mainCard) {
        mainCardHtml = '<a class="home-news-card home-news-card-main" href="' + mainCard.link + '" target="_blank" rel="noopener">' +
          '<div class="home-news-card-thumb">' +
          '<img src="' + fixUrl(mainCard.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>\'">' +
          '<span class="home-news-card-tag">' + (sourceName || mainCard.source) + '</span>' +
          '</div>' +
          '<div class="home-news-card-info">' +
          '<span class="home-news-card-title">' + mainCard.title + '</span>' +
          '</div></a>';
      }

      var subCardHtml = '';
      if (subCard) {
        subCardHtml = '<a class="home-news-card home-news-card-sub" href="' + subCard.link + '" target="_blank" rel="noopener">' +
          '<div class="home-news-card-thumb">' +
          '<img src="' + fixUrl(subCard.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>\'">' +
          '<span class="home-news-card-tag">' + (sourceName || subCard.source) + '</span>' +
          '</div>' +
          '<div class="home-news-card-info">' +
          '<span class="home-news-card-title">' + subCard.title + '</span>' +
          '</div></a>';
      }

      // 왼쪽 열 리스트 (0~2)
      var leftListHtml = listItems.slice(0, 3).map(function(item) {
        return '<a class="home-news-item" href="' + item.link + '" target="_blank" rel="noopener">' +
          '<div class="home-news-item-thumb">' +
          '<img src="' + fixUrl(item.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' +
          '<span class="home-news-item-tag">' + (sourceName || item.source) + '</span>' +
          '</div>' +
          '<div class="home-news-item-info">' +
          '<span class="home-news-title">' + item.title + '</span>' +
          '</div></a>';
      }).join('');

      // 오른쪽 열 리스트 (3~5)
      var rightListHtml = listItems.slice(3, 6).map(function(item) {
        return '<a class="home-news-item" href="' + item.link + '" target="_blank" rel="noopener">' +
          '<div class="home-news-item-thumb">' +
          '<img src="' + fixUrl(item.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' +
          '<span class="home-news-item-tag">' + (sourceName || item.source) + '</span>' +
          '</div>' +
          '<div class="home-news-item-info">' +
          '<span class="home-news-title">' + item.title + '</span>' +
          '</div></a>';
      }).join('');

      return '<div class="home-news-split">' +
        '<div class="home-news-column">' + mainCardHtml + '<div class="home-news-list">' + leftListHtml + '</div></div>' +
        '<div class="home-news-column">' + subCardHtml + '<div class="home-news-list">' + rightListHtml + '</div></div>' +
        '</div>';
    }

    // 전체 탭용 데이터 (각 소스에서 섞어서 + 랜덤 셔플)
    var allCombined = [];
    sources.forEach(function(src) {
      src.items.slice(0, 4).forEach(function(item) {
        allCombined.push(Object.assign({}, item, { source: src.name, icon: src.icon }));
      });
    });
    // 랜덤 셔플
    for (var i = allCombined.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = allCombined[i];
      allCombined[i] = allCombined[j];
      allCombined[j] = temp;
    }

    return '<div class="home-news-tabs">' +
      '<button class="home-news-tab active" data-news="all">전체</button>' +
      '<button class="home-news-tab" data-news="thisisgame"><img src="https://www.google.com/s2/favicons?domain=thisisgame.com&sz=32" alt="">디스이즈게임</button>' +
      '<button class="home-news-tab" data-news="gamemeca"><img src="https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32" alt="">게임메카</button>' +
      '<button class="home-news-tab" data-news="ruliweb"><img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="">루리웹</button>' +
      '</div>' +
      '<div class="home-news-body">' +
      '<div class="home-news-panel active" id="home-news-all">' + renderNewsContent(allCombined) + '</div>' +
      '<div class="home-news-panel" id="home-news-thisisgame">' + renderNewsContent(sources[0].items.map(function(item) { return Object.assign({}, item, { source: '디스이즈게임' }); }), '디스이즈게임') + '</div>' +
      '<div class="home-news-panel" id="home-news-gamemeca">' + renderNewsContent(sources[1].items.map(function(item) { return Object.assign({}, item, { source: '게임메카' }); }), '게임메카') + '</div>' +
      '<div class="home-news-panel" id="home-news-ruliweb">' + renderNewsContent(sources[2].items.map(function(item) { return Object.assign({}, item, { source: '루리웹' }); }), '루리웹') + '</div>' +
      '</div>';
  }

  // 홈 트렌드 (일간/주간 2컬럼 그리드)
  function generateHomeInsight() {
    // 날짜 포맷 헬퍼 (2026-01-01 → 2026년 1월 1일)
    const formatDateKr = (dateStr) => {
      if (!dateStr) return '';
      const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return dateStr;
      return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
    };

    // 일간 리포트 데이터 (링크는 파일명 기준, 뱃지는 AI 응답 기준)
    const dailyHeadline = aiInsight?.headline || '일간 리포트';
    const dailySummary = aiInsight?.summary || '';
    const dailySlug = insightFileDate || '';
    const dailyLink = dailySlug ? `/trend/daily/${dailySlug}/` : '/trend/';
    const dailyBadgeText = insightFileDate ? `${formatDateKr(insightFileDate)} 일간 리포트` : '일간 리포트';

    // 주간 리포트 데이터
    const wai = weeklyInsight?.ai || null;
    const wInfo = weeklyInsight?.weekInfo || {};
    const weeklyHeadline = wai?.headline || (typeof wai?.summary === 'object' ? wai.summary.title : null) || '주간 리포트';
    const weeklySummary = typeof wai?.summary === 'object' ? wai.summary.desc : (wai?.summary || '');
    const weekNum = wInfo.weekNumber || wai?.weekNumber || '';
    const weekYear = wInfo.year || (wInfo.startDate ? wInfo.startDate.slice(0, 4) : new Date().getFullYear());
    const weeklySlug = weekNum ? `${weekYear}-W${String(weekNum).padStart(2, '0')}` : '';
    const weeklyLink = weeklySlug ? `/trend/weekly/${weeklySlug}/` : '/trend/';
    // 주간 뱃지: "2025년 12월 15일 ~ 12월 21일 주간 리포트"
    const weeklyBadgeText = wInfo.startDate && wInfo.endDate
      ? `${formatDateKr(wInfo.startDate)} ~ ${parseInt(wInfo.endDate.slice(5, 7))}월 ${parseInt(wInfo.endDate.slice(8, 10))}일 주간 리포트`
      : '주간 리포트';

    // 썸네일 (없으면 CSS gradient 배경만 보임) - fixUrl로 프록시 처리
    const dailyThumbnail = fixUrl(aiInsight?.thumbnail) || '';
    const weeklyThumbnail = fixUrl(wai?.thumbnail) || '';

    // 일간 카드 (이미지 + 헤드라인)
    const dailyCard = dailyHeadline ? `
      <a href="${dailyLink}" class="home-trend-card">
        <div class="home-trend-card-image">
          ${dailyThumbnail ? `<img src="${dailyThumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span class="home-trend-card-tag">${dailyBadgeText}</span>
        </div>
        <h3 class="home-trend-card-title">${dailyHeadline}</h3>
      </a>
    ` : '';

    // 주간 카드 (이미지 + 헤드라인)
    const weeklyCard = wai ? `
      <a href="${weeklyLink}" class="home-trend-card">
        <div class="home-trend-card-image">
          ${weeklyThumbnail ? `<img src="${weeklyThumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span class="home-trend-card-tag weekly">${weeklyBadgeText}</span>
        </div>
        <h3 class="home-trend-card-title">${weeklyHeadline}</h3>
      </a>
    ` : '';

    if (!dailyCard && !weeklyCard) {
      return '<div class="home-empty">트렌드를 불러올 수 없습니다</div>';
    }

    return `<div class="home-trend-grid">${dailyCard}${weeklyCard}</div>`;
  }

  // 홈 커뮤니티
  function generateHomeCommunity() {
    var sources = [
      { key: 'inven', items: community?.inven || [], name: '인벤', icon: 'https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32' },
      { key: 'arca', items: community?.arca || [], name: '아카라이브', icon: 'https://www.google.com/s2/favicons?domain=arca.live&sz=32' },
      { key: 'dcinside', items: community?.dcinside || [], name: '디시인사이드', icon: 'https://www.google.com/s2/favicons?domain=dcinside.com&sz=32' },
      { key: 'ruliweb', items: community?.ruliweb || [], name: '루리웹', icon: 'https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32' }
    ];

    var allCombined = [];
    sources.forEach(function(src) {
      src.items.slice(0, 3).forEach(function(item) {
        allCombined.push(Object.assign({}, item, { source: src.name, icon: src.icon }));
      });
    });
    for (var i = allCombined.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = allCombined[i];
      allCombined[i] = allCombined[j];
      allCombined[j] = temp;
    }
    allCombined = allCombined.slice(0, 10);

    function renderCommunitySplit(items, sourceName) {
      if (items.length === 0) {
        return '<div class="home-empty">인기글을 불러올 수 없습니다</div>';
      }
      var leftItems = items.slice(0, 5);
      var rightItems = items.slice(5, 10);

      function renderColumn(columnItems) {
        return columnItems.map(function(item) {
          return '<a class="home-community-item" href="' + item.link + '" target="_blank" rel="noopener">' +
            '<img class="home-community-icon" src="' + item.icon + '" alt="">' +
            '<span class="home-community-title">' + item.title + '</span>' +
            '</a>';
        }).join('');
      }

      return '<div class="home-community-split">' +
        '<div class="home-community-column">' + renderColumn(leftItems) + '</div>' +
        '<div class="home-community-column">' + renderColumn(rightItems) + '</div>' +
        '</div>';
    }

    return '<div class="home-community-tabs">' +
      '<button class="home-community-tab active" data-community="all">전체</button>' +
      '<button class="home-community-tab" data-community="inven"><img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="">인벤</button>' +
      '<button class="home-community-tab" data-community="arca"><img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt=""><span class="tab-text-arca">아카라이브</span></button>' +
      '<button class="home-community-tab" data-community="dcinside"><img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt=""><span class="tab-text-dcinside">디시인사이드</span></button>' +
      '<button class="home-community-tab" data-community="ruliweb"><img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="">루리웹</button>' +
      '</div>' +
      '<div class="home-community-body">' +
      '<div class="home-community-panel active" id="home-community-all">' + renderCommunitySplit(allCombined) + '</div>' +
      '<div class="home-community-panel" id="home-community-inven">' + renderCommunitySplit(sources[0].items.slice(0, 10).map(function(item) { return Object.assign({}, item, { icon: sources[0].icon }); }), '인벤') + '</div>' +
      '<div class="home-community-panel" id="home-community-arca">' + renderCommunitySplit(sources[1].items.slice(0, 10).map(function(item) { return Object.assign({}, item, { icon: sources[1].icon }); }), '아카라이브') + '</div>' +
      '<div class="home-community-panel" id="home-community-dcinside">' + renderCommunitySplit(sources[2].items.slice(0, 10).map(function(item) { return Object.assign({}, item, { icon: sources[2].icon }); }), '디시인사이드') + '</div>' +
      '<div class="home-community-panel" id="home-community-ruliweb">' + renderCommunitySplit(sources[3].items.slice(0, 10).map(function(item) { return Object.assign({}, item, { icon: sources[3].icon }); }), '루리웹') + '</div>' +
      '</div>';
  }

  // 홈 영상
  function generateHomeVideo() {
    var youtubeItems = (youtube?.gaming || []).slice(0, 9).map(function(item) {
      return {
        title: item.title,
        channel: item.channel,
        thumbnail: item.thumbnail,
        link: 'https://www.youtube.com/watch?v=' + item.videoId,
        platform: 'youtube'
      };
    });

    var chzzkItems = (chzzk || []).slice(0, 9).map(function(item) {
      return {
        title: item.title,
        channel: item.channel,
        thumbnail: item.thumbnail,
        link: 'https://chzzk.naver.com/live/' + item.channelId,
        platform: 'chzzk',
        viewers: item.viewers
      };
    });

    function renderVideoGrid(items) {
      if (items.length === 0) {
        return '<div class="home-empty">영상을 불러올 수 없습니다</div>';
      }
      var mainItem = items[0];
      var subItem = items[1];
      var listItems = items.slice(2, 8);

      var mainHtml = '<a class="home-video-card home-video-card-main" href="' + mainItem.link + '" target="_blank" rel="noopener">' +
        '<div class="home-video-card-thumb">' +
        '<img src="' + mainItem.thumbnail + '" alt="" loading="lazy">' +
        '<span class="home-video-card-tag">' + mainItem.channel + '</span>' +
        (mainItem.viewers ? '<span class="home-video-live">🔴 LIVE ' + mainItem.viewers.toLocaleString() + '</span>' : '') +
        '</div>' +
        '<div class="home-video-card-info">' +
        '<div class="home-video-card-title">' + mainItem.title + '</div>' +
        '</div></a>';

      var subHtml = '';
      if (subItem) {
        subHtml = '<a class="home-video-card home-video-card-sub" href="' + subItem.link + '" target="_blank" rel="noopener">' +
          '<div class="home-video-card-thumb">' +
          '<img src="' + subItem.thumbnail + '" alt="" loading="lazy">' +
          '<span class="home-video-card-tag">' + subItem.channel + '</span>' +
          (subItem.viewers ? '<span class="home-video-live">🔴 ' + subItem.viewers.toLocaleString() + '</span>' : '') +
          '</div>' +
          '<div class="home-video-card-info">' +
          '<div class="home-video-card-title">' + subItem.title + '</div>' +
          '</div></a>';
      }

      // 왼쪽 열 리스트 (0~2)
      var leftListHtml = listItems.slice(0, 3).map(function(item) {
        return '<a class="home-video-item" href="' + item.link + '" target="_blank" rel="noopener">' +
          '<div class="home-video-item-thumb">' +
          '<img src="' + item.thumbnail + '" alt="" loading="lazy">' +
          '<span class="home-video-item-tag">' + item.channel + '</span>' +
          (item.viewers ? '<span class="home-video-live-sm">🔴 ' + item.viewers.toLocaleString() + '</span>' : '') +
          '</div>' +
          '<div class="home-video-item-info">' +
          '<div class="home-video-item-title">' + item.title + '</div>' +
          '</div></a>';
      }).join('');

      // 오른쪽 열 리스트 (3~5)
      var rightListHtml = listItems.slice(3, 6).map(function(item) {
        return '<a class="home-video-item" href="' + item.link + '" target="_blank" rel="noopener">' +
          '<div class="home-video-item-thumb">' +
          '<img src="' + item.thumbnail + '" alt="" loading="lazy">' +
          '<span class="home-video-item-tag">' + item.channel + '</span>' +
          (item.viewers ? '<span class="home-video-live-sm">🔴 ' + item.viewers.toLocaleString() + '</span>' : '') +
          '</div>' +
          '<div class="home-video-item-info">' +
          '<div class="home-video-item-title">' + item.title + '</div>' +
          '</div></a>';
      }).join('');

      return '<div class="home-video-split">' +
        '<div class="home-video-column">' + mainHtml + '<div class="home-video-list">' + leftListHtml + '</div></div>' +
        '<div class="home-video-column">' + subHtml + '<div class="home-video-list">' + rightListHtml + '</div></div>' +
        '</div>';
    }

    return '<div class="home-video-tabs">' +
      '<button class="home-video-tab active" data-video="youtube"><img src="https://www.google.com/s2/favicons?domain=youtube.com&sz=32" alt="">인기 동영상</button>' +
      '<button class="home-video-tab" data-video="chzzk"><img src="https://www.google.com/s2/favicons?domain=chzzk.naver.com&sz=32" alt="">치지직</button>' +
      '</div>' +
      '<div class="home-video-body">' +
      '<div class="home-video-panel active" id="home-video-youtube">' + renderVideoGrid(youtubeItems) + '</div>' +
      '<div class="home-video-panel" id="home-video-chzzk">' + renderVideoGrid(chzzkItems) + '</div>' +
      '</div>';
  }

  // appId로 게임 slug 찾기 (iOS/Android)
  function findGameSlug(appId, platform) {
    if (!appId || !games) return null;
    var gamesList = Object.values(games);
    for (var i = 0; i < gamesList.length; i++) {
      var g = gamesList[i];
      if (!g.appIds) continue;
      if (platform === 'ios' && String(g.appIds.ios) === String(appId)) return g.slug;
      if (platform === 'android' && String(g.appIds.android) === String(appId)) return g.slug;
      // platform 없으면 둘 다 체크
      if (!platform && (String(g.appIds.ios) === String(appId) || String(g.appIds.android) === String(appId))) return g.slug;
    }
    return null;
  }

  // 스팀 게임 이름으로 slug 찾기
  function findGameSlugByName(name) {
    if (!name || !games) return null;
    var normalizedName = name.toLowerCase().trim();
    // Object.entries로 키(게임이름)와 값(게임객체)을 함께 가져옴
    var gamesEntries = Object.entries(games);
    for (var i = 0; i < gamesEntries.length; i++) {
      var gameName = gamesEntries[i][0];  // 키 = 게임 이름
      var g = gamesEntries[i][1];         // 값 = 게임 객체
      // 키(게임 이름)로 매칭
      if (gameName.toLowerCase().trim() === normalizedName) return g.slug;
      // aliases에서 매칭
      if (g.aliases) {
        for (var j = 0; j < g.aliases.length; j++) {
          if (g.aliases[j].toLowerCase().trim() === normalizedName) return g.slug;
        }
      }
    }
    return null;
  }

  // 홈 모바일 랭킹
  function generateHomeMobileRank() {
    var grossingKr = rankings?.grossing?.kr || {};
    var freeKr = rankings?.free?.kr || {};

    function renderList(items, platform) {
      if (!items || items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map(function(app, i) {
        var slug = findGameSlug(app.appId, platform);
        var storeLink = platform === 'ios'
          ? 'https://apps.apple.com/app/id' + app.appId
          : 'https://play.google.com/store/apps/details?id=' + app.appId;
        var link = slug ? '/games/' + slug + '/' : storeLink;
        var isExternal = !slug;
        return '<a class="home-rank-row" href="' + link + '"' + (isExternal ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-rank-icon" src="' + (app.icon || '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
          '<span class="home-rank-name">' + app.title + '</span>' +
          '</a>';
      }).join('');
    }

    return '<div class="home-rank-tabs">' +
      '<button class="home-rank-tab active" data-platform="ios"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="">iOS</button>' +
      '<button class="home-rank-tab" data-platform="android"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="">Android</button>' +
      '</div>' +
      '<div class="home-rank-content">' +
      '<div class="home-rank-chart" id="home-chart-free">' +
      '<div class="home-rank-list active" id="home-rank-free-ios">' + renderList((freeKr.ios || []).slice(0, 10), 'ios') + '</div>' +
      '<div class="home-rank-list" id="home-rank-free-android">' + renderList((freeKr.android || []).slice(0, 10), 'android') + '</div>' +
      '</div>' +
      '<div class="home-rank-chart active" id="home-chart-grossing">' +
      '<div class="home-rank-list active" id="home-rank-grossing-ios">' + renderList((grossingKr.ios || []).slice(0, 10), 'ios') + '</div>' +
      '<div class="home-rank-list" id="home-rank-grossing-android">' + renderList((grossingKr.android || []).slice(0, 10), 'android') + '</div>' +
      '</div>' +
      '</div>';
  }

  // 홈 스팀 순위
  function generateHomeSteam() {
    var mostPlayed = (steam?.mostPlayed || []).slice(0, 10);
    var topSellers = (steam?.topSellers || []).slice(0, 10);

    function renderList(items, showPlayers) {
      if (!items || items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map(function(game, i) {
        var slug = findGameSlugByName(game.name);
        var link = slug ? '/games/' + slug + '/' : (game.appid ? 'https://store.steampowered.com/app/' + game.appid : '#');
        var isExternal = !slug;
        return '<a class="home-steam-row" href="' + link + '"' + (isExternal ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-steam-icon" src="' + (game.img || '') + '" alt="" loading="lazy" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23374151%22 width=%2240%22 height=%2240%22 rx=%228%22/></svg>\'">' +
          '<div class="home-steam-info">' +
          '<span class="home-steam-name">' + (game.name || '') + '</span>' +
          (showPlayers ? '<span class="home-steam-players">' + (game.ccu ? game.ccu.toLocaleString() : '-') + ' 명</span>' : '') +
          '</div></a>';
      }).join('');
    }

    return '<div class="home-steam-chart" id="home-steam-mostplayed">' + renderList(mostPlayed, true) + '</div>' +
      '<div class="home-steam-chart active" id="home-steam-topsellers">' + renderList(topSellers, false) + '</div>';
  }

  // 홈 신규 게임
  function generateHomeUpcoming() {
    var platforms = {
      mobile: { name: '모바일', items: (upcoming?.mobile || []).slice(0, 10) },
      steam: { name: '스팀', items: (upcoming?.steam || []).slice(0, 10) },
      ps5: { name: 'PS5', items: (upcoming?.ps5 || []).slice(0, 10) },
      nintendo: { name: '닌텐도', items: (upcoming?.nintendo || []).slice(0, 10) }
    };

    function renderList(items) {
      if (!items || items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map(function(game, i) {
        return '<a class="home-upcoming-row" href="' + (game.link || '#') + '" target="_blank" rel="noopener">' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-upcoming-icon" src="' + (game.img || '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
          '<div class="home-upcoming-info">' +
          '<span class="home-upcoming-name">' + (game.name || game.title || '') + '</span>' +
          (game.releaseDate ? '<span class="home-upcoming-date">' + game.releaseDate + '</span>' : '') +
          '</div></a>';
      }).join('');
    }

    return '<div class="home-upcoming-tabs">' +
      '<button class="home-upcoming-tab active" data-upcoming="steam">스팀</button>' +
      '<button class="home-upcoming-tab" data-upcoming="ps5">PS5</button>' +
      '<button class="home-upcoming-tab" data-upcoming="nintendo">닌텐도</button>' +
      '<button class="home-upcoming-tab" data-upcoming="mobile">모바일</button>' +
      '</div>' +
      '<div class="home-upcoming-content">' +
      '<div class="home-upcoming-list active" id="home-upcoming-steam">' + renderList(platforms.steam.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-ps5">' + renderList(platforms.ps5.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-nintendo">' + renderList(platforms.nintendo.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-mobile">' + renderList(platforms.mobile.items) + '</div>' +
      '</div>';
  }

  // 트렌드 카드 HTML
  var insightCardHtml = (aiInsight || weeklyInsight) ?
    '<div class="home-card" id="home-insight">' +
    '<div class="home-card-header">' +
    '<h2 class="home-card-title">트렌드 리포트</h2>' +
    '<a href="/trend/" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeInsight() + '</div>' +
    '</div>' : '';

  // 실시간 인기 TOP 3 띠 배너
  function generatePopularBanner() {
    if (!popularGames || popularGames.length === 0) return '';

    // games 데이터를 배열로 변환
    var gamesList = Object.entries(games).map(function(entry) {
      return {
        name: entry[0],
        slug: entry[1].slug,
        icon: entry[1].icon || '',
        appIds: entry[1].appIds || {}
      };
    });

    // `.` 포함된 이전 형식은 무시 (현재는 `-`로 통일)
    var filteredPopular = popularGames.filter(function(pg) { return !pg.slug.includes('.'); });

    // TOP 3 게임 정보 매칭 (slug 또는 appId로) - 중복 제거
    var top3 = [];
    var seenSlugs = {};

    for (var i = 0; i < filteredPopular.length && top3.length < 3; i++) {
      var pg = filteredPopular[i];

      // 먼저 slug로 매칭 시도
      var gameInfo = gamesList.find(function(g) { return g.slug === pg.slug; });

      // 없으면 appId로 매칭 (대소문자 무시)
      if (!gameInfo) {
        var gaSlug = pg.slug.replace(/-/g, '.').toLowerCase();
        gameInfo = gamesList.find(function(g) {
          return String(g.appIds.android || '').toLowerCase() === gaSlug ||
                 String(g.appIds.ios || '').toLowerCase() === gaSlug;
        });
      }

      if (!gameInfo) continue;

      // 이미 추가된 게임이면 스킵 (중복 제거)
      if (seenSlugs[gameInfo.slug]) continue;
      seenSlugs[gameInfo.slug] = true;

      top3.push({
        rank: top3.length + 1,
        name: gameInfo.name,
        slug: gameInfo.slug,
        icon: gameInfo.icon
      });
    }

    if (top3.length === 0) return '';

    var items = top3.map(function(game) {
      var rankClass = game.rank <= 3 ? ' top' + game.rank : '';
      return '<a class="popular-banner-item" href="/games/' + game.slug + '/">' +
        '<span class="popular-banner-rank' + rankClass + '">' + game.rank + '</span>' +
        (game.icon ? '<img class="popular-banner-icon" src="' + game.icon + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
        '<span class="popular-banner-name">' + game.name + '</span>' +
        '</a>';
    }).join('');

    return '<div class="popular-banner">' +
      '<span class="popular-banner-label">인기 게임</span>' +
      '<div class="popular-banner-items">' + items + '</div>' +
      '<a class="popular-banner-more" href="/games/">더보기 →</a>' +
      '</div>';
  }

  var popularBannerHtml = generatePopularBanner();

	  function getAdSize(format, isMobile) {
	    if (isMobile) {
	      // 모바일: 320x100 (horizontal), 300x250 (rectangle/vertical)
	      if (format === 'horizontal') return { width: 320, height: 100 };
	      if (format === 'rectangle') return { width: 300, height: 250 };
	      if (format === 'vertical') return { width: 300, height: 250 }; // 모바일에서 vertical은 rectangle로 대체
	      return { width: 320, height: 100 };
	    }
	    // PC: 728x90 (horizontal), 300x250 (rectangle), 300x600 (vertical)
	    if (format === 'horizontal') return { width: 728, height: 90 };
	    if (format === 'rectangle') return { width: 300, height: 250 };
	    if (format === 'vertical') return { width: 300, height: 600 };
	    return { width: 728, height: 90 };
	  }

	  // 광고 슬롯 HTML 생성 함수 (PC용) - inline push로 즉시 초기화
	  function adSlot(id, extraClass, adFormat, adSlotId) {
	    if (!SHOW_ADS) return '';
	    var format = adFormat || 'horizontal';
	    var slotId = adSlotId || '5214702534';
	    var pushScript = '<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>';
	    // 가로형은 반응형 (화면 너비에 맞게 자동 조절)
	    if (format === 'horizontal') {
	      return '<div class="ad-slot ad-slot-section ad-slot--horizontal ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins>' + pushScript + '</div>';
	    }
    // rectangle 포맷: 고정 크기 300x250
    if (format === 'rectangle') {
      return '<div class="ad-slot ad-slot-section ad-slot--rectangle ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:inline-block;width:300px;height:250px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '"></ins>' + pushScript + '</div>';
    }
    // rectangle-auto 포맷: auto + 반응형 (출시 게임 위 등)
    if (format === 'rectangle-auto') {
      return '<div class="ad-slot ad-slot-section ad-slot--rectangle ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '" data-ad-format="auto" data-full-width-responsive="true"></ins>' + pushScript + '</div>';
    }
    // vertical 포맷 - auto로 최적 광고 자동 선택
    if (format === 'vertical') {
      var pcClass = (extraClass || '').indexOf('pc-only') >= 0 ? ' pc-only' : '';
      return '<div class="ad-slot ad-slot-section ad-slot--vertical ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle' + pcClass + '" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '" data-ad-format="auto" data-full-width-responsive="true"></ins>' + pushScript + '</div>';
    }
	    var size = getAdSize(format, false);
	    return '<div class="ad-slot ad-slot-section ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:inline-block;width:' + size.width + 'px;height:' + size.height + 'px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '"></ins>' + pushScript + '</div>';
	  }

	  // 모바일용 광고 슬롯 - 전체 너비 - inline push로 즉시 초기화
	  function adSlotMobile(id, extraClass, adSlotId, adFormat) {
	    if (!SHOW_ADS) return '';
	    var format = adFormat || 'horizontal';
	    var slotId = adSlotId || '5214702534';
	    var pushScript = '<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>';
	    var isHorizontal = format === 'horizontal';
	    var isRectangle = format === 'rectangle';
	    var shapeClass = isHorizontal ? ' ad-slot--horizontal' : (isRectangle ? ' ad-slot--rectangle' : '');
	    // 가로형: 전체 폭, 높이 자동 (AdSense가 결정)
	    if (isHorizontal) {
	      return '<div class="ad-slot ad-slot-section mobile-only' + shapeClass + ' ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '" data-ad-format="horizontal"></ins>' + pushScript + '</div>';
	    }
	    // 직사각형: rectangle 클래스 적용
	    if (isRectangle) {
	      return '<div class="ad-slot ad-slot-section mobile-only ad-slot--rectangle ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:block;width:336px;height:280px;margin:0 auto" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '"></ins>' + pushScript + '</div>';
	    }
	    return '<div class="ad-slot ad-slot-section mobile-only' + shapeClass + ' ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '" data-ad-format="horizontal"></ins>' + pushScript + '</div>';
	  }

	  // 홈페이지 상단 광고 - 가로형 (728x90, 970x90 등) - inline push로 즉시 초기화
	  var topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only" id="home-top-ad-pc"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';
	  var topAdMobile = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal mobile-only" id="home-top-ad-mobile"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '" data-ad-format="horizontal"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';

	  var content = '<section class="home-section active" id="home">' +
	    '<h1 class="visually-hidden">게이머스크롤 - 게임 순위, 모바일 게임 순위, 스팀 게임 순위, 게임 뉴스</h1>' +
	    topAdMobile +
	    '<div class="home-container">' +
	    '<div class="home-main">' +
	    topAdPc +
	    popularBannerHtml +
	    insightCardHtml +
	    adSlotMobile('ad-above-news-mobile', 'ad-slot--no-reserve', AD_SLOTS.rectangle2, 'rectangle') +
	    '<div class="home-card" id="home-news">' +
	    '<div class="home-card-header">' +
	    '<h2 class="home-card-title">뉴스</h2>' +
	    '<a href="/news/" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeNews() + '</div>' +
    '</div>' +
    adSlot('ad-below-news', 'pc-only', 'horizontal', AD_SLOTS.horizontal2) +
    '<div class="home-card" id="home-community">' +
    '<div class="home-card-header">' +
    '<h2 class="home-card-title">커뮤니티 베스트</h2>' +
    '<a href="/community/" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeCommunity() + '</div>' +
    '</div>' +
    adSlot('ad-below-community', 'pc-only', 'horizontal', AD_SLOTS.horizontal3) +
    '<div class="home-card" id="home-video">' +
	    '<div class="home-card-header">' +
	    '<h2 class="home-card-title">영상 순위</h2>' +
	    '<a href="/youtube/" class="home-card-more">더보기 →</a>' +
	    '</div>' +
	    '<div class="home-card-body">' + generateHomeVideo() + '</div>' +
	    '</div>' +
	    '</div>' +
	    '<div class="home-sidebar">' +
	    adSlotMobile('ad-above-mobile', 'ad-slot--no-reserve', AD_SLOTS.rectangle3, 'rectangle') +
	    '<div class="home-card" id="home-mobile-rank">' +
	    '<div class="home-card-header">' +
	    '<h2 class="visually-hidden">모바일 게임 순위</h2>' +
	    '<span class="home-card-title">모바일 순위</span>' +
	    '<div class="home-card-controls">' +
    '<div class="home-chart-toggle" id="homeChartTab">' +
    '<button class="tab-btn small active" data-home-chart="grossing">매출</button>' +
    '<button class="tab-btn small" data-home-chart="free">인기</button>' +
    '</div>' +
    '<a href="/rankings/" class="home-card-more">더보기 →</a>' +
    '</div>' +
	    '</div>' +
	    '<div class="home-card-body">' + generateHomeMobileRank() + '</div>' +
	    '</div>' +
	    adSlot('ad-below-mobile', 'pc-only', 'vertical', AD_SLOTS.vertical) +
	    adSlotMobile('ad-above-steam-mobile', 'ad-slot--no-reserve', AD_SLOTS.rectangle4, 'rectangle') +
	    '<div class="home-card" id="home-steam">' +
	    '<div class="home-card-header">' +
	    '<h2 class="home-card-title">스팀 순위</h2>' +
	    '<div class="home-card-controls">' +
    '<div class="home-chart-toggle" id="homeSteamTab">' +
    '<button class="tab-btn small active" data-home-steam="topsellers">매출</button>' +
    '<button class="tab-btn small" data-home-steam="mostplayed">인기</button>' +
    '</div>' +
    '<a href="/steam/" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '</div>' +
	    '<div class="home-card-body">' + generateHomeSteam() + '</div>' +
	    '</div>' +
	    adSlot('ad-below-steam', 'pc-only', 'rectangle-auto', AD_SLOTS.rectangle) +
	    '<div class="home-card" id="home-upcoming">' +
	    '<div class="home-card-header">' +
	    '<h2 class="home-card-title">출시 게임</h2>' +
	    '<a href="/upcoming/" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeUpcoming() + '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</section>';

  // 페이지 스크립트 (원본 html.js와 동일한 방식)
  var pageScripts = `<script>
    // 폰트 로딩
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
    } else {
      setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
    }
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }

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

    // 홈 모바일 랭킹 - 인기/매출 탭 전환
    let homeCurrentChart = 'free';
    let homeCurrentPlatform = 'ios';
    const homeChartTab = document.getElementById('homeChartTab');
    homeChartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      homeChartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      homeCurrentChart = btn.dataset.homeChart;
      document.querySelectorAll('.home-rank-chart').forEach(c => c.classList.remove('active'));
      const targetChart = document.getElementById('home-chart-' + homeCurrentChart);
      targetChart?.classList.add('active');
      targetChart?.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
      targetChart?.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform)?.classList.add('active');
    });

    // 홈 모바일 랭킹 - iOS/Android 탭 전환
    document.querySelectorAll('.home-rank-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-rank-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        homeCurrentPlatform = tab.dataset.platform;
        document.querySelectorAll('.home-rank-chart').forEach(chart => {
          chart.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
          chart.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform)?.classList.add('active');
        });
      });
    });

    // 홈 스팀 서브탭 전환
    document.querySelectorAll('[data-home-steam]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-home-steam]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const steamType = btn.dataset.homeSteam;
        document.querySelectorAll('.home-steam-chart').forEach(c => c.classList.remove('active'));
        document.getElementById('home-steam-' + steamType)?.classList.add('active');
      });
    });

    // 홈 신규게임 서브탭 전환
    document.querySelectorAll('.home-upcoming-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-upcoming-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetUpcoming = tab.dataset.upcoming;
        document.querySelectorAll('.home-upcoming-list').forEach(l => l.classList.remove('active'));
        document.getElementById('home-upcoming-' + targetUpcoming)?.classList.add('active');
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: '',  // 홈에서는 nav active 없음
    title: '게이머스크롤 - 게임 순위, 모바일 게임 순위, 스팀 게임 순위, 게임 뉴스',
    description: '게이머스크롤 - 게임 순위, 모바일 게임 순위, 스팀 게임 순위, 게임 뉴스를 한눈에.',
    keywords: '게임 순위, 모바일 게임 순위, 스팀 게임 순위, 앱스토어 순위, 플레이스토어 순위, 메타크리틱, 게임 뉴스',
    canonical: 'https://gamerscrawl.com/',
    pageScripts: pageScripts
  });
}

module.exports = { generateIndexPage };
