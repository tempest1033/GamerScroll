'use strict';

const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function listLink(href, label, extraClass = '') {
  return `<a class="gs-list-action gs-list-link ${escape(extraClass)}" href="${escape(href)}"><span>${escape(label)}</span><span class="gs-list-arrow" aria-hidden="true">›</span></a>`;
}

function expandLabel(id, count, visible) {
  return `<label for="${escape(id)}" class="rk-more gs-list-action gs-list-expand"><span class="gs-expand-text">전체 순위 보기 · ${count}개</span><span class="gs-collapse-text">상위 ${visible}개만 보기</span><span class="gs-list-chevron" aria-hidden="true"></span></label>`;
}

module.exports = { listLink, expandLabel };
