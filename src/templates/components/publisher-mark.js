const marks = require('../../../data/publisher-marks.json');
const { util: { esc } } = require('../../rank/stats');
const byName = new Map(Object.entries(marks).map(([name, mark]) => [name.toLowerCase(), mark]));

function publisherMark(name) {
  const mark = byName.get(String(name).trim().toLowerCase());
  // 확인되지 않은 회사는 다른 게임 아이콘을 로고처럼 쓰지 않고 이름의 첫 글자를 표시한다.
  const image = mark
    ? `<img src="/assets/publisher-logos/${esc(mark.file)}" alt="" width="32" height="32" loading="lazy" decoding="async">`
    : `<span class="rk-publisher-initial" aria-hidden="true">${esc(String(name).trim().slice(0, 1))}</span>`;
  return `<span class="rk-publisher-cell">${image}<span>${esc(name)}</span></span>`;
}

module.exports = { publisherMark };
