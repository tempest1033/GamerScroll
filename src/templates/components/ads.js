/**
 * 광고(AdSense) 공통 헬퍼
 * - 구글 권장 표준 방식으로 마크업 생성
 * - 각 광고 슬롯 바로 뒤에 push 스크립트 포함
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

// AdSense 표준 프리셋
const AD_PRESETS = {
  // PC 가로형 - 728x90
  horizontalPc: {
    style: 'display:block;width:100%;height:90px'
  },
  horizontalPcLong: {
    style: 'display:block;width:100%;height:90px'
  },
  // 모바일 가로형 - width 100%, height 100px
  horizontalMobile: {
    style: 'display:block;width:100%;height:100px',
    format: 'auto',
    fullWidthResponsive: true
  },
  // PC 사각형 - 300x250
  rectanglePc: {
    style: 'display:block;width:300px;height:250px'
  },
  // 모바일 사각형 - 반응형
  rectangleMobile: {
    style: 'display:block',
    format: 'auto',
    fullWidthResponsive: true
  },
  // PC 버티컬 - 300x600
  verticalPc: {
    style: 'display:block;width:300px;height:600px'
  },
  // 자동 반응형
  autoResponsive: {
    style: 'display:block',
    format: 'auto',
    fullWidthResponsive: true
  }
};

/**
 * 광고 <ins> 요소 + push 스크립트 생성 (구글 권장 방식)
 */
function renderAdIns({ slotId, style, format, fullWidthResponsive = false }) {
  if (!slotId) return '';

  const safeStyle = style || 'display:block';
  const attrs = [
    'class="adsbygoogle"',
    `style="${safeStyle}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  if (format) attrs.push(`data-ad-format="${format}"`);
  if (fullWidthResponsive) attrs.push('data-full-width-responsive="true"');

  // 구글 권장: 각 광고 바로 뒤에 push 스크립트
  return `<ins ${attrs.join(' ')}></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`;
}

/**
 * 광고 슬롯 래퍼 + ins + push 스크립트 생성
 * @param {boolean} collapse - true면 unfilled 시 접힘 (3,4,5번 광고용)
 */
function renderAdSlot({ id = '', wrapperClass = '', slotId, style, format, fullWidthResponsive = false, collapse = false }) {
  if (!slotId) return '';

  const collapseClass = collapse ? 'ad-slot--collapse' : '';
  const classes = ['ad-slot', wrapperClass, collapseClass].filter(Boolean).join(' ');
  const idAttr = id ? ` id="${id}"` : '';

  return `<div class="${classes}"${idAttr}>
${renderAdIns({ slotId, style, format, fullWidthResponsive })}
</div>`;
}

module.exports = { ADSENSE_CLIENT, AD_PRESETS, renderAdIns, renderAdSlot };
