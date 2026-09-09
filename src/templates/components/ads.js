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
 * Desktop: 970×250 고정 요청 (좁은 화면은 가용 폭×250), Mobile: 숨김
 */
function renderDesktopOnlyHomeAd(slotId, opts) {
  if (!ADS_ENABLED || !slotId) return '';
  const narrow = opts && opts.narrow;
  const styleId = `ad-home-pc-${++adStyleCounter}`;
  const cardClass = `${styleId}-card`;
  if (narrow) {
    // 좁은 컬럼(사이드바 레이아웃): 반응형 대신 표준 고정 규격을 브레이크포인트별로 지정한다.
    // 컬럼 폭이 723px라 반응형(horizontal)은 723×100 같은 비표준 크기를 요청했고,
    // 그 크기는 맞는 재고가 적어 unfilled가 잦았다.
    // 카드는 732px = 728 + 테두리 2px + 여유 2px. 애드센스는 고정 규격이라도 부모 콘텐츠 폭보다
    // 넓으면 그 폭으로 줄여 요청하므로(725×90 등), 확대/축소로 테두리가 소수점이 돼도 728이 남게 둔다.
    // ≥1200: 728×90 / 900~1199: 468×60 / 769~899: 320×100 — 모두 표준 규격.
    // .gs-ad-fixed: 05-ads.css의 반응형용 width:100% 강제 규칙에서 제외하는 표식.
    return `<div class="ad-card ad-card-responsive-home gs-ad-fixed ${cardClass}">
  <style>
    .${cardClass}, .${styleId} { display:none !important; }
    @media (min-width: 769px) {
      .${cardClass} { display:flex !important; width:100%; max-width:732px; min-height:90px; margin:0 auto; overflow:hidden; align-items:center; justify-content:center; }
      .${styleId} { display:block !important; width:320px; height:100px; margin:0 auto; }
    }
    @media (min-width: 900px) {
      .${styleId} { width:468px; height:60px; }
    }
    @media (min-width: 1200px) {
      .${styleId} { width:728px; height:90px; }
    }
  </style>
  <ins class="adsbygoogle gs-ad-fixed ${styleId}"
       style="display:inline-block"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
  }
  // 풀폭 페이지: horizontal 자동 크기 선택을 제거하고 970×250 빌보드를 요청한다.
  // CSS 높이만 250px로 두고 horizontal을 지정하면 실제 요청이 90px로 선택될 수 있다.
  // 좁은 PC 화면에서는 부모 폭 안에 맞추되 높이 250px는 유지한다. 모바일·narrow 슬롯은 별도 규격을 유지한다.
  return `<div class="ad-card ad-card-responsive-home gs-ad-fixed ${cardClass}">
  <style>
    .${cardClass}, .${styleId} { display:none !important; }
    @media (min-width: 769px) {
      .${cardClass} { display:flex !important; width:100%; max-width:970px; height:250px; min-height:250px; max-height:250px; margin:0 auto; border:0; border-radius:0; background:transparent; overflow:visible; align-items:center; justify-content:center; }
      .${styleId} { display:block !important; width:970px; max-width:100%; height:250px; min-height:250px; margin:0 auto; }
    }
  </style>
  <ins class="adsbygoogle gs-ad-fixed ${styleId}"
       style="display:inline-block"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 모바일 전용 홈 상단 광고
 * Mobile: 300x250, Desktop: 숨김
 * 2026-09-09: 320×100 → 300×250 (재고가 가장 많은 규격). 함께 바꿀 곳: 05-ads.css .ad-card-mobile-top, layout.js normalizeAdVisualSize.
 */
function renderMobileOnlyHomeAd(slotId) {
  if (!ADS_ENABLED || !slotId) return '';
  const styleId = `ad-home-mo-${++adStyleCounter}`;
  const cardClass = `${styleId}-card`;
  return `<div class="ad-card ad-card-mobile-top ${cardClass}">
  <style>
    .${cardClass} { display:flex !important; width:100% !important; max-width:300px !important; height:250px !important; min-height:250px !important; max-height:250px !important; align-items:center; justify-content:center; margin-left:auto !important; margin-right:auto !important; overflow:hidden; }
    .${styleId}, .${cardClass} > .${styleId}, .${cardClass} > .${styleId} > div, .${cardClass} > .${styleId} iframe { display:block !important; width:100% !important; max-width:300px !important; height:250px !important; min-height:250px !important; max-height:250px !important; margin:0 auto; }
    .${cardClass} > .${styleId} > div { overflow:hidden !important; }
    @media (min-width: 769px) {
      .${cardClass}, .${styleId}, .${cardClass} > .${styleId} > div, .${cardClass} > .${styleId} iframe { display:none !important; width:0 !important; max-width:0 !important; height:0 !important; min-height:0 !important; max-height:0 !important; margin:0 !important; }
    }
  </style>
  <ins class="adsbygoogle ${styleId}"
       style="display:block;width:100%;max-width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
</div>`;
}

/**
 * 홈/상단 광고 페어
 * PC는 970×250 (좁은 화면은 가용 폭×250), 모바일은 300x250 슬롯으로 분리
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
