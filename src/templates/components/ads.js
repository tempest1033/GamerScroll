/**
 * 통합 반응형 광고 모듈
 * PC/모바일 단일 빌드용 - CSS 미디어 쿼리로 크기 분기
 *
 * Google AdSense 공식 가이드 준수:
 * - CSS 미디어 쿼리로 광고 크기 지정 (허용)
 * - 미디어 쿼리 내 display:none (허용)
 * - data-ad-format="auto" 제거 (수동 크기 지정 시)
 *
 * Breakpoints:
 * - Mobile: max-width 768px
 * - Tablet: 769px ~ 1199px
 * - Desktop: min-width 1200px (사이드바 표시)
 *
 * 로딩 전략: Intersection Observer (layout.js에서 처리)
 * 광고 ON/OFF: ADS_ENABLED=false 로 전체 비활성화
 */

const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';
const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

// 고유 ID 생성용 카운터
let adStyleCounter = 0;

function renderEagerAdPushScript() {
  return `<script>(function(){var s=document.currentScript;var i=s&&s.previousElementSibling;if(!i||!i.classList||!i.classList.contains('adsbygoogle'))return;if(window.getComputedStyle&&getComputedStyle(i).display==='none')return;if(i.getAttribute('data-gs-ad-pushed')==='1')return;i.setAttribute('data-gs-ad-pushed','1');try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){i.removeAttribute('data-gs-ad-pushed');}})();</script>`;
}

/**
 * 반응형 상단 광고
 * AdSense auto-sizing: 컴테이너 폭에 맞는 표준 사이즈 자동 매칭
 * (CLS 방지는 .ad-card-responsive-top { min-height } 에서 보장)
 */
function renderResponsiveTopAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-responsive-top">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  ${renderEagerAdPushScript()}
</div>`;
}

/**
 * 반응형 홈 상단 광고
 * AdSense auto-sizing: 컴테이너 폭에 맞는 표준 사이즈 자동 매칭
 * (CLS 방지는 .ad-card-responsive-home { min-height } 에서 보장)
 */
function renderResponsiveHomeAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-responsive-home">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  ${renderEagerAdPushScript()}
</div>`;
}

/**
 * 모바일 전용 홈 상단 광고
 * Mobile: 320x100, Desktop: 숨김
 */
function renderMobileOnlyHomeAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  const styleId = `ad-home-mo-${++adStyleCounter}`;
  return `<div class="ad-card ad-card-responsive-home">
  <style>
    .${styleId} { display:block; width:320px; height:100px; min-height:100px; margin:0 auto; }
    @media (min-width: 769px) { .${styleId} { display:none; } }
  </style>
  <ins class="adsbygoogle ${styleId}"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  ${renderEagerAdPushScript()}
</div>`;
}

/**
 * 사이드바 세로 광고 (PC only)
 * Desktop: 300x600, Mobile/Tablet: 숨김
 */
function renderSidebarVerticalAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  const styleId = `ad-sidebar-v-${++adStyleCounter}`;
  return `<div class="ad-card ad-card-sidebar-vertical">
  <style>
    .${styleId} { display:none; }
    @media (min-width: 1200px) { .${styleId} { display:inline-block; width:300px; height:600px; } }
  </style>
  <ins class="adsbygoogle ${styleId}"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 사이드바 정사각 광고 (PC only)
 * Desktop: 300x250, Mobile/Tablet: 숨김
 */
function renderSidebarRectangleAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  const styleId = `ad-sidebar-r-${++adStyleCounter}`;
  return `<div class="ad-card ad-card-sidebar-rectangle">
  <style>
    .${styleId} { display:none; }
    @media (min-width: 1200px) { .${styleId} { display:inline-block; width:300px; height:250px; } }
  </style>
  <ins class="adsbygoogle ${styleId}"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 콘텐츠 중간 광고 (모바일 전용 표시, PC에서는 숨김)
 * Mobile: 300x250, Desktop: 숨김
 */
function renderMobileOnlyAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  const styleId = `ad-mobile-only-${++adStyleCounter}`;
  return `<div class="ad-card ad-card-mobile-only">
  <style>
    .${styleId} { display:block; width:300px; height:250px; margin:0 auto; }
    @media (min-width: 1200px) { .${styleId} { display:none; } }
  </style>
  <ins class="adsbygoogle ${styleId}"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 콘텐츠 중간 광고 (항상 표시)
 * Mobile/Desktop: 300x250
 */
function renderContentAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-content">
  <ins class="adsbygoogle"
       style="display:block;width:300px;height:250px;margin:0 auto"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * In-feed 네이티브 광고 (자동 반응형)
 */
function renderNativeAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-native">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-format="fluid"
       data-ad-layout-key="-7m+ex-1f-2m+ae"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
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

// ============================================================
// 하위 호환용 별칭 (기존 코드 호환)
// ============================================================

/** @deprecated renderResponsiveTopAd 사용 권장 */
function renderPCAd(slotId) {
  return renderResponsiveTopAd(slotId);
}

/** @deprecated renderResponsiveHomeAd 사용 권장 */
function renderPCHomeAd(slotId) {
  return renderResponsiveHomeAd(slotId);
}

/** @deprecated renderSidebarVerticalAd 사용 권장 */
function renderVerticalAd(slotId) {
  return renderSidebarVerticalAd(slotId);
}

/** @deprecated renderSidebarRectangleAd 사용 권장 */
function renderRectangleAd(slotId) {
  return renderSidebarRectangleAd(slotId);
}

/** @deprecated renderMobileOnlyAd 사용 권장 */
function renderMobileAd(slotId) {
  return renderMobileOnlyAd(slotId);
}

/** @deprecated renderMobileOnlyAd 사용 권장 */
function renderMobileTopAd(slotId) {
  return renderMobileOnlyAd(slotId);
}

/** @deprecated renderContentAd 사용 권장 */
function renderMobileMidAd(slotId) {
  return renderContentAd(slotId);
}

/** @deprecated 호환용 */
function renderAdCard(slotId, options = {}) {
  if (!ADS_ENABLED || !slotId) return '';
  const { type = 'pc' } = options;
  if (type === 'vertical') return renderSidebarVerticalAd(slotId);
  if (type === 'rectangle') return renderSidebarRectangleAd(slotId);
  return renderResponsiveTopAd(slotId);
}

module.exports = {
  ADSENSE_CLIENT,
  // 신규 반응형 함수
  renderResponsiveTopAd,
  renderResponsiveHomeAd,
  renderMobileOnlyHomeAd,
  renderSidebarVerticalAd,
  renderSidebarRectangleAd,
  renderMobileOnlyAd,
  renderContentAd,
  renderNativeAd,
  renderMultiplexAd,
  // 하위 호환 별칭 (deprecated)
  renderAdCard,
  renderPCAd,
  renderPCHomeAd,
  renderVerticalAd,
  renderRectangleAd,
  renderMobileAd,
  renderMobileTopAd,
  renderMobileMidAd
};
