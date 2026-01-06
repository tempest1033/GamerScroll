/**
 * 광고(AdSense) 공통 헬퍼
 * - 마크업 생성만 담당 (초기화/스크립트 로드는 layout/head에서 처리)
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

// AdSense 표준 프리셋 (style/data-ad-format/fullWidthResponsive)
// - wrapperClass(pc-only/mobile-only 등)는 호출부에서 결정
const AD_PRESETS = {
  horizontalPc: {
    style: 'display:inline-block;width:728px;height:90px'
  },
  horizontalPcLong: {
    style: 'display:inline-block;width:970px;height:90px'
  },
  horizontalMobile: {
    style: 'display:inline-block;width:320px;height:100px'
  },
  rectanglePc: {
    style: 'display:inline-block;width:300px;height:250px'
  },
  rectangleMobile: {
    style: 'display:block;width:100%',
    format: 'auto',
    fullWidthResponsive: true
  },
  verticalPc: {
    style: 'display:inline-block;width:300px;height:600px'
  },
  autoResponsive: {
    style: 'display:block;width:100%',
    format: 'auto',
    fullWidthResponsive: true
  }
};

function buildInsAttributes({ slotId, style, format, fullWidthResponsive, className }) {
  const classes = className || 'adsbygoogle';
  const safeStyle = style || 'display:block';
  const attrs = [
    `class="${classes}"`,
    `style="${safeStyle}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];
  if (format) attrs.push(`data-ad-format="${format}"`);
  if (fullWidthResponsive) attrs.push(`data-full-width-responsive="true"`);
  return attrs.join(' ');
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
