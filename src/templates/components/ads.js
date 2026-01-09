const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * 광고 카드 렌더링
 * 타입별 설정:
 * - mobile-top: 컨테이너 min 200, ins min 200, format 없음
 * - mobile-sub: 컨테이너 min 280, ins 336x280, format 없음 (고정)
 * - pc-home-top: 컨테이너 min 110, ins 90px, format horizontal
 * - pc-top: 컨테이너 min 110, ins 90px, format horizontal
 * - pc-sub: 컨테이너 min 110, format auto, full-width true
 * - rectangle: 컨테이너 min 250, ins 250x300, format rectangle
 * - vertical: 컨테이너 min 300, ins 300x600, format vertical
 */
function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const { type = 'mobile-top', visibility = '' } = options;

  // visibility 클래스 (ad-mobile-only, ad-pc-only)
  const visibilityClass = visibility ? ` ad-${visibility}` : '';

  // 타입별 인라인 스타일
  let inlineStyle = 'display:block';
  if (type === 'rectangle') {
    inlineStyle = 'display:inline-block;width:300px;height:250px';
  } else if (type === 'vertical') {
    inlineStyle = 'display:inline-block;width:300px;height:600px';
  } else if (type === 'mobile-sub') {
    inlineStyle = 'display:inline-block;width:336px;height:280px';
  }

  const attrs = [
    `class="adsbygoogle"`,
    `style="${inlineStyle}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  // 타입별 AdSense 속성 추가
  if (type === 'rectangle') {
    attrs.push('data-ad-format="rectangle"');
  }
  // mobile-sub: format 없음 (고정 크기)
  if (type === 'pc-home-top' || type === 'pc-top') {
    attrs.push('data-ad-format="horizontal"');
  }
  if (type === 'pc-sub') {
    attrs.push('data-ad-format="auto"');
    attrs.push('data-full-width-responsive="true"');
  }
  if (type === 'vertical') {
    attrs.push('data-ad-format="vertical"');
  }
  // mobile-top: format 없음

  return `<div class="ad-card ad-card-${type}${visibilityClass}">
  <ins ${attrs.join(' ')}></ins>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
