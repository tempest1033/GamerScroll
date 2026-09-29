// 상단 광고를 파서 단계에서 바로 요청한다 (게이머스크롤 src/templates/components/ad-request.js와 같은 방식 — 격리 규칙상 복사본).
// 광고 런타임(layout-core.js, defer)은 data-gs-ad-pushed="1"을 보고 같은 슬롯을 다시 요청하지 않는다.
const earlyTopAdScript = `<script>
(function() {
  if (window.__gsEarlyTopAdRequested || document.body.classList.contains('ads-disabled')) return;
  function isHidden(ad) {
    var node = ad;
    while (node && node !== document.body) {
      if (node.offsetParent === null) return true;
      var cs = window.getComputedStyle ? getComputedStyle(node) : null;
      if (cs && cs.display === 'none') return true;
      node = node.parentElement;
    }
    return false;
  }
  // 애드센스는 순서상 첫 번째 미처리 <ins>를 채운다. 다른 화면 폭용으로 숨겨진 슬롯은 먼저 치운다.
  var ads = document.querySelectorAll('.adsbygoogle');
  var ad = null;
  for (var i = 0; i < ads.length; i++) {
    if (isHidden(ads[i])) {
      if (!ads[i].getAttribute('data-gs-ad-pushed') && !ads[i].getAttribute('data-adsbygoogle-status') && ads[i].parentNode) {
        ads[i].parentNode.removeChild(ads[i]);
      }
    } else if (!ad) {
      ad = ads[i];
    }
  }
  if (!ad || !ad.closest('.ad-card-responsive-home, .ad-card-mobile-top')) return;
  if (ad.getAttribute('data-gs-ad-pushed') === '1' || ad.getBoundingClientRect().width <= 0) return;
  ad.setAttribute('data-gs-ad-pushed', '1');
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    window.__gsEarlyTopAdRequested = true;
    if (window.performance && performance.mark) performance.mark('gs-top-ad-request');
  } catch (e) {
    ad.removeAttribute('data-gs-ad-pushed');
  }
})();
</script>`;

module.exports = { earlyTopAdScript };
