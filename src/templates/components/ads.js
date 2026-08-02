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


/**
 * 반응형 상단 광고
 * AdSense auto-sizing: 컴테이너 폭에 맞는 표준 사이즈 자동 매칭
 * (CLS 방지는 .ad-card-responsive-top { min-height } 에서 보장)
 */
function renderResponsiveTopAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  return `<div class="ad-card ad-card-responsive-top">
  <ins class="adsbygoogle"
       style="display:block;width:100%"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="horizontal"
       data-full-width-responsive="true"></ins>
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
       style="display:block;width:100%"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="horizontal"
       data-full-width-responsive="true"></ins>
</div>`;
}

/**
 * PC 전용 홈/상단 광고
 * Desktop: full-width responsive slot, Mobile: 숨김
 */
function renderDesktopOnlyHomeAd(slotId, opts) {
  if (!ADS_ENABLED || !slotId) return '';
  const narrow = opts && opts.narrow;
  const styleId = `ad-home-pc-${++adStyleCounter}`;
  const cardClass = `${styleId}-card`;
  if (narrow) {
    // 좁은 컬럼(사이드바 레이아웃): 부모 폭 안에서 최대 728 리더보드까지만 사용
    return `<div class="ad-card ad-card-responsive-home ${cardClass}">
  <style>
    .${cardClass}, .${styleId} { display:none !important; }
    @media (min-width: 769px) {
      .${cardClass} { display:flex !important; width:100%; max-width:728px; min-height:90px; margin:0 auto; overflow:hidden; align-items:center; justify-content:center; }
      .${styleId} { display:block !important; width:100%; max-width:100%; min-height:90px; margin:0 auto; }
    }
  </style>
  <ins class="adsbygoogle ${styleId}"
       style="display:block;width:100%;min-height:90px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="horizontal"
       data-full-width-responsive="true"></ins>
</div>`;
  }
  // 풀폭 페이지(사이드바 없음): 최대 970 반응형
  return `<div class="ad-card ad-card-responsive-home ${cardClass}">
  <style>
    .${cardClass}, .${styleId} { display:none !important; }
    @media (min-width: 769px) {
      .${cardClass} { display:flex !important; width:100%; max-width:970px; min-height:90px; margin:0 auto; overflow:hidden; align-items:center; justify-content:center; }
      .${styleId} { display:block !important; width:100%; min-height:90px; margin:0 auto; }
    }
  </style>
  <ins class="adsbygoogle ${styleId}"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"
       data-ad-format="horizontal"
       data-full-width-responsive="true"></ins>
</div>`;
}

/**
 * 모바일 전용 홈 상단 광고
 * Mobile: 320x100, Desktop: 숨김
 */
function renderMobileOnlyHomeAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  const styleId = `ad-home-mo-${++adStyleCounter}`;
  const cardClass = `${styleId}-card`;
  return `<div class="ad-card ad-card-mobile-top ${cardClass}">
  <style>
    .${cardClass} { display:flex !important; width:100% !important; max-width:320px !important; height:100px !important; min-height:100px !important; max-height:100px !important; align-items:center; justify-content:center; margin-left:auto !important; margin-right:auto !important; overflow:hidden; }
    .${styleId}, .${cardClass} > .${styleId}, .${cardClass} > .${styleId} > div, .${cardClass} > .${styleId} iframe { display:block !important; width:100% !important; max-width:320px !important; height:100px !important; min-height:100px !important; max-height:100px !important; margin:0 auto; }
    .${cardClass} > .${styleId} > div { overflow:hidden !important; }
    @media (min-width: 769px) {
      .${cardClass}, .${styleId}, .${cardClass} > .${styleId} > div, .${cardClass} > .${styleId} iframe { display:none !important; width:0 !important; max-width:0 !important; height:0 !important; min-height:0 !important; max-height:0 !important; margin:0 !important; }
    }
  </style>
  <ins class="adsbygoogle ${styleId}"
       style="display:block;width:100%;max-width:320px;height:100px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 홈/상단 광고 페어
 * PC는 auto-responsive, 모바일은 320x100 고정 슬롯으로 분리
 */
function renderHomeAdPair(pcSlotId, mobileSlotId, opts) {
  if (!ADS_ENABLED) return '';
  return [
    renderDesktopOnlyHomeAd(pcSlotId, opts),
    renderMobileOnlyHomeAd(mobileSlotId || pcSlotId)
  ].filter(Boolean).join('\n');
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
  renderDesktopOnlyHomeAd,
  renderMobileOnlyHomeAd,
  renderHomeAdPair,
  renderSidebarVerticalAd,
  renderSidebarRectangleAd,
  renderMobileOnlyAd,
  renderContentAd,
  renderNativeAd,
  renderMultiplexAd,
  // 하위 호환 별칭 (deprecated — layout.generateAdSlot 경유로만 사용)
  renderAdCard
};
