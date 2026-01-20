/**
 * PC 전용 광고 모듈
 * gamerscrawl.com (PC 버전)에서 사용
 * 모바일 광고는 ads-mobile.js 참조
 *
 * 로딩 전략: Intersection Observer 방식
 * - 광고가 뷰포트에 가까워지면 로드 (layout.js에서 Observer 처리)
 *
 * 광고 ON/OFF: 환경변수 ADS_ENABLED=false 로 전체 비활성화
 */

const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';
const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * PC 홈 상단 광고 (728x90)
 */
function renderPCHomeAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-pc-home">
  <ins class="adsbygoogle"
       style="display:block;width:728px;height:90px;margin:0 auto"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * PC 상단 광고 (970x90)
 */
function renderPCAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-pc">
  <ins class="adsbygoogle"
       style="display:block;width:100%;height:90px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * Vertical 광고 (300x600) - PC 사이드바용
 */
function renderVerticalAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-vertical">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:600px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * Rectangle 광고 (300x250) - PC 사이드바용
 */
function renderRectangleAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-rectangle">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * @deprecated 호환용 - renderAdCard
 */
function renderAdCard(slotId, options = {}) {
  if (!ADS_ENABLED || !slotId) return '';
  const { type = 'pc' } = options;
  if (type === 'vertical') return renderVerticalAd(slotId);
  if (type === 'rectangle') return renderRectangleAd(slotId);
  return renderPCAd(slotId);
}

/**
 * Multiplex 광고 (자동 반응형)
 */
function renderMultiplexAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-multiplex">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="autorelaxed"></ins>
</div>`;
}

module.exports = {
  ADSENSE_CLIENT,
  renderAdCard,
  renderPCAd,
  renderPCHomeAd,
  renderVerticalAd,
  renderRectangleAd,
  renderMultiplexAd
};
