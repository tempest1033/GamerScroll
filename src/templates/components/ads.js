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
 * 광고 슬롯 생성 (래퍼 없이 ins만)
 */
function renderAdSlot({ slotId, style, format, fullWidthResponsive = false }) {
  if (!slotId) return '';
  return renderAdIns({ slotId, style, format, fullWidthResponsive });
}

module.exports = { ADSENSE_CLIENT, AD_PRESETS, renderAdIns, renderAdSlot };
