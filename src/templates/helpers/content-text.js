/**
 * Common text-block renderer used by trend.js (issue/hotpick/insight),
 * tech-article.js (tech/normal, tech/ai KR mirror), wiki-article.js,
 * and ai-blog/article.js (AIScroll EN articles).
 *
 * Input is a JSON `text` block's `value` string. Output is the rendered
 * HTML (paragraphs, code blocks, markdown tables, inline formatting).
 *
 * Source-of-truth for inline markdown patterns supported in article JSON:
 *   `code`, **bold**, **label:** (subheading), [text](url), - bullet
 *
 * Builder-specific differences are passed through `options`:
 *   - tableClass: CSS wrapper class for markdown tables.
 *   - internalLinkValidator: optional fn(href) → safe href|null. When
 *     provided, internal links starting with `/` are run through it and
 *     dropped if it returns falsy. Used by AIScroll to enforce category
 *     URL invariants.
 *   - linkRenderer: optional fn(label, rawHref) → HTML. Completely
 *     overrides the default link rendering, including any escape and
 *     validator logic. Used by AIScroll which needs label-escape plus a
 *     closure-bound slug validator.
 */

const RE_CODE_FENCE = /```(\w*)\n([\s\S]*?)```/g;
const RE_INLINE_CODE = /`([^`]+)`/g;
const RE_SUBHEADING = /\*\*([^*]+:)\*\*/g;
const RE_BOLD = /\*\*(.+?)\*\*/g;
const RE_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const RE_BULLET_LINE_START = /^- /gm;
const RE_BULLET_AFTER_NEWLINE = /\n- /g;
const RE_NEWLINE = /\n/g;
const RE_SUBHEADING_BR_FIX = /class="subheading">([^<]+)<\/strong><br>/g;
const RE_TABLE_SEPARATOR = /^\|[\s\-:|]+\|$/;

function escapeHrefAttr(href) {
  return String(href || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeCodeBody(code) {
  return String(code || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^(#.*)$/gm, '<span class="code-comment">$1</span>');
}

function renderLink(label, rawHref, { internalLinkValidator } = {}) {
  const href = String(rawHref || '').trim();
  if (!href || /^javascript:/i.test(href)) return label;
  if (href.startsWith('/')) {
    if (internalLinkValidator) {
      const validated = internalLinkValidator(href);
      if (!validated) return label;
      return `<a href="${escapeHrefAttr(validated)}">${label}</a>`;
    }
    return `<a href="${escapeHrefAttr(href)}">${label}</a>`;
  }
  return `<a href="${escapeHrefAttr(href)}" target="_blank" rel="noopener">${label}</a>`;
}

function formatInlineMarkdown(text, options = {}) {
  return String(text || '')
    .replace(RE_INLINE_CODE, '<code>$1</code>')
    .replace(RE_SUBHEADING, '<strong class="subheading">$1</strong>')
    .replace(RE_BOLD, '<strong>$1</strong>')
    .replace(RE_LINK, (_m, label, href) => {
      if (typeof options.linkRenderer === 'function') return options.linkRenderer(label, href);
      return renderLink(label, href, options);
    })
    .replace(RE_BULLET_LINE_START, '• ')
    .replace(RE_BULLET_AFTER_NEWLINE, '\n• ')
    .replace(RE_NEWLINE, '<br>')
    .replace(RE_SUBHEADING_BR_FIX, 'class="subheading">$1</strong>');
}

function parseMarkdownTable(text, options = {}) {
  const { tableClass = 'blog-table-wrapper' } = options;
  const lines = String(text || '').trim().split('\n');
  if (lines.length < 2) return null;
  if (!lines[0].trim().startsWith('|')) return null;
  const separatorIndex = lines.findIndex((line) => RE_TABLE_SEPARATOR.test(line.trim()));
  if (separatorIndex < 1) return null;

  const parseCells = (line) => {
    const cells = line.split('|');
    if (cells.length > 0 && cells[0].trim() === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map((cell) => cell.trim());
  };

  const headers = parseCells(lines[0]);
  const dataLines = lines.slice(separatorIndex + 1).filter((line) => line.trim().startsWith('|'));
  const rows = dataLines.map(parseCells);

  const fmtCell = (s) => formatInlineMarkdown(s, options);
  let html = `<div class="${tableClass}"><table>`;
  html += '<thead><tr>';
  headers.forEach((h) => { html += `<th>${fmtCell(h)}</th>`; });
  html += '</tr></thead><tbody>';
  rows.forEach((row) => {
    html += '<tr>';
    row.forEach((cell) => { html += `<td>${fmtCell(cell)}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function renderTextBlock(value, options = {}) {
  const raw = String(value || '');
  if (!raw.trim()) return '';

  const codeBlocks = [];
  const withPlaceholders = raw.replace(RE_CODE_FENCE, (_m, lang, code) => {
    const escaped = escapeCodeBody(code);
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const langAttr = lang ? ` class="language-${lang}"` : '';
    codeBlocks.push(`<figure class="blog-figure blog-code"><pre><code${langAttr}>${escaped}</code></pre></figure>`);
    return placeholder;
  });

  const formatFragment = (text) => {
    const t = text.trim();
    if (!t) return '';
    if (t.startsWith('|') && t.includes('|---')) {
      const tableHtml = parseMarkdownTable(t, options);
      if (tableHtml) return tableHtml;
    }
    return `<p class="blog-paragraph">${formatInlineMarkdown(t, options)}</p>`;
  };

  const paragraphs = withPlaceholders.split('\n\n').map((p) => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    const codeOnly = trimmed.match(/^__CODE_BLOCK_(\d+)__$/);
    if (codeOnly) return codeBlocks[parseInt(codeOnly[1], 10)];
    if (/__CODE_BLOCK_\d+__/.test(trimmed)) {
      const parts = trimmed.split(/(__CODE_BLOCK_\d+__)/);
      return parts.map((part) => {
        const m = part.match(/^__CODE_BLOCK_(\d+)__$/);
        if (m) return codeBlocks[parseInt(m[1], 10)];
        return formatFragment(part);
      }).filter(Boolean).join('');
    }
    return formatFragment(trimmed);
  }).filter(Boolean).join('');

  return paragraphs;
}

module.exports = {
  renderTextBlock,
  parseMarkdownTable,
  formatInlineMarkdown,
};
