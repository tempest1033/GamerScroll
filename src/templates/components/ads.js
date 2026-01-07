/**
 * 광고(AdSense) 공통 헬퍼
 * - 구글 권장 표준 방식으로 마크업 생성
 * - 각 광고 슬롯 바로 뒤에 push 스크립트 포함
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

// AdSense 표준 프리셋 - 모든 광고 반응형 통일
const AD_PRESETS = {
  // 반응형 (기본) - Google 권장 방식
  responsive: {
    style: 'display:inline-block',
    fullWidthResponsive: true
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

  return `<ins ${attrs.join(' ')}></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`;
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
