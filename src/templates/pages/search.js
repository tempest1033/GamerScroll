/**
 * 게임 검색 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

function generateSearchPage() {
  const content = `
    ${SHOW_ADS ? `<div class="ad-slot ad-slot-section pc-only">
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${AD_SLOTS.horizontal4}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
    </div>
    <div class="ad-slot ad-slot-section mobile-only">
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${AD_SLOTS.horizontal4}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
    </div>` : ''}
    <div class="search-page">
      <!-- 검색 영역 -->
      <div class="search-page-header">
        <div class="search-page-input-wrap">
          <input type="text" id="search-input" class="search-page-input" placeholder="게임 이름을 입력해주세요" autocomplete="off" autofocus>
          <button id="search-btn" class="search-page-btn" type="button" aria-label="검색">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 로딩 -->
      <div class="search-page-loading" id="search-loading">
        <div class="search-loading-spinner"></div>
        <span>검색 인덱스 로딩 중...</span>
      </div>

      <!-- 최근 본 게임 -->
      <section class="search-page-section" id="recent-section" style="display:none;">
        <div class="search-section-header">
          <h2 class="search-section-title">최근 본 게임</h2>
          <button id="recent-clear" class="search-clear-all-btn">전체 삭제</button>
        </div>
        <div class="search-recent-list" id="recent-list"></div>
      </section>

      <!-- 검색 결과 -->
      <section class="search-page-section" id="results-section" style="display:none;">
        <h2 class="search-section-title" id="results-title">검색 결과</h2>
        <div class="search-results-list" id="results-list"></div>
      </section>
    </div>
  `;

  const searchScript = `
<script>
(function() {
  let searchIndex = [];
  let isLoading = true;

  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const searchLoading = document.getElementById('search-loading');
  const recentSection = document.getElementById('recent-section');
  const recentList = document.getElementById('recent-list');
  const recentClearBtn = document.getElementById('recent-clear');
  const resultsSection = document.getElementById('results-section');
  const resultsTitle = document.getElementById('results-title');
  const resultsList = document.getElementById('results-list');

  // 최근 본 게임 관리
  const RECENT_KEY = 'gamerscrawl_recent_searches';

  function getRecentGames() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch (e) { return []; }
  }

  function saveRecentGame(game) {
    const recent = getRecentGames().filter(g => g.slug !== game.slug);
    recent.unshift(game);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 10)));
  }

  function removeRecentGame(slug) {
    const recent = getRecentGames().filter(g => g.slug !== slug);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }

  function clearAllRecent() {
    localStorage.removeItem(RECENT_KEY);
    renderRecentGames();
  }

  function renderRecentGames() {
    const recent = getRecentGames();
    if (recent.length === 0) {
      recentSection.style.display = 'none';
      return;
    }

    recentList.innerHTML = recent.map(game =>
      '<div class="search-recent-item">' +
        '<a href="/games/' + game.slug + '/" class="search-recent-link">' +
          '<span class="search-recent-name">' + game.name + '</span>' +
        '</a>' +
        '<button class="search-recent-delete" data-slug="' + game.slug + '" aria-label="삭제">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>'
    ).join('');

    recentSection.style.display = 'block';

    // 개별 삭제 이벤트
    recentList.querySelectorAll('.search-recent-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        removeRecentGame(btn.dataset.slug);
        renderRecentGames();
      });
    });
  }

  recentClearBtn.addEventListener('click', clearAllRecent);

  // 검색 인덱스 로드
  fetch('/games/search-index.json')
    .then(res => res.json())
    .then(data => {
      searchIndex = data;
      isLoading = false;
      searchLoading.style.display = 'none';

      // URL 파라미터 확인
      const params = new URLSearchParams(window.location.search);
      const query = params.get('q');
      if (query) {
        searchInput.value = query;
        performSearch(query);
      } else {
        renderRecentGames();
      }
    })
    .catch(err => {
      console.error('검색 인덱스 로드 실패:', err);
      searchLoading.innerHTML = '<span style="color:var(--text-muted);">검색 인덱스를 불러올 수 없습니다</span>';
    });

  // 게임 카드 생성
  function createGameCard(game) {
    const platforms = (game.platforms || []).map(p => {
      const labels = { ios: 'iOS', android: 'Android', pc: 'PC', steam: 'Steam' };
      return '<span class="search-result-platform">' + (labels[p] || p) + '</span>';
    }).join('');

    return '<a class="search-result-card" href="/games/' + game.slug + '/" data-game="' + encodeURIComponent(JSON.stringify({slug: game.slug, name: game.name})) + '">' +
      '<div class="search-result-info">' +
        '<span class="search-result-name">' + game.name + '</span>' +
        (game.developer ? '<span class="search-result-dev">' + game.developer + '</span>' : '') +
      '</div>' +
      (platforms ? '<div class="search-result-platforms">' + platforms + '</div>' : '') +
    '</a>';
  }

  // 검색 실행
  function performSearch(query) {
    if (isLoading) return;

    const q = query.toLowerCase().trim();

    if (q.length < 1) {
      resultsSection.style.display = 'none';
      renderRecentGames();
      return;
    }

    recentSection.style.display = 'none';

    // 검색
    const results = searchIndex.filter(game => {
      const nameMatch = game.name.toLowerCase().includes(q);
      const aliasMatch = (game.aliases || []).some(a => a.toLowerCase().includes(q));
      const devMatch = (game.developer || '').toLowerCase().includes(q);
      return nameMatch || aliasMatch || devMatch;
    });

    // 정렬: 정확한 매칭 우선
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === q;
      const bExact = b.name.toLowerCase() === q;
      const aStarts = a.name.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name, 'ko');
    });

    if (results.length === 0) {
      // 검색 결과 없으면 안내 문구만 표시하고 최근 본 게임 보여주기
      resultsSection.style.display = 'none';
      renderRecentGames();
      // 최근 본 게임 섹션 위에 안내 문구 추가
      const notice = document.querySelector('.search-no-result-notice');
      if (!notice) {
        const noticeEl = document.createElement('div');
        noticeEl.className = 'search-no-result-notice';
        noticeEl.textContent = '검색 결과가 없습니다';
        recentSection.parentNode.insertBefore(noticeEl, recentSection);
      }
      return;
    } else {
      // 검색 결과 있으면 안내 문구 제거
      const notice = document.querySelector('.search-no-result-notice');
      if (notice) notice.remove();
      resultsTitle.textContent = '검색 결과 (' + results.length + ')';
      resultsList.innerHTML = results.slice(0, 20).map(g => createGameCard(g)).join('');

      // 클릭 시 최근 검색에 저장
      resultsList.querySelectorAll('.search-result-card').forEach(card => {
        card.addEventListener('click', () => {
          try {
            const game = JSON.parse(decodeURIComponent(card.dataset.game));
            saveRecentGame(game);
          } catch {}
        });
      });
    }

    resultsSection.style.display = 'block';
  }

  // 이벤트
  let debounceTimer;
  searchInput.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(this.value), 150);
  });

  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      this.value = '';
      performSearch('');
    } else if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      performSearch(this.value);
    }
  });

  searchBtn.addEventListener('click', () => performSearch(searchInput.value));

  // 폰트 로딩 완료 처리
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
  } else {
    setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
  }
  if (typeof twemoji !== 'undefined') {
    twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
  }
})();
</script>`;

  return wrapWithLayout(content, {
    currentPage: 'search',
    title: '게이머스크롤 | 게임 검색',
    description: '게임 이름으로 순위, 뉴스, 커뮤니티 반응을 한눈에 확인하세요.',
    canonical: 'https://gamerscrawl.com/search/',
    pageScripts: searchScript,
    showSearchBar: true
  });
}

module.exports = { generateSearchPage };
