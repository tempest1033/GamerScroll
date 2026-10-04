'use strict';
const { t } = require('../../i18n');

const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function listLink(href, label, extraClass = '') {
  return `<a class="gs-list-action gs-list-link ${escape(extraClass)}" href="${escape(href)}"><span>${escape(label)}</span><span class="gs-list-arrow" aria-hidden="true">›</span></a>`;
}

function expandLabel(id, count, visible) {
  return `<label for="${escape(id)}" class="rk-more gs-list-action gs-list-expand"><span class="gs-expand-text">${t('list.view_full_ranking', { count })}</span><span class="gs-collapse-text">${t('list.show_top_only', { visible })}</span><span class="gs-list-chevron" aria-hidden="true"></span></label>`;
}

module.exports = { listLink, expandLabel };
