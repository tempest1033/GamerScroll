/**
 * 커뮤니티 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS } = require('../layout');

function generateCommunityPage(data) {
  const { community } = data;

  // 커뮤니티 아이템 생성
  function generateCommunityItems(items, sourceName) {
    if (!items || items.length === 0) {
      return '<div class="no-data">커뮤니티 글을 불러올 수 없습니다</div>';
    }
    return items.map((item, i) => `
      <a class="news-item clickable" href="${item.link}" target="_blank" rel="noopener">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          <span class="news-title">${item.title}</span>
          <div class="news-tags"><span class="community-tag source-tag">${sourceName}</span></div>
        </div>
      </a>
    `).join('');
  }

  const dcHTML = generateCommunityItems(community?.dcinside, '디시인사이드');
  const arcaHTML = generateCommunityItems(community?.arca, '아카라이브');
  const invenHTML = generateCommunityItems(community?.inven, '인벤');
  const ruliwebHTML = generateCommunityItems(community?.ruliweb, '루리웹');

  const content = `
    <section class="section active" id="community">
      ${SHOW_ADS ? `<div class="ad-slot ad-slot-section pc-only">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="5214702534" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>
      <div class="ad-slot ad-slot-section mobile-only">
        <ins class="adsbygoogle" style="display:block;height:100px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="5214702534" data-ad-format="horizontal" data-full-width-responsive="false"></ins>
      </div>` : ''}
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="communityTab">
            <button class="tab-btn active" data-community="inven"><img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">인벤</button>
            <button class="tab-btn" data-community="arca"><img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">아카라이브</button>
            <button class="tab-btn" data-community="dcinside"><img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="" class="news-favicon">디시인사이드</button>
            <button class="tab-btn" data-community="ruliweb"><img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">루리웹</button>
          </div>
        </div>
      </div>
      <div class="news-card community-card">
        <div class="community-section-header">
          <span class="community-section-title">커뮤니티</span>
        </div>
        <div class="news-container">
          <div class="news-panel active" id="community-inven">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=inven.co.kr&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">인벤 핫이슈</span>
              <a href="https://hot.inven.co.kr/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${invenHTML}</div>
          </div>
          <div class="news-panel" id="community-arca">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=arca.live&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">아카라이브 베스트</span>
              <a href="https://arca.live/b/live" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${arcaHTML}</div>
          </div>
          <div class="news-panel" id="community-dcinside">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=dcinside.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">디시 실시간 베스트</span>
              <a href="https://gall.dcinside.com/board/lists?id=dcbest" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${dcHTML}</div>
          </div>
          <div class="news-panel" id="community-ruliweb">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=ruliweb.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹 게임 베스트</span>
              <a href="https://bbs.ruliweb.com/best/game?orderby=recommend&range=24h" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${ruliwebHTML}</div>
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 폰트 로딩
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }
    // twemoji
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }
    // 커뮤니티 탭 - 선택한 패널부터 순서대로 배치
    const communityTab = document.getElementById('communityTab');
    const communityTypes = ['inven', 'arca', 'dcinside', 'ruliweb'];
    communityTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const selectedType = btn.dataset.community;
      const selectedIndex = communityTypes.indexOf(selectedType);

      // 탭 버튼 active 토글
      communityTab.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === selectedIndex);
      });

      // 패널 active 토글 + order 설정 (선택한 패널부터 순서대로)
      communityTypes.forEach((type, i) => {
        const panel = document.getElementById('community-' + type);
        if (panel) {
          panel.classList.toggle('active', type === selectedType);
          panel.style.order = (i - selectedIndex + communityTypes.length) % communityTypes.length;
        }
      });
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
