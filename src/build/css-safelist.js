// 런타임 상태와 빌드 후 생성되는 화면의 CSS 보존 계약.
module.exports = {
  standard: [
    'active', 'loaded', 'open', 'hidden', 'expanded', 'collapsed',
    'fonts-loaded', 'nav-ready', 'thumb-fallback', 'search-hidden',
    'feed-top-spacer', 'ad-card', 'ad-card-scroll', 'adsbygoogle',
    'ads-disabled', 'deferred-css-pending', 'realtime', 'rk',
  ],
  deep: [/^search-/, /^is-/, /^has-/, /^apexcharts-/, /^ad-/, /^rk-/],
  greedy: [/^gs-ad-/, /^rk-/],
  variables: [/^--font-/, /^--data-/, /^--line$/, /^--chip-bg$/, /^--fs-/, /^--fw-/],
};
