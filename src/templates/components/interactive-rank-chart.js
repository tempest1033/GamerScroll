'use strict';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function initRankChart() {
  const root = document.currentScript.previousElementSibling;
  const data = JSON.parse(root.querySelector('[type="application/json"]').textContent);
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.rk-chart-tooltip');
  const buttons = [...root.querySelectorAll('[data-chart-series]')];
  let index = 0;
  const ns = 'http://www.w3.org/2000/svg';
  const guide = document.createElementNS(ns, 'g');
  guide.setAttribute('class', 'rk-chart-guide');
  guide.setAttribute('pointer-events', 'none');
  svg.append(guide);
  const hide = () => { tip.hidden = true; guide.replaceChildren(); };
  const show = () => {
    tip.replaceChildren();
    guide.replaceChildren();
    const date = document.createElement('strong');
    date.textContent = data.labels[index];
    tip.append(date);
    const selectedX = data.x[index];
    const view = svg.viewBox.baseVal;
    const rule = document.createElementNS(ns, 'line');
    rule.setAttribute('x1', selectedX); rule.setAttribute('x2', selectedX);
    rule.setAttribute('y1', 12); rule.setAttribute('y2', view.height - 28);
    rule.setAttribute('stroke', '#99999f'); rule.setAttribute('stroke-dasharray', '3 3');
    guide.append(rule);
    const ys = [];
    data.series.forEach((s, i) => {
      if (buttons[i].getAttribute('aria-pressed') !== 'true') return;
      const line = document.createElement('span');
      const dot = document.createElement('i'); dot.style.backgroundColor = s.color;
      line.append(dot, document.createTextNode(`${s.name} ${s.values[index] == null ? '기록 없음' : s.values[index] + '위'}`));
      tip.append(line);
      if (s.values[index] == null) return;
      const circle = [...svg.querySelectorAll(`circle[data-rank-series="${i}"]`)].find(e => Math.abs(Number(e.getAttribute('cx')) - selectedX) < 1);
      let y = circle ? Number(circle.getAttribute('cy')) : null;
      const path = svg.querySelector(`path[data-rank-series="${i}"]`);
      if (y == null && path) {
        let start = 0, end = path.getTotalLength();
        for (let n = 0; n < 24; n++) { const middle = (start + end) / 2; if (path.getPointAtLength(middle).x < selectedX) start = middle; else end = middle; }
        const point = path.getPointAtLength((start + end) / 2);
        if (Math.abs(point.x - selectedX) < 1) y = point.y;
      }
      if (y == null) return;
      ys.push(y);
      const marker = document.createElementNS(ns, 'circle');
      marker.setAttribute('cx', selectedX); marker.setAttribute('cy', y);
      marker.setAttribute('r', 5); marker.setAttribute('fill', s.color);
      marker.setAttribute('stroke', '#fff'); marker.setAttribute('stroke-width', 2);
      guide.append(marker);
    });
    tip.hidden = false;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const anchor = new DOMPoint(selectedX, ys.length ? Math.min(...ys) : view.height / 2).matrixTransform(matrix);
    const bounds = root.getBoundingClientRect();
    const width = tip.offsetWidth, height = tip.offsetHeight;
    const visibleLeft = Math.max(bounds.left, 0), visibleRight = Math.min(bounds.right, innerWidth);
    const left = Math.max(visibleLeft + 4, Math.min(anchor.x + 12, visibleRight - width - 4));
    const top = anchor.y - height - 12 >= bounds.top ? anchor.y - height - 12 : anchor.y + 14;
    tip.style.left = `${left - bounds.left}px`;
    tip.style.top = `${Math.max(4, top - bounds.top)}px`;
  };
  const locate = event => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    index = data.x.reduce((best, x, i) => Math.abs(x - point.x) < Math.abs(data.x[best] - point.x) ? i : best, 0);
  };
  svg.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') { locate(e); show(); } });
  svg.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hide(); });
  svg.addEventListener('pointerdown', () => svg.classList.remove('rk-chart-keyboard'));
  svg.addEventListener('click', e => { locate(e); show(); });
  svg.addEventListener('focus', () => { if (svg.matches(':focus-visible')) { svg.classList.add('rk-chart-keyboard'); show(); } });
  svg.addEventListener('blur', () => { svg.classList.remove('rk-chart-keyboard'); hide(); });
  document.addEventListener('pointerdown', e => { if (!root.contains(e.target)) hide(); }, { passive: true });
  svg.addEventListener('keydown', e => {
    svg.classList.add('rk-chart-keyboard');
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); index = Math.max(0, Math.min(data.labels.length - 1, index + (e.key === 'ArrowLeft' ? -1 : 1))); show();
    } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); index = e.key === 'Home' ? 0 : data.labels.length - 1; show(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); }
    else if (e.key === 'Escape') hide();
  });
  buttons.forEach((button, i) => button.addEventListener('click', () => {
    const visible = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(visible));
    svg.querySelectorAll(`[data-rank-series="${i}"]`).forEach(e => { e.style.display = visible ? '' : 'none'; });
    if (!tip.hidden) show();
  }));
}

function interactiveRankChart(svg, labels, series, x) {
  const payload = JSON.stringify({ labels, series, x }).replace(/</g, '\\u003c');
  const accessibleSvg = svg.replace('<svg ', '<svg tabindex="0" ');
  return `<div class="rk-interactive-chart">${accessibleSvg}<div class="rk-chart-tooltip" role="status" aria-live="polite" hidden></div><div class="rk-chart-legend">${series.map((s, i) => `<button type="button" data-chart-series="${i}" aria-pressed="true"><i style="background:${esc(s.color)}"></i>${esc(s.name)}</button>`).join('')}</div><script type="application/json">${payload}</script></div><script>(${initRankChart.toString()})();</script>`;
}
module.exports = { interactiveRankChart };
