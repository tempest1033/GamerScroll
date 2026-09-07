/**
 * CSS :hover 규칙을 @media (hover: hover)로 감싼다.
 *
 * 터치 기기는 hover를 흉내 내지 않으므로 탭한 뒤 hover 상태가 남는 문제(sticky hover)가 생긴다.
 * 포인터가 있는 환경에서만 hover 스타일이 적용되도록 빌드 시 한 번에 변환한다.
 * 이미 (hover: hover) 미디어 안에 있는 규칙은 그대로 둔다.
 */
const postcss = require('postcss');

const HOVER_MEDIA_RE = /hover\s*:\s*hover/;

function isInsideHoverMedia(node) {
  let parent = node.parent;
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule' && parent.name === 'media' && HOVER_MEDIA_RE.test(parent.params)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function guardHoverRules(css) {
  const source = String(css || '');
  const hasBom = source.charCodeAt(0) === 0xfeff;
  const body = hasBom ? source.slice(1) : source;

  let root;
  try {
    root = postcss.parse(body);
  } catch (e) {
    console.warn(`  ⚠️ hover 가드 스킵(CSS 파싱 실패): ${e.message}`);
    return source;
  }

  root.walkRules((rule) => {
    if (!rule.selector.includes(':hover')) return;
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    if (isInsideHoverMedia(rule)) return;

    // :not(:hover)처럼 부정 안에서만 쓰인 hover는 "hover가 아닐 때" 규칙이므로 감싸지 않는다
    const usesHover = (s) => s.replace(/:not\([^)]*\)/g, '').includes(':hover');
    const hoverSelectors = rule.selectors.filter(usesHover);
    const otherSelectors = rule.selectors.filter((s) => !usesHover(s));
    if (hoverSelectors.length === 0) return;

    const media = postcss.atRule({ name: 'media', params: '(hover: hover)' });
    const hoverRule = rule.clone();
    hoverRule.selectors = hoverSelectors;
    media.append(hoverRule);

    if (otherSelectors.length > 0) {
      rule.selectors = otherSelectors;
      rule.after(media);
    } else {
      rule.replaceWith(media);
    }
  });

  return (hasBom ? '\ufeff' : '') + root.toString();
}

module.exports = { guardHoverRules };
