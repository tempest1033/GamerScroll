// Meta description builder shared by the GamerScroll and AIScroll templates.
//
// A missing or short summary is topped up with the first body paragraphs so
// the description reflects the page instead of falling back to the title or
// the site tagline. Output is plain text capped at MAX_LENGTH.

const MIN_LENGTH = 80;
const MAX_LENGTH = 155;

function plainText(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')      // 이미지 마크다운 제거
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // 링크 → 라벨
    .replace(/<[^>]+>/g, ' ')                   // 인라인 HTML
    .replace(/[*`~]+/g, '')                     // 강조·코드 마크
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  return (cut.replace(/\s+\S*$/, '') || cut) + '...';
}

/**
 * @param {string} summary 기사 summary (없어도 됨)
 * @param {Array<{type:string,value?:string}>} content 본문 블록 (type 'text'만 사용)
 * @param {{min?:number,max?:number}} [opts]
 * @returns {string} summary·본문 모두 없으면 ''
 */
function buildMetaDescription(summary, content, opts = {}) {
  const min = opts.min ?? MIN_LENGTH;
  const max = opts.max ?? MAX_LENGTH;
  let text = plainText(summary);
  if (text.length < min && Array.isArray(content)) {
    for (const block of content) {
      if (!block || block.type !== 'text') continue;
      const paragraph = plainText(block.value);
      if (!paragraph) continue;
      text = text ? `${text} ${paragraph}` : paragraph;
      if (text.length >= min) break;
    }
  }
  return truncate(text, max);
}

module.exports = { buildMetaDescription, MIN_LENGTH, MAX_LENGTH };
