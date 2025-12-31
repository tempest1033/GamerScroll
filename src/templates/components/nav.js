/**
 * 네비게이션 컴포넌트
 */

const navItems = [
  {
    id: 'trend',
    label: '트렌드 리포트',
    href: '/trend',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>'
  },
  {
    id: 'games',
    label: '게임 DB',
    href: '/games',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
  },
  {
    id: 'rankings',
    label: '모바일 순위',
    href: '/rankings',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>'
  },
  {
    id: 'news',
    label: '주요 뉴스',
    href: '/news',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>'
  },
  {
    id: 'youtube',
    label: '영상 순위',
    href: '/youtube',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
  },
  {
    id: 'steam',
    label: '스팀 순위',
    href: '/steam',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h.01M18 12h.01"/><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 6v12"/></svg>'
  },
  {
    id: 'upcoming',
    label: '출시 게임',
    href: '/upcoming',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  },
  {
    id: 'metacritic',
    label: '메타크리틱',
    href: '/metacritic',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
  }
];

function generateNav(currentPage = 'home') {
  return `
  <nav class="nav">
    <div class="nav-inner">
      ${navItems.map(item => `
      <a class="nav-item${item.id === currentPage ? ' active' : ''}" href="${item.href}">
        ${item.icon}
        ${item.label}
      </a>`).join('')}
    </div>
  </nav>`;
}

module.exports = { generateNav, navItems };
