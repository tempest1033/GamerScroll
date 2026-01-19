/**
 * 모바일 전용 광고 모듈
 * m.gamerscrawl.com에서 사용
 * PC/모바일 분기 없이 모바일 광고만 렌더링
 *
 * 로딩 전략: Intersection Observer 방식
 * - 광고가 뷰포트에 가까워지면 로드 (layout.js에서 Observer 처리)
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * 모바일 상단 광고 (320x100) - Large Mobile Banner
 */
function renderMobileTopAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-mobile-top">
  <ins class="adsbygoogle"
       style="display:block;width:100%;min-height:200px;max-height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 모바일 중간 광고 (300x250)
 */
function renderMobileMidAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-mobile-mid">
  <ins class="adsbygoogle"
       style="display:block;width:100%;min-height:200px;max-height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 기본 모바일 광고 (300x100)
 */
function renderMobileAd(slotId) {
  return renderMobileTopAd(slotId);
}

/**
 * In-feed 네이티브 광고
 */
function renderNativeAd(slotId) {
  if (!slotId) return '';
  return `<div class="ad-card ad-card-native">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-format="fluid"
       data-ad-layout-key="-7m+ex-1f-2m+ae"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

module.exports = {
  ADSENSE_CLIENT,
  renderMobileAd,
  renderMobileTopAd,
  renderMobileMidAd,
  renderNativeAd
};
