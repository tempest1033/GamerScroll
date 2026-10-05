'use strict';
/**
 * AIScroll 공통 런타임 — layout-core.js(defer) 뒤쪽에 붙어 모든 페이지가 한 번 받아 캐시한다.
 * 예전에는 페이지마다 인라인으로 넣던 약 35KB의 스크립트를 옮겨 HTML을 가볍게 했다.
 *
 * - 광고: 숨겨진 슬롯 정리, 첫 화면 광고 즉시·나머지는 화면 2000px 앞에서 요청, 크기 보정, 빈 광고 접기
 *   (상단 광고는 광고 자리 바로 뒤 인라인 스크립트가 이미 요청했다 — data-gs-ad-pushed)
 * - 헤더 검색: 입력하면 제목 드롭다운, 모바일은 돋보기로 펼침 (자바스크립트 없이도 폼으로 검색 페이지 이동)
 * - 모바일: 아래로 스크롤하면 헤더 윗줄 접기, 좌우 스와이프로 분류 이동, 접힘 상태를 다음 페이지로 유지
 * - 기사: 사이드바 인기/최신 탭, 링크 복사
 *
 * 페이지별 값은 쓰지 않는다: 언어는 <html lang>, 현재 분류는 <body data-page>, 분류 주소는 상단 메뉴 링크에서 읽는다.
 */
function aiscrollSiteRuntime() {
  var doc = document;
  var body = doc.body;
  var isKo = doc.documentElement.lang === 'ko';
  var prefix = isKo ? '/ko' : '';
  var TEXT = isKo
    ? { loading: '불러오는 중…', empty: '검색 결과가 없습니다', copied: '복사됨' }
    : { loading: 'Loading…', empty: 'No results found', copied: 'Copied' };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function onIdle(fn, timeout) {
    if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: timeout || 1500 });
    else setTimeout(fn, 200);
  }
  function isMobileWidth() {
    return window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : window.innerWidth <= 768;
  }

  // ===== 광고 =====
  (function initAds() {
    var ads = doc.querySelectorAll('.adsbygoogle');
    if (!ads.length) return;
    function isHiddenAd(ad) {
      if (!ad) return true;
      var node = ad;
      while (node && node !== body) {
        if (node.offsetParent === null) return true;
        var cs = window.getComputedStyle ? getComputedStyle(node) : null;
        if (cs && cs.display === 'none') return true;
        node = node.parentElement;
      }
      return false;
    }
    // 정리 목록 — 페이지를 떠날 때 관찰자·리스너를 푼다.
    var cleanup = (window.__gsAdCleanup = window.__gsAdCleanup || []);
    if (!window.__gsAdCleanupBound) {
      window.__gsAdCleanupBound = true;
      window.addEventListener('pagehide', function() {
        while (cleanup.length) {
          var fn = cleanup.shift();
          try { if (typeof fn === 'function') fn(); } catch (e) {}
        }
      });
    }
    function getAdVisualWrapper(ad) {
      return ad && ad.closest
        ? ad.closest('.ad-card-responsive-home, .ad-card-responsive-top, .ad-card-mobile-top, .blog-in-article-ad')
        : null;
    }
    function getAdCollapseWrapper(ad) {
      return ad && ad.closest ? ad.closest('.blog-in-article-ad') : null;
    }
    function getAdFrameHeight(ad) {
      var iframe = ad && ad.querySelector && ad.querySelector('iframe');
      if (!iframe) return 0;
      var rect = iframe.getBoundingClientRect ? iframe.getBoundingClientRect() : null;
      return Math.round((rect && rect.height) || iframe.offsetHeight || 0);
    }
    function isAdSenseServingReady() {
      return !!(window.adsbygoogle && window.adsbygoogle.loaded);
    }
    function retryPendingAd(ad, reason) {
      if (!ad || !isAdSenseServingReady()) return false;
      if (ad.getAttribute('data-ad-status') || ad.getAttribute('data-adsbygoogle-status')) return false;
      if (getAdFrameHeight(ad) > 1) return false;
      if (isHiddenAd(ad)) return false;
      var retryCount = parseInt(ad.getAttribute('data-gs-ad-retry-count') || '0', 10);
      if (retryCount >= 2) return false;
      var nextRetryCount = retryCount + 1;
      ad.setAttribute('data-gs-ad-retry-count', String(nextRetryCount));
      if (reason) ad.setAttribute('data-gs-ad-retry-reason', reason);
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setTimeout(function() {
          maybeMarkAdEmpty(ad, true, 'empty-after-retry-' + nextRetryCount);
        }, 12000);
        return true;
      } catch (e) {
        ad.setAttribute('data-gs-ad-retry-error', '1');
        return false;
      }
    }
    function markAdEmpty(ad, reason) {
      var wrap = getAdCollapseWrapper(ad);
      if (!wrap || ad.getAttribute('data-gs-ad-empty') === '1') return;
      ad.setAttribute('data-gs-ad-empty', '1');
      if (reason) ad.setAttribute('data-gs-ad-empty-reason', reason);
      wrap.setAttribute('data-gs-ad-empty', '1');
      if (reason) wrap.setAttribute('data-gs-ad-empty-reason', reason);
      wrap.classList.add('gs-ad-empty');
      wrap.style.setProperty('display', 'none', 'important');
      wrap.style.setProperty('min-height', '0', 'important');
      wrap.style.setProperty('height', '0', 'important');
      wrap.style.setProperty('margin', '0', 'important');
    }
    function maybeMarkAdEmpty(ad, collapseMode, reason) {
      if (!ad || !getAdCollapseWrapper(ad)) return false;
      if (ad.getAttribute('data-gs-ad-pushed') !== '1') return false;
      var status = ad.getAttribute('data-ad-status') || '';
      if (status === 'filled') return false;
      if (status === 'unfilled') {
        markAdEmpty(ad, reason || 'unfilled');
        return true;
      }
      // 결과가 아직 없으면(pending) 접지 않는다. 명시적 unfilled만 슬롯을 숨긴다.
      // 광고 서빙이 준비됐는데 프레임이 없으면 재요청만 한다.
      if (collapseMode && isAdSenseServingReady() && getAdFrameHeight(ad) <= 1) {
        retryPendingAd(ad, reason || 'pending-no-frame');
      }
      return false;
    }
    function scheduleAdEmptyWatch(ad) {
      if (!ad || !getAdCollapseWrapper(ad) || ad.getAttribute('data-gs-ad-empty-watch') === '1') return;
      ad.setAttribute('data-gs-ad-empty-watch', '1');
      function isNearViewport() {
        var wrap = getAdCollapseWrapper(ad) || ad;
        if (!wrap || typeof wrap.getBoundingClientRect !== 'function') return true;
        var rect = wrap.getBoundingClientRect();
        var viewportHeight = window.innerHeight || doc.documentElement.clientHeight || 0;
        return rect.top <= viewportHeight + 3600 && rect.bottom >= -1200;
      }
      function startTimers() {
        if (ad.getAttribute('data-gs-ad-empty-timer') === '1') return;
        ad.setAttribute('data-gs-ad-empty-timer', '1');
        setTimeout(function() { maybeMarkAdEmpty(ad, 'missing-frame', 'empty-timeout-near-30s'); }, 30000);
        setTimeout(function() { maybeMarkAdEmpty(ad, true, 'empty-timeout-near-60s'); }, 60000);
      }
      if (isNearViewport()) {
        startTimers();
      } else if ('IntersectionObserver' in window) {
        var emptyTimerObserver = new IntersectionObserver(function(entries) {
          if (!entries[0] || !entries[0].isIntersecting) return;
          emptyTimerObserver.disconnect();
          startTimers();
        }, { rootMargin: '3600px 0px' });
        emptyTimerObserver.observe(getAdCollapseWrapper(ad));
        cleanup.push(function() { try { emptyTimerObserver.disconnect(); } catch (e) {} });
      } else {
        setTimeout(startTimers, 20000);
      }
    }
    function normalizeAdVisualSize(ad) {
      if (maybeMarkAdEmpty(ad, false, 'status')) return;
      var wrap = getAdVisualWrapper(ad);
      if (!wrap) return;
      var iframe = ad.querySelector && ad.querySelector('iframe');
      if (!iframe) return;
      var iframeHeight = Math.round(iframe.getBoundingClientRect().height || iframe.offsetHeight || 0);
      if (!iframeHeight) return;
      var isMobileTopAd = wrap.classList.contains('ad-card-mobile-top');
      var isTopAd = isMobileTopAd || wrap.classList.contains('ad-card-responsive-home') || wrap.classList.contains('ad-card-responsive-top');
      var minHeight = isTopAd ? (isMobileWidth() ? 250 : 90) : 0;
      var targetHeight = Math.max(iframeHeight, minHeight);
      var adHeight = Math.round(ad.getBoundingClientRect().height || ad.offsetHeight || 0);
      var wrapHeight = Math.round(wrap.getBoundingClientRect().height || wrap.offsetHeight || 0);
      var hasExtraSpace = (adHeight - targetHeight > 24) || (wrapHeight - targetHeight > 24);
      var isShortTopAd = isTopAd && iframeHeight < minHeight;
      // 이미 축소(gs-ad-compact)된 카드보다 크리에이티브가 커지면 다시 맞춘다 (축소만 하면 overflow:hidden 에 잘린 채 굳음).
      var isClipped = wrap.classList.contains('gs-ad-compact') && (targetHeight - wrapHeight > 1 || targetHeight - adHeight > 1);
      if (!hasExtraSpace && !isShortTopAd && !isClipped) return;
      wrap.classList.add('gs-ad-compact');
      wrap.style.height = targetHeight + 'px';
      wrap.style.minHeight = targetHeight + 'px';
      ad.style.height = targetHeight + 'px';
      ad.style.minHeight = targetHeight + 'px';
      if (isShortTopAd) iframe.style.minHeight = minHeight + 'px';
      if (isMobileTopAd) {
        // 모바일 상단은 300×250 고정
        var mobileAdMaxWidth = 300;
        var mobileAdHeightPx = '250px';
        var parentRect = wrap.parentElement && wrap.parentElement.getBoundingClientRect
          ? wrap.parentElement.getBoundingClientRect()
          : null;
        var viewportWidth = doc.documentElement.clientWidth || window.innerWidth || mobileAdMaxWidth;
        var parentWidth = Math.floor((parentRect && parentRect.width) || mobileAdMaxWidth);
        var mobileAdWidth = Math.min(mobileAdMaxWidth, parentWidth || mobileAdMaxWidth, viewportWidth || mobileAdMaxWidth);
        if (!mobileAdWidth || mobileAdWidth < 1) mobileAdWidth = mobileAdMaxWidth;
        var mobileAdWidthPx = Math.round(mobileAdWidth) + 'px';
        [wrap, ad, iframe].forEach(function(el) {
          el.style.setProperty('width', mobileAdWidthPx, 'important');
          el.style.setProperty('max-width', mobileAdMaxWidth + 'px', 'important');
          el.style.setProperty('height', mobileAdHeightPx, 'important');
          el.style.setProperty('min-height', mobileAdHeightPx, 'important');
          el.style.setProperty('max-height', mobileAdHeightPx, 'important');
        });
      }
    }
    function observeAdVisualSize(ad) {
      if (!ad || ad.getAttribute('data-gs-size-observed') === '1') return;
      ad.setAttribute('data-gs-size-observed', '1');
      var scheduled = false;
      function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function() {
          scheduled = false;
          if (maybeMarkAdEmpty(ad, false, 'mutation')) return;
          normalizeAdVisualSize(ad);
        });
      }
      ad.addEventListener('load', schedule, true);
      if (window.MutationObserver) {
        var mutationObserver = new MutationObserver(schedule);
        mutationObserver.observe(ad, {
          attributes: true,
          childList: true,
          subtree: true,
          attributeFilter: ['style', 'data-ad-status']
        });
      }
      if (window.ResizeObserver) {
        var resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(ad);
        var wrap = getAdVisualWrapper(ad);
        if (wrap) resizeObserver.observe(wrap);
      }
      schedule();
      setTimeout(schedule, 600);
      setTimeout(schedule, 1800);
      scheduleAdEmptyWatch(ad);
    }
    function pushAd(ad) {
      if (!ad) return false;
      if (body.classList.contains('ads-disabled')) return false;
      if (ad.getAttribute('data-gs-ad-pushed') === '1') return true;
      if (isHiddenAd(ad)) return false;
      // 폭이 0인 슬롯은 건너뛴다 (애드센스 "availableWidth=0" 오류)
      var pushRect = ad.getBoundingClientRect ? ad.getBoundingClientRect() : null;
      if (pushRect && pushRect.width <= 0) return false;
      observeAdVisualSize(ad);
      ad.setAttribute('data-gs-ad-pushed', '1');
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        ad.removeAttribute('data-gs-ad-pushed');
        return false;
      }
      return true;
    }
    // push()는 슬롯을 지정하지 못하고 순서상 첫 번째 미처리 <ins>를 채운다.
    // 다른 화면 폭용으로 숨겨진 슬롯이 요청을 가로채지 않게 먼저 치운다.
    var liveAds = [];
    for (var ri = 0; ri < ads.length; ri++) {
      var cand = ads[ri];
      if (isHiddenAd(cand) && cand.getAttribute('data-gs-ad-pushed') !== '1') {
        if (cand.parentNode) cand.parentNode.removeChild(cand);
      } else {
        liveAds.push(cand);
      }
    }
    if (!liveAds.length) return;
    for (var a = 0; a < liveAds.length; a++) observeAdVisualSize(liveAds[a]);
    var viewportH = window.innerHeight || doc.documentElement.clientHeight || 0;
    var btfObserver = null;
    if ('IntersectionObserver' in window) {
      btfObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          // 요청에 성공했을 때만 관찰을 푼다 (배치 중 폭 0 등으로 실패하면 다음 변화 때 재시도)
          if (pushAd(entry.target)) btfObserver.unobserve(entry.target);
        });
      }, { rootMargin: '2000px 0px' });
      cleanup.push(function() { try { btfObserver.disconnect(); } catch (e) {} });
    }
    function pushOrWatch(ad) {
      if (pushAd(ad)) return;
      if (btfObserver) { btfObserver.observe(ad); return; }
      var tries = 0;
      (function retryLater() {
        if (tries++ >= 5) return;
        setTimeout(function() { if (!pushAd(ad)) retryLater(); }, 400 * tries);
      })();
    }
    for (var j = 0; j < liveAds.length; j++) {
      // 첫 슬롯과 첫 화면(+25%) 안의 슬롯은 바로, 나머지는 화면 2000px 앞에서 요청한다.
      var rect = liveAds[j].getBoundingClientRect ? liveAds[j].getBoundingClientRect() : null;
      if (j === 0 || (rect && rect.top < viewportH * 1.25 && rect.width > 0)) {
        pushOrWatch(liveAds[j]);
      } else if (btfObserver) {
        btfObserver.observe(liveAds[j]);
      } else {
        pushOrWatch(liveAds[j]);
      }
    }
  })();

  // ===== 헤더 검색 =====
  (function initSearch() {
    var header = doc.getElementById('site-header');
    var form = doc.getElementById('site-search');
    if (!header || !form) return;
    var input = form.querySelector('.search-input');
    var dropdown = form.querySelector('.search-dropdown');
    var toggle = header.querySelector('.search-toggle');
    var closeBtn = form.querySelector('.search-close');
    if (!input || !dropdown) return;
    var indexPromise = null;
    var indexReady = false;
    var latestQuery = '';
    var timer = 0;

    function loadIndex() {
      if (indexPromise) return indexPromise;
      indexPromise = fetch(prefix + '/articles-search.json', { credentials: 'same-origin' })
        .then(function(res) { return res.ok ? res.json() : []; })
        .catch(function() { return []; })
        .then(function(list) {
          indexReady = true;
          return (Array.isArray(list) ? list : []).map(function(item) {
            var title = String((item && item.title) || '');
            return {
              title: title,
              lower: String((item && item.titleLower) || title.toLowerCase()),
              category: String((item && item.category) || 'news'),
              slug: String((item && item.slug) || '')
            };
          }).filter(function(item) { return item.slug; });
        });
      return indexPromise;
    }
    function hide() {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
    }
    function show(html) {
      dropdown.innerHTML = html;
      dropdown.classList.add('active');
    }
    function run(value) {
      var query = String(value || '').trim().toLowerCase();
      if (query.length < 2) {
        latestQuery = '';
        hide();
        return;
      }
      latestQuery = query;
      if (!indexReady) show('<p class="search-no-results">' + TEXT.loading + '</p>');
      loadIndex().then(function(list) {
        if (latestQuery !== query) return;
        var matched = list.filter(function(item) { return item.lower.indexOf(query) !== -1; }).slice(0, 8);
        show(matched.length
          ? matched.map(function(item) {
            return '<a class="search-result-item" href="' + prefix + '/article/' + encodeURIComponent(item.category) + '/' + encodeURIComponent(item.slug) + '/">' + escapeHtml(item.title) + '</a>';
          }).join('')
          : '<p class="search-no-results">' + TEXT.empty + '</p>');
      });
    }
    function openSearch(event) {
      if (event) event.preventDefault();
      header.classList.add('search-open');
      body.classList.remove('search-hidden');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(function() { input.focus(); });
      onIdle(loadIndex, 1400);
    }
    function closeSearch() {
      if (!header.classList.contains('search-open')) return;
      header.classList.remove('search-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      input.value = '';
      latestQuery = '';
      hide();
    }
    if (toggle) toggle.addEventListener('click', openSearch);
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);
    input.addEventListener('focus', function() {
      onIdle(loadIndex, 1400);
      if (input.value.trim().length >= 2) run(input.value);
    });
    input.addEventListener('input', function() {
      clearTimeout(timer);
      var value = input.value;
      timer = setTimeout(function() { run(value); }, 120);
    });
    input.addEventListener('keydown', function(event) {
      if (event.key !== 'Escape') return;
      if (header.classList.contains('search-open')) closeSearch();
      else hide();
      input.blur();
    });
    // 두 글자 미만이면 검색 페이지로 보내지 않는다
    form.addEventListener('submit', function(event) {
      if (input.value.trim().length < 2) event.preventDefault();
    });
    // 결과를 누르는 동안 입력창 포커스가 빠져 목록이 사라지지 않게
    dropdown.addEventListener('mousedown', function(event) { event.preventDefault(); });
    doc.addEventListener('click', function(event) {
      var target = event.target;
      if (target && target.closest && (target.closest('#site-search') || target.closest('.search-toggle'))) return;
      hide();
      closeSearch();
    });
  })();

  // ===== 기사: 사이드바 인기/최신 탭, 링크 복사 =====
  if (window.GSUtils && doc.getElementById('sidebarArticleTab')) {
    window.GSUtils.toggleSidebarArticleTab('sidebarArticleTab');
    window.GSUtils.initSidebarLatestDefer({
      tabId: 'sidebarArticleTab',
      latestListId: 'sidebar-latest',
      templateId: 'sidebar-latest-template',
      idleTimeout: 3200,
      fallbackDelay: 1600
    });
  }
  // 기기 공유 창: 지원하는 브라우저(주로 모바일)에서만 버튼을 드러낸다
  Array.prototype.forEach.call(doc.querySelectorAll('.blog-share-native'), function(btn) {
    if (!navigator.share) return;
    btn.hidden = false;
    if (btn.parentNode) btn.parentNode.classList.add('has-native');
    btn.addEventListener('click', function() {
      navigator.share({ title: btn.getAttribute('data-share-title') || doc.title, url: btn.getAttribute('data-share-url') || location.href }).catch(function() {});
    });
  });
  Array.prototype.forEach.call(doc.querySelectorAll('.blog-share-copy'), function(btn) {
    btn.addEventListener('click', function() {
      var url = btn.getAttribute('data-share-url') || location.href;
      var label = btn.getAttribute('data-copied-label') || TEXT.copied;
      var live = btn.querySelector('[aria-live]');
      function done() {
        btn.classList.add('is-copied');
        btn.setAttribute('data-tip', label);
        if (live) live.textContent = label;
        clearTimeout(btn._copiedTimer);
        btn._copiedTimer = setTimeout(function() { btn.classList.remove('is-copied'); if (live) live.textContent = ''; }, 2000);
      }
      // 클립보드 API 가 막힌 환경(권한 거부 · 일부 인앱 브라우저)은 임시 입력칸을 골라 복사한다
      function legacyCopy() {
        var area = doc.createElement('textarea');
        area.value = url;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        doc.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
        doc.body.removeChild(area);
        if (ok) done(); else window.prompt('URL', url);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, legacyCopy);
      } else {
        legacyCopy();
      }
    });
  });

  // ===== 모바일: 아래로 스크롤하면 헤더 윗줄(로고·검색)을 접는다 =====
  (function initHeaderHide() {
    if (!isMobileWidth()) return;
    var header = doc.getElementById('site-header');
    var lastY = window.scrollY;
    var ticking = false;
    function setHidden(hidden) {
      if (body.classList.contains('search-hidden') !== hidden) body.classList.toggle('search-hidden', hidden);
    }
    function update() {
      ticking = false;
      var y = window.scrollY;
      var delta = y - lastY;
      lastY = y;
      if (header && header.classList.contains('search-open')) setHidden(false);
      else if (y <= 0 || delta < -10) setHidden(false);
      else if (delta > 0 && y > 80) setHidden(true);
    }
    window.addEventListener('scroll', function() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
  })();

  // 링크로 이동할 때 헤더 접힘 상태를 넘겨 다음 페이지 첫 화면에서 메뉴 위치가 튀지 않게 한다
  doc.addEventListener('click', function(event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link || link.target === '_blank') return;
    try {
      if (body.classList.contains('search-hidden')) sessionStorage.setItem('ai-search-hidden', '1');
      else sessionStorage.removeItem('ai-search-hidden');
    } catch (e) {}
  }, true);

  // ===== 모바일 좌우 스와이프: 홈 → 상단 메뉴 순서로 이웃 분류 페이지 이동 (양 끝은 순환) =====
  (function initSwipe() {
    var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (!isTouch) return;
    var logo = doc.querySelector('.site-logo');
    var links = Array.prototype.slice.call(doc.querySelectorAll('.site-nav-item'));
    if (!logo || !links.length) return;
    var sections = [{ id: 'home', href: logo.getAttribute('href') }].concat(links.map(function(link) {
      return { id: link.getAttribute('data-nav-id'), href: link.getAttribute('href') };
    }));
    var page = body.getAttribute('data-page') || 'home';
    var currentIndex = 0;
    sections.forEach(function(section, i) { if (section.id === page) currentIndex = i; });

    var SWIPE_THRESHOLD = 0.10;
    var VELOCITY_THRESHOLD = 0.5;
    var MAX_DRAG_PERCENT = 0.35;
    var DIRECTION_LOCK_PX = 10;
    var DIRECTION_LOCK_RATIO = 1.5;
    var TRANSITION_MS = 200;
    var SLIDE_OUT_MS = 180;
    // 헤더·입력창·광고와 가로로 스크롤되는 영역(표·코드·영상)에서 시작한 터치는 가로채지 않는다
    var EXCLUDE = '.site-header, .search-dropdown, input, textarea, select, .ad-card, .adsbygoogle, iframe, ' +
      '.table-scroll, .blog-table-wrapper, pre, .blog-video-wrapper, .blog-tweet';

    var startX = null;
    var startY = null;
    var startTime = 0;
    var axis = null;
    var swiping = false;
    var mode = null;
    var main = null;
    var navigating = false;

    function reset() {
      if (main) {
        main.style.transition = 'transform ' + TRANSITION_MS + 'ms ease';
        main.style.transform = '';
        var target = main;
        setTimeout(function() { target.style.transition = ''; }, TRANSITION_MS);
      }
      startX = null;
      startY = null;
      axis = null;
      swiping = false;
      mode = null;
    }
    function go(url, direction) {
      navigating = true;
      try {
        if (body.classList.contains('search-hidden')) sessionStorage.setItem('ai-search-hidden', '1');
      } catch (e) {}
      main.style.transition = 'transform ' + SLIDE_OUT_MS + 'ms ease';
      main.style.transform = 'translate3d(' + (direction === 'next' ? '-100%' : '100%') + ', 0, 0)';
      setTimeout(function() { window.location.href = url; }, SLIDE_OUT_MS);
    }
    doc.addEventListener('touchstart', function(event) {
      if (navigating || !event.touches || event.touches.length > 1) return;
      var target = event.target;
      if (target && target.closest && target.closest(EXCLUDE)) return;
      main = doc.querySelector('main.site-container');
      if (!main) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startTime = Date.now();
      axis = null;
      swiping = false;
      mode = null;
    }, { passive: true });
    doc.addEventListener('touchmove', function(event) {
      if (startX === null || !main) return;
      var diffX = startX - event.touches[0].clientX;
      var diffY = startY - event.touches[0].clientY;
      var absX = Math.abs(diffX);
      var absY = Math.abs(diffY);
      if (!axis) {
        if (absX < DIRECTION_LOCK_PX && absY < DIRECTION_LOCK_PX) return;
        if (absY > absX * DIRECTION_LOCK_RATIO) { axis = 'vertical'; return; }
        if (absX > absY * DIRECTION_LOCK_RATIO) axis = 'horizontal';
        else return;
      }
      if (axis !== 'horizontal') return;
      event.preventDefault();
      swiping = true;
      mode = diffX > 0 ? 'next' : 'prev';
      var drag = Math.min(absX, window.innerWidth * MAX_DRAG_PERCENT);
      main.style.transition = 'none';
      main.style.transform = 'translate3d(' + (diffX > 0 ? -drag : drag) + 'px, 0, 0)';
    }, { passive: false });
    doc.addEventListener('touchend', function() {
      if (startX === null || !main) return;
      if (!swiping) { reset(); return; }
      var match = main.style.transform.match(/translate3d\(([-\d.]+)px/);
      var currentX = match ? parseFloat(match[1]) : 0;
      var elapsed = Date.now() - startTime;
      var velocity = elapsed > 0 ? Math.abs(currentX) / elapsed : 0;
      var isFlick = velocity >= VELOCITY_THRESHOLD && Math.abs(currentX) > 30;
      if ((Math.abs(currentX) / window.innerWidth >= SWIPE_THRESHOLD || isFlick) && mode) {
        var count = sections.length;
        var nextIndex = mode === 'next' ? (currentIndex + 1) % count : (currentIndex - 1 + count) % count;
        var targetSection = sections[nextIndex];
        if (targetSection && targetSection.href) {
          go(targetSection.href, mode);
          return;
        }
      }
      reset();
    }, { passive: true });
    doc.addEventListener('touchcancel', reset, { passive: true });
  })();
}

const siteRuntimeScript = `(${aiscrollSiteRuntime.toString()})();`;

module.exports = { siteRuntimeScript };
