/**
 * 커뮤니티 페이지 템플릿
 * - 4컬럼 그리드 (인벤, 아카라이브, 디시, 루리웹)
 * - 각 패널 2열 (좌5, 우5) + 페이지네이션
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

function generateCommunityPage(data) {
  const { community } = data;

  // 광고 슬롯 (홈페이지와 동일한 분리 배치 방식)
  const topAdMobile = SHOW_ADS ? '<ins class="adsbygoogle mobile-only ad-slot-section" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '" data-ad-format="horizontal"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>' : '';
  const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" style="display:block;width:100%;max-height:90px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';

  const sources = [
    { key: 'inven', name: '인벤', title: '인벤 핫이슈', icon: 'https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32', link: 'https://hot.inven.co.kr/', items: community?.inven || [] },
    { key: 'arca', name: '아카라이브', title: '아카라이브 베스트', icon: 'https://www.google.com/s2/favicons?domain=arca.live&sz=32', link: 'https://arca.live/b/live', items: community?.arca || [] },
    { key: 'dcinside', name: '디시인사이드', title: '디시 실베', icon: 'https://www.google.com/s2/favicons?domain=dcinside.com&sz=32', link: 'https://gall.dcinside.com/board/lists?id=dcbest', items: community?.dcinside || [] },
    { key: 'ruliweb', name: '루리웹', title: '루리웹 베스트', icon: 'https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32', link: 'https://bbs.ruliweb.com/best/game?orderby=recommend&range=24h', items: community?.ruliweb || [] }
  ];

  // 각 패널 HTML 생성
  function generatePanel(source) {
    const items = source.items.slice(0, 20); // 최대 20개 (페이지당 10개 x 2페이지)
    if (items.length === 0) {
      return `
        <div class="community-panel" data-source="${source.key}">
          <div class="community-panel-header">
            <h2 class="community-panel-title">${source.title}</h2>
            <a href="${source.link}" target="_blank" class="community-panel-more">더보기 →</a>
          </div>
          <div class="community-panel-body">
            <div class="no-data">글을 불러올 수 없습니다</div>
          </div>
        </div>
      `;
    }

    const itemsHtml = items.map((item, i) => `
      <a class="community-item" href="${item.link}" target="_blank" rel="noopener" data-index="${i}">
        <img src="${source.icon}" alt="" class="community-item-icon">
        <span class="community-item-title">${item.title}</span>
      </a>
    `).join('');

    return `
      <div class="community-panel" data-source="${source.key}">
        <div class="community-panel-header">
          <h2 class="community-panel-title">${source.title}</h2>
          <a href="${source.link}" target="_blank" class="community-panel-more">더보기 →</a>
        </div>
        <div class="community-panel-body">
          <div class="community-items-grid">${itemsHtml}</div>
        </div>
        ${items.length > 10 ? `
        <div class="community-panel-pagination">
          <button class="community-page-btn active" data-page="0">1</button>
          <button class="community-page-btn" data-page="1">2</button>
        </div>
        ` : ''}
      </div>
    `;
  }

  const panelsHtml = sources.map(s => generatePanel(s)).join('');

  const content = `
    <section class="section active" id="community">
      ${topAdMobile}
      <div class="page-wrapper">
        ${topAdPc}
        <h1 class="visually-hidden">커뮤니티 베스트</h1>
        <div class="community-grid">
          ${panelsHtml}
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 폰트 로딩
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
    } else {
      setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
    }
    // twemoji
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }

    // 페이지네이션 (모바일에서만 작동, PC는 전체 표시)
    const isMobile = () => window.innerWidth <= 768;

    document.querySelectorAll('.community-panel').forEach(panel => {
      const items = panel.querySelectorAll('.community-item');
      const pageBtns = panel.querySelectorAll('.community-page-btn');
      const PAGE_SIZE = 10;
      let currentPage = 0;

      function showPage(pageNum) {
        currentPage = pageNum;
        if (isMobile()) {
          const start = pageNum * PAGE_SIZE;
          const end = start + PAGE_SIZE;
          items.forEach((item, i) => {
            item.style.display = (i >= start && i < end) ? '' : 'none';
          });
        } else {
          // PC: 모든 아이템 표시
          items.forEach(item => item.style.display = '');
        }
        pageBtns.forEach(btn => {
          btn.classList.toggle('active', parseInt(btn.dataset.page) === pageNum);
        });
      }

      pageBtns.forEach(btn => {
        btn.addEventListener('click', () => showPage(parseInt(btn.dataset.page)));
      });

      // 리사이즈 시 재적용
      window.addEventListener('resize', () => showPage(currentPage));

      // 초기화
      showPage(0);
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'community',
    title: '게이머스크롤 | 게임 커뮤니티',
    description: '디시인사이드 실시간 베스트, 아카라이브 베스트, 인벤 핫이슈, 루리웹 게임 게시판 인기글을 한곳에서. 게이머들의 생생한 반응을 확인하세요.',
    canonical: 'https://gamerscrawl.com/community/',
    pageScripts
  });
}

module.exports = { generateCommunityPage };
