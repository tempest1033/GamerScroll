/**
 * 네비게이션 컴포넌트
 */

// 순위 데이터 사이트 내비: 모바일 · 지표 분석 · 트렌딩 · 스팀 · 게임 DB. 홈(/)은 로고로 간다.
// 지표 분석(/analysis/)은 별도 Worker가 모든 에디션 경로로 내려주는 페이지다.
const { t: tt } = require('../../i18n');
const navItems = [
  { id: 'rankings', label: tt('nav.mobile'), href: '/rankings/' },
  { id: 'analysis', label: tt('nav.metrics'), href: '/analysis/' },
  { id: 'trending', label: tt('nav.trending'), href: '/trending/' },
  { id: 'steam', label: tt('layout.steam'), href: '/steam/' },
  { id: 'games', label: tt('layout.game_db'), href: '/games/' }
];
// 페이지 ID → 내비 항목 (게임 상세는 게임 DB를 활성화. 홈은 활성 항목 없음)
const NAV_ALIAS = { game: 'games' };
const navIdOf = (currentPage) => NAV_ALIAS[currentPage] || currentPage;

function generateNav(currentPage = 'home') {
  const activeId = navIdOf(currentPage);
  // 현재 페이지 인덱스 계산
  const currentIdx = navItems.findIndex(item => item.id === activeId);

  return `
  <nav class="nav">
    <div class="nav-inner">
      ${navItems.map(item => `
      <a class="nav-item${item.id === activeId ? ' active' : ''}" href="${item.href}">${item.label}</a>`).join('')}
    </div>
  </nav>
  <script>
  (function(){
    if(window.innerWidth>768)return;
    var n=document.querySelector('.nav-inner');
    if(!n)return;
    // 스와이프로 온 경우 저장된 scrollLeft 즉시 복원
    try{
      var saved=sessionStorage.getItem('gs-nav-scroll');
      if(saved!==null){
        n.scrollLeft=parseInt(saved,10);
        sessionStorage.removeItem('gs-nav-scroll');
        n.classList.add('nav-ready');
        return;
      }
    }catch(e){}
    function init(r){
      // 측정을 한 번에 모아서
      var cw=n.clientWidth,sw=n.scrollWidth;
      if(cw<=0){if(!r)requestAnimationFrame(function(){init(1);});return;}
      if(sw<=cw+1){n.classList.add('nav-ready');return;}
      var idx=${currentIdx};
      var items=n.querySelectorAll('.nav-item');
      var t=idx<0?items[0]:items[idx];
      if(t){
        var left=t.offsetLeft,tw=t.offsetWidth;
        n.scrollLeft=Math.max(0,left+tw/2-cw/2);
      }
      n.classList.add('nav-ready');
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
    else init();
  })();
  </script>`;
}

module.exports = { generateNav, navItems, navIdOf };
