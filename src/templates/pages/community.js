/**
 * 커뮤니티 페이지 템플릿
 * - 4컬럼 그리드 (인벤, 아카라이브, 디시, 루리웹)
 * - 각 패널 2열 (좌5, 우5) + 페이지네이션
 */

const { wrapWithLayout, AD_SLOTS, generateAdSlot } = require('../layout');

function generateCommunityPage(data) {
  const { community } = data;

  // 광고 슬롯 (모바일/PC)
  const topAds = generateAdSlot(AD_SLOTS.PC_LongHorizontal001, AD_SLOTS.Mobile_Horizontal001);

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
      
      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">커뮤니티 베스트</h1>
        <div class="community-grid">
          ${panelsHtml}
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
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
