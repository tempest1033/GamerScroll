'use strict';
const { t } = require('../../i18n');
/**
 * 개인정보처리방침 (/privacy/) — 푸터 링크의 착지점.
 * 2026-09-09: 루트 정적 privacy/index.html(옛 테마, 깃 미추적) 복사 방식을 템플릿 페이지로 교체.
 * 스타일은 소개 페이지와 같은 순위 허브(.rk / .rk-card / .rk-faq) 문법을 쓴다.
 */
const { wrapWithLayout } = require('../layout');

const siteBaseUrl = 'https://gamerscroll.com';

function renderPrivacyPage() {
  const section = (title, html) => `<div class="rk-card"><h2>${title}</h2><div class="rk-faq">${html}</div></div>`;
  const body = `<div class="rk-head"><h1>${t('footer.privacy_policy')}</h1></div>
<div class="rk-faq"><p>${t('privacy.gamerscroll_hereinafter')} "${t('privacy.this_site')}"${t('privacy.protects_users_personal_information_in')}</p></div>
${section(t('privacy.1_items_and_methods_of'), t('privacy.all_services_on_this_site'))}
${section(t('privacy.2_information_collected_automatically'), `<p>${t('privacy.the_following_information_may_be')}</p>
<ul><li>${t('privacy.device_information_device_type_operating')}</li><li>${t('privacy.access_logs_date_and_time')}</li><li>${t('privacy.ip_address_anonymized')}</li></ul>
<p>${t('privacy.this_information_is_collected_through')}</p>`)}
${section(t('privacy.3_retention_and_use_period'), t('privacy.automatically_collected_information_is_kept'))}
${section(t('privacy.4_use_of_cookies'), t('privacy.this_site_uses_cookies_for'))}
${section(t('privacy.5_provision_of_personal_information'), t('privacy.this_site_does_not_provide'))}
${section(t('privacy.6_policy_changes'), t('privacy.this_privacy_policy_may_be'))}
<div class="rk-note">${t('privacy.effective_date_december_4_2025')}</div>`;

  const content = `
    <section class="section active" id="privacy">
      <div class="page-container rk">
${body}
      </div>
    </section>`;

  return wrapWithLayout(content, {
    currentPage: 'privacy',
    title: t('privacy.privacy_policy_gamerscroll_2'),
    description: t('privacy.gamerscroll_privacy_policy_we_do'),
    keywords: t('privacy.privacy_policy_gamerscroll'),
    canonical: `${siteBaseUrl}/privacy/`,
    breadcrumbs: [{ name: t('about.home'), url: `${siteBaseUrl}/` }, { name: t('footer.privacy_policy'), url: `${siteBaseUrl}/privacy/` }],
  });
}

module.exports = { renderPrivacyPage };
