// 런타임 상태와 빌드 후 생성되는 화면의 CSS 보존 계약.
module.exports = {
  standard: [
    'active', 'loaded', 'open', 'hidden', 'expanded', 'collapsed',
    'fonts-loaded', 'nav-ready', 'thumb-fallback', 'search-hidden',
    'feed-top-spacer', 'ad-card', 'ad-card-scroll', 'adsbygoogle',
    'ads-disabled', 'deferred-css-pending', 'realtime', 'rk',
    // body class is built as `page-${currentPage}` for game pages (rendered on request), so the literal never appears in scanned sources
    'page-game',
  ],
  // rv-: revenue estimate section of the game pages (rendered on request, src/templates/components/revenue-section.js)
  deep: [/^search-/, /^is-/, /^has-/, /^apexcharts-/, /^ad-/, /^rk-/, /^rv-/],
  greedy: [/^gs-ad-/, /^rk-/, /^rv-/],
  variables: [/^--font-/, /^--data-/, /^--line$/, /^--chip-bg$/, /^--fs-/, /^--fw-/],
};
