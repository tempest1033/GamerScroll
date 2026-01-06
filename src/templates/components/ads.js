/**
 * 광고(AdSense) 공통 헬퍼
 * - 마크업 생성만 담당 (초기화/스크립트 로드는 layout/head에서 처리)
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

// AdSense 표준 프리셋 (style/data-ad-format/fullWidthResponsive)
// - wrapperClass(pc-only/mobile-only 등)는 호출부에서 결정
const AD_PRESETS = {
  // PC 가로형 - width 100%, height 90px 고정
  horizontalPc: {
    style: 'display:block;width:100%;height:90px'
  },
  horizontalPcLong: {
    style: 'display:block;width:100%;height:90px'
  },
  // 모바일 가로형 - width 100%, height 100px 고정
  horizontalMobile: {
    style: 'display:block;width:100%;height:100px'
  },
  // PC 사각형 - width 100%, height 300px 고정
  rectanglePc: {
    style: 'display:block;width:100%;height:300px'
  },
  // 모바일 사각형 - 반응형 풀
  rectangleMobile: {
    style: 'display:block',
    format: 'auto',
    fullWidthResponsive: true
  },
  // PC 버티컬 - width 100%, height 600px 고정
  verticalPc: {
    style: 'display:block;width:100%;height:600px'
  },
  // 자동 반응형 - 풀
  autoResponsive: {
    style: 'display:block',
    format: 'auto',
    fullWidthResponsive: true
  }
};

function buildInsAttributes({ slotId, style, format, fullWidthResponsive, className }) {
  const classes = String(className || 'adsbygoogle').trim() || 'adsbygoogle';
  const placeholderClasses = buildPlaceholderClassName(classes);
  const safeStyle = style || 'display:block';
  const attrs = [
    `class="${placeholderClasses}"`,
    `style="${safeStyle}"`,
    `data-gc-ad-client="${ADSENSE_CLIENT}"`,
    `data-gc-ad-slot="${slotId}"`,
    `data-gc-ins-class="${classes}"`
  ];
  if (format) attrs.push(`data-gc-ad-format="${format}"`);
  if (fullWidthResponsive) attrs.push(`data-gc-full-width-responsive="true"`);
  return attrs.join(' ');
}

function buildPlaceholderClassName(className) {
  const tokens = String(className || '').split(/\s+/).filter(Boolean);
  const out = ['gc-ads-placeholder'];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'adsbygoogle' || token === 'gc-ads-placeholder') continue;
    out.push(token);
  }
  return out.join(' ');
}

function renderAdIns({ slotId, style, format, fullWidthResponsive = false, className = 'adsbygoogle' }) {
  if (!slotId) return '';
  const attrs = buildInsAttributes({ slotId, style, format, fullWidthResponsive, className });
  return `<ins ${attrs}></ins>`;
}

function renderAdSlot({ id = '', wrapperClass = '', slotId, style, format, fullWidthResponsive = false, insClassName = 'adsbygoogle' }) {
  if (!slotId) return '';
  const classes = ['ad-slot', wrapperClass].filter(Boolean).join(' ');
  const idAttr = id ? ` id="${id}"` : '';
  return `<div class="${classes}"${idAttr}>${renderAdIns({ slotId, style, format, fullWidthResponsive, className: insClassName })}</div>`;
}

module.exports = { ADSENSE_CLIENT, AD_PRESETS, renderAdIns, renderAdSlot };
