const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * 모바일 상단 광고 (320x100) - Responsive001용
 */
function renderMobileTopAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-mobile-top">
  <ins class="adsbygoogle ad-mobile-only"
       style="display:inline-block;min-width:320px;height:100px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="horizontal"
       data-full-width-responsive="false"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</div>`;
}

/**
 * 모바일 중간 광고 (300x250) - Responsive002~005용
 */
function renderMobileMidAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-mobile-mid">
  <ins class="adsbygoogle ad-mobile-only"
       style="display:inline-block;width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="rectangle"
       data-full-width-responsive="false"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</div>`;
}

/**
 * 모바일 광고 (호환용) - renderMobileTopAd 사용
 */
function renderMobileAd(slotId) {
  return renderMobileTopAd(slotId);
}

/**
 * PC 홈 상단 광고 (728x90) - ResponsivePCHome001용
 */
function renderPCHomeAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-pc-home">
  <ins class="adsbygoogle ad-pc-only"
       style="display:inline-block;width:728px;height:90px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="horizontal"
       data-full-width-responsive="false"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</div>`;
}

/**
 * PC 상단 광고 (970x90) - ResponsivePC001~005용
 */
function renderPCAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-pc">
  <ins class="adsbygoogle ad-pc-only"
       style="display:inline-block;width:970px;height:90px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="horizontal"
       data-full-width-responsive="false"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</div>`;
}

/**
 * PC/모바일 쌍으로 렌더 (반응형 분리) - 상단용
 */
function renderResponsiveAdPair(mobileSlotId, pcSlotId) {
  return renderMobileTopAd(mobileSlotId) + renderPCAd(pcSlotId);
}

/**
 * Vertical 광고 (300x600) - PC 사이드바용
 */
function renderVerticalAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-vertical">
  <ins class="adsbygoogle ad-pc-only"
       style="display:inline-block;width:300px;height:600px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="vertical"
       data-full-width-responsive="false"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</div>`;
}

/**
 * Rectangle 광고 (300x250) - PC 사이드바용
 */
function renderRectangleAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-rectangle">
  <ins class="adsbygoogle ad-pc-only"
       style="display:inline-block;width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="rectangle"
       data-full-width-responsive="false"></ins>
  <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
</div>`;
}

/**
 * 기존 호환용 - renderAdCard
 * @deprecated 새 코드에서는 renderMobileAd, renderPCAd, renderResponsiveAdPair 사용
 */
function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const { type = 'mobile-200' } = options;

  if (type === 'vertical') {
    return renderVerticalAd(slotId);
  }
  if (type === 'rectangle') {
    return renderRectangleAd(slotId);
  }

  // mobile-200/400: 모바일 광고로 처리
  return renderMobileAd(slotId);
}

module.exports = {
  ADSENSE_CLIENT,
  renderAdCard,
  renderMobileAd,
  renderMobileTopAd,
  renderMobileMidAd,
  renderPCAd,
  renderPCHomeAd,
  renderResponsiveAdPair,
  renderVerticalAd,
  renderRectangleAd
};
