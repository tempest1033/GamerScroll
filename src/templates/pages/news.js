/**
 * 주요 뉴스 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS } = require('../layout');

function generateNewsPage(data) {
  const { news } = data;

  // 뉴스 아이템 생성
  function generateNewsItems(items, sourceName) {
    if (!items || items.length === 0) {
      return '<div class="no-data">뉴스를 불러올 수 없습니다</div>';
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

  const invenNewsHTML = generateNewsItems(news?.inven, '인벤');
  const thisisgameNewsHTML = generateNewsItems(news?.thisisgame, '디스이즈게임');
  const gamemecaNewsHTML = generateNewsItems(news?.gamemeca, '게임메카');
  const ruliwebNewsHTML = generateNewsItems(news?.ruliweb, '루리웹');

  const content = `
    <section class="section active" id="news">
      ${SHOW_ADS ? `<div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
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
          <div class="news-panel active" id="news-inven">
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
              <a href="https://www.thisisgame.com/webzine/news/nboard/4/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${thisisgameNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-gamemeca">
            <div class="news-panel-header">
              <img src="https://www.google.com/s2/favicons?domain=gamemeca.com&sz=32" alt="" class="news-favicon">
              <span class="news-panel-title">게임메카</span>
              <a href="https://www.gamemeca.com/news.php" target="_blank" class="news-more-link">더보기 →</a>
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
    // 뉴스 탭 - 선택한 패널부터 순서대로 배치
    const newsTab = document.getElementById('newsTab');
    const newsTypes = ['inven', 'thisisgame', 'gamemeca', 'ruliweb'];
    newsTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const selectedType = btn.dataset.news;
      const selectedIndex = newsTypes.indexOf(selectedType);

      // 탭 버튼 active 토글
      newsTab.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === selectedIndex);
      });

      // 패널 active 토글 + order 설정 (선택한 패널부터 순서대로)
      newsTypes.forEach((type, i) => {
        const panel = document.getElementById('news-' + type);
        if (panel) {
          panel.classList.toggle('active', type === selectedType);
          panel.style.order = (i - selectedIndex + newsTypes.length) % newsTypes.length;
        }
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'news',
    title: '게이머스크롤 | 주요 뉴스',
    description: '인벤, 디스이즈게임, 게임메카, 루리웹의 최신 게임 뉴스',
    canonical: 'https://gamerscrawl.com/news.html',
    pageScripts
  });
}

module.exports = { generateNewsPage };
