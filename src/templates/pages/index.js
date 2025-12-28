/**
 * 홈/대시보드 페이지 템플릿
 * 각 섹션의 요약 카드를 표시
 */

const { wrapWithLayout, SHOW_ADS } = require('../layout');

function generateIndexPage(data) {
  const { rankings, news, steam, youtube, chzzk, community, upcoming, insight, metacritic, weeklyInsight } = data;

  // AI 트렌드 데이터
  const aiInsight = insight?.ai || null;
  const aiGeneratedAt = insight?.aiGeneratedAt ? new Date(insight.aiGeneratedAt) : null;
  const kstTime = aiGeneratedAt ? new Date(aiGeneratedAt.getTime() + 9 * 60 * 60 * 1000) : null;
  const insightDate = kstTime ? (kstTime.getUTCMonth() + 1) + '월 ' + kstTime.getUTCDate() + '일' : '';
  const insightAmPm = kstTime ? (kstTime.getUTCHours() < 12 ? 'AM' : 'PM') : '';

  // URL 수정 헬퍼
  const fixUrl = function(url) {
    if (!url) return url;
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.includes('inven.co.kr')) return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
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
      const listItems = withThumb.slice(2, 9);

      var mainCardHtml = '';
      if (mainCard) {
        mainCardHtml = '<a class="home-news-card home-news-card-main" href="' + mainCard.link + '" target="_blank" rel="noopener">' +
          '<div class="home-news-card-thumb">' +
          '<img src="' + fixUrl(mainCard.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>\'">' +
          '</div>' +
          '<div class="home-news-card-info">' +
          '<span class="home-news-card-title">' + mainCard.title + '</span>' +
          '<span class="home-news-card-source">' + (sourceName || mainCard.source) + '</span>' +
          '</div></a>';
      }

      var subCardHtml = '';
      if (subCard) {
        subCardHtml = '<a class="home-news-card home-news-card-sub" href="' + subCard.link + '" target="_blank" rel="noopener">' +
          '<div class="home-news-card-thumb">' +
          '<img src="' + fixUrl(subCard.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>\'">' +
          '</div>' +
          '<div class="home-news-card-info">' +
          '<span class="home-news-card-title">' + subCard.title + '</span>' +
          '<span class="home-news-card-source">' + (sourceName || subCard.source) + '</span>' +
          '</div></a>';
      }

      var listHtml = listItems.map(function(item) {
        return '<a class="home-news-item" href="' + item.link + '" target="_blank" rel="noopener">' +
          '<div class="home-news-item-thumb">' +
          '<img src="' + fixUrl(item.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' +
          '</div>' +
          '<div class="home-news-item-info">' +
          '<span class="home-news-title">' + item.title + '</span>' +
          '<span class="home-news-source-tag">' + (sourceName || item.source) + '</span>' +
          '</div></a>';
      }).join('');

      return '<div class="home-news-split">' +
        '<div class="home-news-cards">' + mainCardHtml + subCardHtml + '</div>' +
        '<div class="home-news-list">' + listHtml + '</div>' +
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

  // 홈 트렌드
  function generateHomeInsight() {
    if (!aiInsight) {
      return '<div class="home-empty">트렌드를 불러올 수 없습니다</div>';
    }

    var focusSummary = aiInsight.summary || '';
    if (!focusSummary) {
      return '<div class="home-empty">트렌드를 불러올 수 없습니다</div>';
    }

    return '<div class="home-daily-focus"><p class="home-daily-focus-text">' + focusSummary + '</p></div>';
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
            '<span class="home-community-title">' + item.title + '</span>' +
            '<span class="home-community-meta">' +
            '<img src="' + item.icon + '" alt="">' +
            '<span class="home-community-source">' + (sourceName || item.source) + '</span>' +
            (item.channel ? '<span class="home-community-channel">· ' + item.channel + '</span>' : '') +
            '</span></a>';
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
      var listItems = items.slice(2, 9);

      var mainHtml = '<a class="home-video-card home-video-card-main" href="' + mainItem.link + '" target="_blank" rel="noopener">' +
        '<div class="home-video-card-thumb">' +
        '<img src="' + mainItem.thumbnail + '" alt="" loading="lazy">' +
        (mainItem.viewers ? '<span class="home-video-live">🔴 LIVE ' + mainItem.viewers.toLocaleString() + '</span>' : '') +
        '</div>' +
        '<div class="home-video-card-info">' +
        '<div class="home-video-card-title">' + mainItem.title + '</div>' +
        '<div class="home-video-card-channel">' + mainItem.channel + '</div>' +
        '</div></a>';

      var subHtml = '';
      if (subItem) {
        subHtml = '<a class="home-video-card home-video-card-sub" href="' + subItem.link + '" target="_blank" rel="noopener">' +
          '<div class="home-video-card-thumb">' +
          '<img src="' + subItem.thumbnail + '" alt="" loading="lazy">' +
          (subItem.viewers ? '<span class="home-video-live">🔴 ' + subItem.viewers.toLocaleString() + '</span>' : '') +
          '</div>' +
          '<div class="home-video-card-info">' +
          '<div class="home-video-card-title">' + subItem.title + '</div>' +
          '<div class="home-video-card-channel">' + subItem.channel + '</div>' +
          '</div></a>';
      }

      var listHtml = listItems.map(function(item) {
        return '<a class="home-video-item" href="' + item.link + '" target="_blank" rel="noopener">' +
          '<div class="home-video-item-thumb">' +
          '<img src="' + item.thumbnail + '" alt="" loading="lazy">' +
          (item.viewers ? '<span class="home-video-live-sm">🔴 ' + item.viewers.toLocaleString() + '</span>' : '') +
          '</div>' +
          '<div class="home-video-item-info">' +
          '<div class="home-video-item-title">' + item.title + '</div>' +
          '<div class="home-video-item-channel">' + item.channel + '</div>' +
          '</div></a>';
      }).join('');

      return '<div class="home-video-split">' +
        '<div class="home-video-cards">' + mainHtml + subHtml + '</div>' +
        '<div class="home-video-list">' + listHtml + '</div>' +
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

  // 홈 모바일 랭킹
  function generateHomeMobileRank() {
    var grossingKr = rankings?.grossing?.kr || {};
    var freeKr = rankings?.free?.kr || {};

    function renderList(items) {
      if (!items || items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map(function(app, i) {
        return '<div class="home-rank-row">' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-rank-icon" src="' + (app.icon || '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
          '<span class="home-rank-name">' + app.title + '</span>' +
          '</div>';
      }).join('');
    }

    return '<div class="home-rank-tabs">' +
      '<button class="home-rank-tab active" data-platform="ios"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="">iOS</button>' +
      '<button class="home-rank-tab" data-platform="android"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="">Android</button>' +
      '</div>' +
      '<div class="home-rank-content">' +
      '<div class="home-rank-chart active" id="home-chart-free">' +
      '<div class="home-rank-list active" id="home-rank-free-ios">' + renderList((freeKr.ios || []).slice(0, 10)) + '</div>' +
      '<div class="home-rank-list" id="home-rank-free-android">' + renderList((freeKr.android || []).slice(0, 10)) + '</div>' +
      '</div>' +
      '<div class="home-rank-chart" id="home-chart-grossing">' +
      '<div class="home-rank-list active" id="home-rank-grossing-ios">' + renderList((grossingKr.ios || []).slice(0, 10)) + '</div>' +
      '<div class="home-rank-list" id="home-rank-grossing-android">' + renderList((grossingKr.android || []).slice(0, 10)) + '</div>' +
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
        var link = game.appid ? 'https://store.steampowered.com/app/' + game.appid : '#';
        return '<a class="home-steam-row" href="' + link + '" target="_blank" rel="noopener">' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-steam-icon" src="' + (game.img || '') + '" alt="" loading="lazy" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23374151%22 width=%2240%22 height=%2240%22 rx=%228%22/></svg>\'">' +
          '<div class="home-steam-info">' +
          '<span class="home-steam-name">' + (game.name || '') + '</span>' +
          (showPlayers ? '<span class="home-steam-players">' + (game.ccu ? game.ccu.toLocaleString() : '-') + ' 명</span>' : '') +
          '</div></a>';
      }).join('');
    }

    return '<div class="home-steam-chart active" id="home-steam-mostplayed">' + renderList(mostPlayed, true) + '</div>' +
      '<div class="home-steam-chart" id="home-steam-topsellers">' + renderList(topSellers, false) + '</div>';
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
      '<button class="home-upcoming-tab active" data-upcoming="mobile">모바일</button>' +
      '<button class="home-upcoming-tab" data-upcoming="steam">스팀</button>' +
      '<button class="home-upcoming-tab" data-upcoming="ps5">PS5</button>' +
      '<button class="home-upcoming-tab" data-upcoming="nintendo">닌텐도</button>' +
      '</div>' +
      '<div class="home-upcoming-content">' +
      '<div class="home-upcoming-list active" id="home-upcoming-mobile">' + renderList(platforms.mobile.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-steam">' + renderList(platforms.steam.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-ps5">' + renderList(platforms.ps5.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-nintendo">' + renderList(platforms.nintendo.items) + '</div>' +
      '</div>';
  }

  // AM/PM 표시
  var insightHeader = insightDate ? insightDate + ' ' : '';
  var ampmHtml = insightAmPm ? ' <span class="home-card-ampm-underline ' + insightAmPm.toLowerCase() + '">' + insightAmPm + '</span>' : '';

  // 트렌드 카드 HTML
  var insightCardHtml = aiInsight ?
    '<div class="home-card" id="home-insight">' +
    '<div class="home-card-header">' +
    '<div class="home-card-title">' + insightHeader + '게임 트렌드 리포트' + ampmHtml + '</div>' +
    '<a href="/trend" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeInsight() + '</div>' +
    '</div>' : '';

  // 광고 슬롯 HTML 생성 함수
  function adSlot(id, extraClass) {
    if (!SHOW_ADS) return '';
    return '<div class="ad-slot ad-slot-section ' + (extraClass || '') + '" id="' + id + '"><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="5214702534" data-ad-format="horizontal" data-full-width-responsive="true"></ins></div>';
  }

  var content = '<section class="home-section active" id="home">' +
    '<div class="home-container">' +
    '<div class="home-main">' +
    adSlot('ad-above-trend', '') +
    insightCardHtml +
    '<div class="home-card" id="home-news">' +
    '<div class="home-card-header">' +
    '<div class="home-card-title">주요 뉴스</div>' +
    '<a href="/news" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeNews() + '</div>' +
    '</div>' +
    adSlot('ad-below-news', 'pc-only') +
    '<div class="home-card" id="home-community">' +
    '<div class="home-card-header">' +
    '<div class="home-card-title">커뮤니티 베스트</div>' +
    '<a href="/community" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeCommunity() + '</div>' +
    '</div>' +
    adSlot('ad-below-community', 'pc-only') +
    '<div class="home-card" id="home-video">' +
    '<div class="home-card-header">' +
    '<div class="home-card-title">영상 순위</div>' +
    '<a href="/youtube" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeVideo() + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="home-sidebar">' +
    adSlot('ad-above-mobile', 'mobile-only') +
    '<div class="home-card" id="home-mobile-rank">' +
    '<div class="home-card-header">' +
    '<div class="home-card-title">모바일 랭킹</div>' +
    '<div class="home-card-controls">' +
    '<div class="home-chart-toggle" id="homeChartTab">' +
    '<button class="tab-btn small active" data-home-chart="free">인기</button>' +
    '<button class="tab-btn small" data-home-chart="grossing">매출</button>' +
    '</div>' +
    '<a href="/rankings" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeMobileRank() + '</div>' +
    '</div>' +
    adSlot('ad-below-mobile', 'pc-only') +
    adSlot('ad-above-steam', 'mobile-only') +
    '<div class="home-card" id="home-steam">' +
    '<div class="home-card-header">' +
    '<div class="home-card-title">스팀 순위</div>' +
    '<div class="home-card-controls">' +
    '<div class="home-chart-toggle" id="homeSteamTab">' +
    '<button class="tab-btn small active" data-home-steam="mostplayed">인기</button>' +
    '<button class="tab-btn small" data-home-steam="topsellers">매출</button>' +
    '</div>' +
    '<a href="/steam" class="home-card-more">더보기 →</a>' +
    '</div>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeSteam() + '</div>' +
    '</div>' +
    adSlot('ad-above-upcoming', '') +
    '<div class="home-card" id="home-upcoming">' +
    '<div class="home-card-header">' +
    '<div class="home-card-title">신규 게임</div>' +
    '<a href="/upcoming" class="home-card-more">더보기 →</a>' +
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
    title: '게이머스크롤 | 게임 트렌드 리포트 · 순위 · 뉴스를 한눈에',
    description: '게임 트렌드 리포트, 모바일/스팀 게임 순위, 실시간 뉴스를 무료로. 한국·일본·미국 앱스토어 순위, 커뮤니티 반응, 게임주 동향까지 한눈에 확인하세요.',
    canonical: 'https://gamerscrawl.com/',
    pageScripts: pageScripts
  });
}

module.exports = { generateIndexPage };
