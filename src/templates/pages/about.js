'use strict';
const { t } = require('../../i18n');
/**
 * 사이트 소개 (/about/) — 누가 · 무엇을 · 어떻게 만드는지. 푸터 '소개' 링크의 착지점.
 * 스타일은 순위 허브(.rk / .rk-card / .rk-faq)를 그대로 쓴다.
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');

const siteBaseUrl = 'https://gamerscroll.com';
const X_URL = 'https://x.com/gamerscroll';

function renderAboutPage() {
  const body = `<div class="rk-head"><h1>${t('about.about_gamerscroll')}</h1></div>
<div class="rk-card"><h2>${t('about.what_it_covers')}</h2><div class="rk-faq">
<p>${t('about.gamerscroll_records_and_analyzes_game')}</p>
<p><a href="/games/">${t('layout.game_db')}</a>${t('about.collects_the_ranking_trend_and')}</p>
</div></div>
<div class="rk-card"><h2>${t('about.who_makes_it')}</h2><div class="rk-faq">
<p>${t('about.gamerscroll_is_built_and_run')} <b>Editor J</b>${t('about.a_pen_name_the_same')} <a href="https://aiscroll.io/ko/" rel="noopener" target="_blank">${t('about.aiscroll')}</a>${t('about.there_is_no_separate_editorial')}</p>
<p>${t('about.send_correction_requests_and_inquiries')} <a href="${X_URL}" rel="me noopener" target="_blank">@gamerscroll</a>${t('about.send_to_suffix')}</p>
</div></div>
<div class="rk-card"><h2>${t('about.how_the_data_is_made')}</h2><div class="rk-faq">
<p>${t('about.we_collect_the_public_store')}</p>
<p>${t('about.the_collection_scope_schedule_and')} <a href="/rankings/about/">${t('about.how_the_ranking_data_is')}</a>${t('about.documented_in_suffix')}</p>
</div></div>
<div class="rk-card"><h2>${t('about.what_this_site_does_not')}</h2><div class="rk-faq">
<p>${t('about.we_do_not_publish_rewritten')}</p>
</div></div>`;

  const content = `
    <section class="section active" id="about">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}
      </div>
    </section>`;

  return wrapWithLayout(content, {
    currentPage: 'about',
    title: t('about.about_gamerscroll_who_makes_it'),
    description: t('about.gamerscroll_records_and_analyzes_app'),
    keywords: t('about.about_gamerscroll_game_ranking_data'),
    canonical: `${siteBaseUrl}/about/`,
    breadcrumbs: [{ name: t('about.home'), url: `${siteBaseUrl}/` }, { name: t('footer.about'), url: `${siteBaseUrl}/about/` }],
  });
}

module.exports = { renderAboutPage };
