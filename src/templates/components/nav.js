/**
 * 네비게이션 컴포넌트
 */

const navItems = [
  {
    id: 'magazine',
    label: '매거진',
    href: '/magazine/',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>'
  },
  {
    id: 'wiki',
    label: '게임 위키',
    href: '/wiki/',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
  },
  {
    id: 'tech',
    label: '테크',
    href: '/tech/',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
  },
  {
    id: 'games',
    label: '게임 DB',
    href: '/games/',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
  },
  {
    id: 'rankings',
    label: '모바일 순위',
    href: '/rankings/',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>'
  },
  {
    id: 'steam',
    label: '스팀 순위',
    href: '/steam/',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h.01M18 12h.01"/><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 6v12"/></svg>'
  },
  {
    id: 'upcoming',
    label: '출시 게임',
    href: '/upcoming/',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  }
];

function generateNav(currentPage = 'home') {
  // 현재 페이지 인덱스 계산
  const currentIdx = navItems.findIndex(item => item.id === currentPage);

  return `
  <nav class="nav">
    <div class="nav-inner">
      ${navItems.map(item => `
      <a class="nav-item${item.id === currentPage ? ' active' : ''}" href="${item.href}">
        ${item.icon}
        ${item.label}
      </a>`).join('')}
    </div>
  </nav>
  <script>
  (function(){
    if(window.innerWidth>768)return;
    function init(r){
      var n=document.querySelector('.nav-inner');
      if(!n)return;
      // 측정을 한 번에 모아서
      var cw=n.clientWidth,sw=n.scrollWidth;
      if(cw<=0){if(!r)requestAnimationFrame(function(){init(1);});return;}
      if(sw<=cw+1){n.classList.add('nav-ready');return;}
      var idx=${currentIdx};
      var items=n.querySelectorAll('.nav-item');
      var t=idx<0?items[0]:items[idx];
      if(t){
        var left=t.offsetLeft,tw=t.offsetWidth;
        // 변경은 나중에
        n.scrollLeft=Math.max(0,left+tw/2-cw/2);
      }
      n.classList.add('nav-ready');
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
    else init();
  })();
  </script>`;
}

module.exports = { generateNav, navItems };
