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
  // 모바일 가로형 - width 100%, min/max height 200~250
  horizontalMobile: {
    style: 'display:block;min-width:300px;max-width:728px;width:100%;min-height:200px;max-height:250px;height:100%'
  },
  // PC 사각형 - 300x250
  rectanglePc: {
    style: 'display:block;width:300px;height:250px'
  },
  // 모바일 사각형 - width 100%, min/max height 200~500
  rectangleMobile: {
    style: 'display:block;min-width:300px;max-width:728px;width:100%;min-height:200px;max-height:500px;height:100%'
  },
  // PC 버티컬 - 300x600
  verticalPc: {
    style: 'display:block;width:300px;height:600px'
  },
  // 자동 반응형 - width 100%, height auto
  autoResponsive: {
    style: 'display:block;width:100%'
  }
};

function buildInsClassName(insClassName, wrapperClass) {
  const classSet = new Set(String(insClassName || '').split(/\s+/).filter(Boolean));
  classSet.add('adsbygoogle');

  const wrapperSet = new Set(String(wrapperClass || '').split(/\s+/).filter(Boolean));
  if (wrapperSet.has('pc-only')) classSet.add('pc-only');
  if (wrapperSet.has('mobile-only')) classSet.add('mobile-only');

  return Array.from(classSet).join(' ');
}

/**
 * 광고 <ins> 요소 + push 스크립트 생성 (구글 권장 방식)
 */
function renderAdIns({ slotId, style, format, fullWidthResponsive = false, insClassName }) {
  if (!slotId) return '';

  const safeStyle = style || 'display:block';
  const attrs = [
    `class="${buildInsClassName(insClassName)}"`,
    `style="${safeStyle}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  if (format) attrs.push(`data-ad-format="${format}"`);
  if (fullWidthResponsive) attrs.push('data-full-width-responsive="true"');

  // 조건부 push: display:none인 경우 광고 요청 안 함 (구글 권장)
  return `<ins ${attrs.join(' ')}></ins>
<script>(function(){var ins=document.currentScript.previousElementSibling;if(ins&&getComputedStyle(ins).display!=='none'){(adsbygoogle=window.adsbygoogle||[]).push({});}})();</script>`;
}

/**
 * 광고 슬롯 래퍼 + ins + push 스크립트 생성
 * @param {boolean} collapse - true면 unfilled 시 접힘 (3,4,5번 광고용)
 */
function renderAdSlot({ id = '', wrapperClass = '', slotId, style, format, fullWidthResponsive = false, collapse = false, insClassName: insClassNameInput = '' }) {
  if (!slotId) return '';

  const collapseClass = collapse ? 'ad-slot--collapse' : '';
  const classes = ['ad-slot', wrapperClass, collapseClass].filter(Boolean).join(' ');
  const idAttr = id ? ` id="${id}"` : '';
  const insClassName = buildInsClassName(insClassNameInput, wrapperClass);

  return `<div class="${classes}"${idAttr}>
${renderAdIns({ slotId, style, format, fullWidthResponsive, insClassName })}
</div>`;
}

module.exports = { ADSENSE_CLIENT, AD_PRESETS, renderAdIns, renderAdSlot };
