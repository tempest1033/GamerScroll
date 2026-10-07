// Renders thumbnail.svg / heatmap-v5.svg from results.json, then the WebP delivery files.
// Usage (repo root): node data/article-assets/aiscroll/ai-token-cost-by-language/build-charts.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(process.cwd(), 'package.json'))('sharp');
const { results } = JSON.parse(readFileSync(join(HERE, 'results.json'), 'utf8'));

const LANGS = ['Chinese', 'Spanish', 'Japanese', 'German', 'French', 'Russian', 'Korean', 'Arabic', 'Hindi'];
const MODELS = [
  ['GPT', '6.1'], ['Opus', '5.5'], ['Gemini', '3.8 Flash'], ['DeepSeek', 'V4.1 Flash'],
  ['Kimi', 'K3'], ['GLM', '5.3 Flash'], ['Muse Spark', '1.3'], ['Grok', '4.7'],
];
const ratio = (r, l) => r.net[l] / r.net.English;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const langAvg = (l) => avg(results.map((r) => ratio(r, l)));
const fmt = (x) => `${x.toFixed(2)}×`;

const C = { ink: '#14121c', text: '#26232f', muted: '#6b6977', rule: '#dcd9e3', accent: '#6d28d9' };
const M = 64; // one left/right margin shared by every element

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function ramp(stops, v) {
  const x = Math.min(Math.max(v, stops[0][0]), stops.at(-1)[0]);
  const i = stops.findIndex((_, k) => k < stops.length - 1 && x <= stops[k + 1][0]);
  const [s0, c0] = stops[i], [s1, c1] = stops[i + 1];
  const t = (x - s0) / (s1 - s0), a = hex(c0), b = hex(c1);
  return `rgb(${a.map((n, k) => Math.round(n + (b[k] - n) * t)).join(',')})`;
}
// Heatmap: teal below English, warm above it, dark red at the Hindi extreme.
const HEAT = [[0.9, '#2dd4bf'], [1.0, '#e6f6f2'], [1.25, '#fde68a'], [1.5, '#fdba74'], [1.8, '#f97316'], [2.1, '#dc2626'], [3.0, '#991b1b'], [4.3, '#5b0f0f']];
// Bars: single brand hue, darker = more tokens.
const BAR = [[1.0, '#c4b5fd'], [1.5, '#8b5cf6'], [2.3, '#4c1d95']];
const onHeat = (v) => (v >= 1.95 ? '#ffffff' : C.text);

const t = (x, y, s, size, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.bold ? ' font-weight="700"' : ''} fill="${o.fill || C.text}">${s}</text>`;
const hr = (y, w) => `<line x1="${M}" y1="${y}" x2="${w - M}" y2="${y}" stroke="${C.rule}" stroke-width="1.5"/>`;

// Flat white sheet (the page draws the rounded edge): title block, hairline rules, footer.
function sheet(w, h, title, subtitle, inner, footer) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <g font-family="Arial, Helvetica, sans-serif">
    ${t(M, 104, title, 46, { bold: true, fill: C.ink })}
    ${t(M, 144, subtitle, 22, { fill: C.muted })}
    ${hr(172, w)}
    ${inner}
    ${hr(h - 86, w)}
    ${t(M, h - 50, footer, 18, { fill: C.muted })}
    ${t(w - M, h - 50, 'aiscroll.io', 20, { anchor: 'end', bold: true, fill: C.accent })}
  </g>
</svg>`;
}

function thumbnail() {
  const W = 1280, H = 720, x0 = 250, xR = W - M, xMax = xR - 110, top = 214, rowH = 45, barH = 28;
  const vMax = Math.max(...LANGS.map(langAvg));
  const sx = (v) => x0 + ((xMax - x0) * v) / vMax;
  let s = '';
  LANGS.forEach((l, i) => {
    const y = top + i * rowH, v = langAvg(l), mid = y + barH / 2 + 9;
    s += t(M, mid, l, 25, { bold: true });
    s += `<rect x="${x0}" y="${y}" width="${sx(v) - x0}" height="${barH}" rx="2" fill="${ramp(BAR, v)}"/>`;
    s += t(xR, mid, fmt(v), 25, { anchor: 'end', bold: true, fill: C.ink });
  });
  const yEnd = top + (LANGS.length - 1) * rowH + barH;
  s += `<line x1="${sx(1)}" y1="${top - 10}" x2="${sx(1)}" y2="${yEnd + 6}" stroke="${C.ink}" stroke-width="2" stroke-dasharray="5 5"/>`;
  s += t(sx(1) + 8, top - 14, 'English = 1×', 17, { bold: true, fill: C.ink });
  return sheet(W, H, 'AI token cost by language', 'Tokens for the same text vs English · average of 8 models', s,
    'Same 200 sentences in 9 languages · measured Oct 6, 2026 (UTC)');
}

function heatmap() {
  const W = 1200, x0 = 220, xR = W - M, n = MODELS.length + 1, colW = (xR - x0) / n, gap = 4;
  const headTop = 196, rowH = 58, rowsTop = headTop + 70;
  const rowY = (i) => rowsTop + i * rowH + (i === LANGS.length ? 22 : 0);
  const H = rowY(LANGS.length) + rowH + 30 + 86;
  const avgX = x0 + MODELS.length * colW;
  let s = '';
  [...MODELS, ['Average', '']].forEach(([a, b], j) => {
    const cx = x0 + j * colW + colW / 2, isAvg = j === MODELS.length;
    s += t(cx, headTop + (b ? 26 : 38), a, 18, { anchor: 'middle', bold: true, fill: isAvg ? C.accent : C.text });
    if (b) s += t(cx, headTop + 50, b, 16, { anchor: 'middle', fill: C.muted });
  });
  // Hairlines set the average column and row apart from the per-model cells.
  s += `<line x1="${avgX}" y1="${headTop}" x2="${avgX}" y2="${rowY(LANGS.length) + rowH}" stroke="${C.rule}" stroke-width="1.5"/>`;
  s += hr(rowY(LANGS.length) - 11, W);
  const cell = (j, y, v, x = x0 + j * colW) =>
    `<rect x="${x + gap / 2 + (j === MODELS.length ? 4 : 0)}" y="${y + gap / 2}" width="${colW - gap - (j === MODELS.length ? 4 : 0)}" height="${rowH - gap}" rx="3" fill="${ramp(HEAT, v)}"/>` +
    t(x + colW / 2 + (j === MODELS.length ? 2 : 0), y + rowH / 2 + 8, fmt(v), 21, { anchor: 'middle', bold: true, fill: onHeat(v) });
  LANGS.forEach((l, i) => {
    const y = rowY(i);
    s += t(M, y + rowH / 2 + 8, l, 22, { bold: true });
    results.forEach((r, j) => (s += cell(j, y, ratio(r, l))));
    s += cell(MODELS.length, y, langAvg(l));
  });
  const yA = rowY(LANGS.length);
  s += t(M, yA + rowH / 2 + 8, 'Average', 22, { bold: true, fill: C.accent });
  results.forEach((r, j) => (s += cell(j, yA, avg(LANGS.map((l) => ratio(r, l))))));
  s += cell(MODELS.length, yA, avg(LANGS.map(langAvg)));
  return sheet(W, H, 'Token multiplier vs English', 'Input tokens for the same 200 sentences ÷ English tokens · lower is cheaper', s,
    'FLORES-200 devtest, n=200 · one run per model · measured Oct 6, 2026 (UTC)');
}

for (const [name, svg, w] of [['thumbnail', thumbnail(), 640], ['heatmap-v5', heatmap(), 1200]]) {
  writeFileSync(join(HERE, `${name}.svg`), svg);
  const meta = await sharp(Buffer.from(svg)).resize({ width: w }).webp({ quality: 92 }).toFile(join(HERE, `${name}.webp`));
  console.log(name, meta.width, meta.height);
}
