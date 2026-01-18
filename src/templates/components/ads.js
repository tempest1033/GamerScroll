/**
 * PC 전용 광고 모듈
 * gamerscrawl.com (PC 버전)에서 사용
 * 모바일 광고는 ads-mobile.js 참조
 *
 * 최적화 전략:
 * - 상단 광고: 즉시 로드 (viewability 최대화)
 * - 사이드바 광고: Lazy Loading (IntersectionObserver)
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * PC 홈 상단 광고 (728x90)
 */
function renderPCHomeAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-pc-home">
  <ins class="adsbygoogle"
       style="display:block;width:728px;height:90px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * PC 상단 광고 (970x90)
 */
function renderPCAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-pc">
  <ins class="adsbygoogle"
       style="display:block;width:100%;height:90px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * Vertical 광고 (300x600) - PC 사이드바용
 */
function renderVerticalAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-vertical">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:600px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * Rectangle 광고 (300x250) - PC 사이드바용
 */
function renderRectangleAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-rectangle">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * @deprecated 호환용 - renderAdCard
 */
function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';
  const { type = 'pc' } = options;
  if (type === 'vertical') return renderVerticalAd(slotId);
  if (type === 'rectangle') return renderRectangleAd(slotId);
  return renderPCAd(slotId);
}

module.exports = {
  ADSENSE_CLIENT,
  renderAdCard,
  renderPCAd,
  renderPCHomeAd,
  renderVerticalAd,
  renderRectangleAd
};
