const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const { type = 'mobile-200' } = options;

  // vertical/rectangle: 구글 순정 방식
  if (type === 'vertical') {
    return `<div class="ad-card ad-card-vertical">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:600px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
  }
  if (type === 'rectangle') {
    return `<div class="ad-card ad-card-rectangle">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
  }

  // mobile-200/400: CSS에서 크기 처리
  return `<div class="ad-card ad-card-${type}">
  <ins class="adsbygoogle"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
