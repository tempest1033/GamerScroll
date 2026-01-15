/**
 * 모바일 전용 광고 모듈
 * m.gamerscrawl.com에서 사용
 * PC/모바일 분기 없이 모바일 광고만 렌더링
 *
 * Google AdSense 공식 방식: 슬롯 + 즉시 push
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * 모바일 상단 광고 (320x100) - Large Mobile Banner
 */
function renderMobileTopAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-mobile-top">
  <ins class="adsbygoogle"
       style="display:inline-block;min-width:320px;min-height:100px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * 모바일 중간 광고 (300x250)
 */
function renderMobileMidAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-mobile-mid">
  <ins class="adsbygoogle"
       style="display:inline-block;max-width:300px;width:100%;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * 기본 모바일 광고 (300x100)
 */
function renderMobileAd(slotId) {
  return renderMobileTopAd(slotId);
}

/**
 * In-article 광고 (기사 내 광고)
 */
function renderNativeAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-native">
  <ins class="adsbygoogle"
       style="display:block;text-align:center"
       data-ad-layout="in-article"
       data-ad-format="fluid"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

module.exports = {
  ADSENSE_CLIENT,
  renderMobileAd,
  renderMobileTopAd,
  renderMobileMidAd,
  renderNativeAd
};
