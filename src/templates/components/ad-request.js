// Shared request guards for parser-time top ads and the deferred ad runtime.
const adRequestBootstrap = `
(function() {
  if (window.__gsAdRequests) return;
  function isHidden(ad) {
    if (!ad) return true;
    var node = ad;
    while (node && node !== document.body) {
      if (node.offsetParent === null) return true;
      var cs = window.getComputedStyle ? getComputedStyle(node) : null;
      if (cs && cs.display === 'none') return true;
      node = node.parentElement;
    }
    return false;
  }
  function visibleAds(ads) {
    var visible = [];
    for (var i = 0; i < ads.length; i++) {
      var ad = ads[i];
      if (isHidden(ad)) {
        // AdSense consumes the first unprocessed ins in DOM order, even if hidden.
        if (!ad.getAttribute('data-gs-ad-pushed') &&
            !ad.getAttribute('data-adsbygoogle-status') && ad.parentNode) {
          ad.parentNode.removeChild(ad);
        }
      } else {
        visible.push(ad);
      }
    }
    return visible;
  }
  function push(ad) {
    if (!ad || document.body.classList.contains('ads-disabled')) return false;
    if (ad.getAttribute('data-gs-ad-pushed') === '1') return true;
    if (ad.getAttribute('data-adsbygoogle-status') || ad.getAttribute('data-ad-status')) {
      ad.setAttribute('data-gs-ad-pushed', '1');
      return true;
    }
    if (isHidden(ad)) return false;
    var rect = ad.getBoundingClientRect();
    if (rect.width <= 0) return false;
    ad.setAttribute('data-gs-ad-pushed', '1');
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      return true;
    } catch (e) {
      ad.removeAttribute('data-gs-ad-pushed');
      return false;
    }
  }
  window.__gsAdRequests = { isHidden: isHidden, visibleAds: visibleAds, push: push };
})();`;

const earlyTopAdScript = `<script>
${adRequestBootstrap}
(function() {
  if (window.__gsEarlyTopAdRequested || document.body.classList.contains('ads-disabled')) return;
  var ads = window.__gsAdRequests.visibleAds(document.querySelectorAll('.adsbygoogle'));
  var ad = ads[0];
  if (!ad || !ad.closest('.ad-card-responsive-home, .ad-card-mobile-top')) return;
  if (window.__gsAdRequests.push(ad)) {
    window.__gsEarlyTopAdRequested = true;
    if (window.performance && performance.mark) performance.mark('gs-top-ad-request');
  }
})();
</script>`;

module.exports = { adRequestBootstrap, earlyTopAdScript };
