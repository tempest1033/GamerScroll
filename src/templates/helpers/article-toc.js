/**
 * 기사 공통 목차: PC 사이드바 / 모바일 접이식, 본문과 공유하는 고유 앵커.
 */
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const slugifyHeading = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9가-힣\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

// 페이지 안에서 실행된다. 두 목차는 같은 절을 강조하며 이전 초기화의 리스너는 정리한다.
function initArticleToc() {
  if (window.__gsArticleTocCleanup) window.__gsArticleTocCleanup();
  var groups = new Map();
  document.querySelectorAll('.article-toc .article-toc-item').forEach(function(link) {
    var id = (link.getAttribute('href') || '').slice(1);
    var heading = id && document.getElementById(id);
    if (!heading) return;
    if (!groups.has(id)) groups.set(id, { heading: heading, links: [] });
    groups.get(id).links.push(link);
  });
  var pairs = Array.from(groups.values());
  if (!pairs.length) return;
  var current = null;
  var frame = 0;
  function update() {
    frame = 0;
    if (!pairs[0].heading.isConnected) {
      cleanup();
      return;
    }
    var threshold = (parseFloat(getComputedStyle(pairs[0].heading).scrollMarginTop) || 84) + 12;
    var active = pairs[0];
    pairs.forEach(function(pair) {
      if (pair.heading.getBoundingClientRect().top <= threshold) active = pair;
    });
    if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      active = pairs[pairs.length - 1];
    }
    if (active === current) return;
    if (current) current.links.forEach(function(link) {
      link.classList.remove('is-current');
      link.removeAttribute('aria-current');
    });
    active.links.forEach(function(link) {
      link.classList.add('is-current');
      link.setAttribute('aria-current', 'location');
      // 긴 PC 목차에서도 현재 항목만 내부 스크롤로 드러낸다. 본문은 움직이지 않는다.
      var nav = link.closest('.article-sidebar-sticky');
      if (!nav || !nav.clientHeight || nav.scrollHeight <= nav.clientHeight) return;
      var bounds = nav.getBoundingClientRect();
      var item = link.getBoundingClientRect();
      if (item.top < bounds.top) nav.scrollTop += item.top - bounds.top;
      else if (item.bottom > bounds.bottom) nav.scrollTop += item.bottom - bounds.bottom;
    });
    current = active;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  var main = document.querySelector('.article-main');
  if (observer && main) observer.observe(main);
  function cleanup() {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('hashchange', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('load', schedule, true);
    if (observer) observer.disconnect();
    if (window.__gsArticleTocCleanup === cleanup) window.__gsArticleTocCleanup = null;
  }
  window.__gsArticleTocCleanup = cleanup;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('load', schedule, true);
  update();
}

function createArticleToc(content = [], { title = '목차', slugify = slugifyHeading } = {}) {
  const headings = (Array.isArray(content) ? content : [])
    .filter(block => block && block.type === 'heading' && String(block.value ?? '').trim())
    .map((block, index) => ({
      block,
      base: slugify(String(block.value)) || `article-section-${index + 1}`
    }));
  // 기존의 첫 앵커는 유지한다. 중복 앵커가 뒤에 나올 실제 제목의 slug를 선점하지 않게 한다.
  const reserved = new Set(headings.map(heading => heading.base));
  const used = new Set(['sidebar-toc']);
  const ids = new Map();
  headings.forEach(heading => {
    let id = heading.base;
    let suffix = 2;
    while (used.has(id)) {
      do { id = `${heading.base}-${suffix++}`; } while (reserved.has(id));
    }
    used.add(id);
    ids.set(heading.block, id);
  });

  const result = {
    headingId: block => ids.get(block) || '',
    sidebarHTML: '',
    mobileHTML: '',
    scriptHTML: ''
  };
  if (headings.length < 3) return result;

  const label = escapeHtml(title);
  const items = headings.map(({ block }, index) => `
      <li><a href="#${escapeHtml(ids.get(block))}" class="article-toc-item"><span class="article-toc-num" aria-hidden="true">${index + 1}</span><span class="article-toc-text">${escapeHtml(block.value)}</span></a></li>`).join('');
  const nav = `<nav class="article-toc" aria-label="${label}"><ol class="article-toc-list">${items}
    </ol></nav>`;
  result.sidebarHTML = `
    <div class="home-card article-toc-card" id="sidebar-toc">
      <div class="home-card-header"><h3 class="home-card-title">${label}</h3></div>
      ${nav}
    </div>`;
  result.mobileHTML = `
    <details class="article-toc-mobile">
      <summary>${label}<svg class="article-toc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
      ${nav}
    </details>`;
  result.scriptHTML = `<script>(${initArticleToc.toString()})();</script>`;
  return result;
}

module.exports = { createArticleToc };
