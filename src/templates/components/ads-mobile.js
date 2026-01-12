/**
 * 모바일 전용 광고 모듈
 * m.gamerscrawl.com에서 사용
 * PC/모바일 분기 없이 모바일 광고만 렌더링
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * 모바일 상단 광고 (320x150)
 */
function renderMobileTopAd(slotId) {
  if (!slotId) return '';
  // 인라인 push() 제거 - layout.js에서 safePush()로 일괄 초기화
  return `<div class="ad-card ad-card-mobile-top">
  <ins class="adsbygoogle"
       style="display:block;width:320px;height:150px;min-width:320px;min-height:150px;max-width:320px;max-height:150px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 모바일 중간 광고 (300x250)
 */
function renderMobileMidAd(slotId) {
  if (!slotId) return '';
  // 인라인 push() 제거 - layout.js에서 safePush()로 일괄 초기화
  return `<div class="ad-card ad-card-mobile-mid">
  <ins class="adsbygoogle"
       style="display:block;width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 기본 모바일 광고 (320x150)
 */
function renderMobileAd(slotId) {
  return renderMobileTopAd(slotId);
}

module.exports = {
  ADSENSE_CLIENT,
  renderMobileAd,
  renderMobileTopAd,
  renderMobileMidAd
};
