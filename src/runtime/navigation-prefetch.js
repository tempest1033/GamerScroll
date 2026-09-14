// Shared eligibility for document-only prefetching in the page and service worker.
function prefetchUrl(raw, origin) {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) return null;
    if (!/^\/(?:$|(?:games|rankings|steam|reports|magazine|about|privacy)\/)/.test(url.pathname)) return null;
    if (!url.pathname.endsWith('/')) return null;
    return url.href;
  } catch {
    return null;
  }
}

function installNavigationPrefetch(eligible) {
  if (window.__gsNavigationPrefetch) return;
  window.__gsNavigationPrefetch = true;
  const connection = navigator.connection;
  if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ''))) return;
  const requested = new Set();
  let timer;
  let warmupTimer;
  function prefetch(anchor) {
    if (!anchor || anchor.target || anchor.hasAttribute('download') || anchor.rel.includes('nofollow')) return;
    const url = eligible(anchor.href, location.origin);
    if (!url || url === location.href.split('#')[0] || requested.has(url) || requested.size >= 8) return;
    requested.add(url);
    // Fetch the document only: prerendering would run ads and analytics before a visit.
    const controller = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage({ type: 'gs-prefetch', url });
    } else {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'document';
      link.href = url;
      document.head.appendChild(link);
    }
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const anchor = event.target.closest && event.target.closest('a[href]');
    clearTimeout(timer);
    if (anchor) timer = setTimeout(() => prefetch(anchor), 100);
  }, { passive: true });
  document.addEventListener('pointerout', () => clearTimeout(timer), { passive: true });
  document.addEventListener('focusin', event => prefetch(event.target.closest && event.target.closest('a[href]')));
  document.addEventListener('touchstart', event => prefetch(event.target.closest && event.target.closest('a[href]')), { passive: true });
  // Prepare only nearby ranking menus, not every game link or every country.
  function warmMenus() {
    if (document.visibilityState === 'hidden' || !location.pathname.startsWith('/rankings/')) return;
    const primary = [...document.querySelectorAll('.rk-subnav a[href]')];
    const secondary = [...document.querySelectorAll('.rk-tabs a[href]')];
    const groups = location.pathname.startsWith('/rankings/genres/')
      ? [secondary, primary] : [primary, secondary];
    const candidates = groups.flatMap(links => {
      const current = links.findIndex(a => a.classList.contains('active'));
      return current >= 0
        ? [...links.slice(current + 1), ...links.slice(0, current)]
        : links;
    }).filter(a => eligible(a.href, location.origin) && a.href !== location.href.split('#')[0]);
    // The worker supports two concurrent requests. Keep speculative traffic small.
    const unique = [...new Map(candidates.map(a => [a.href, a])).values()];
    unique.slice(0, 2).forEach(prefetch);
  }
  function scheduleWarmup() { warmupTimer = setTimeout(warmMenus, 300); }
  if (document.readyState === 'complete') scheduleWarmup();
  else window.addEventListener('load', scheduleWarmup, { once: true });
  window.addEventListener('pagehide', () => {
    clearTimeout(timer);
    clearTimeout(warmupTimer);
  });
}

const navigationPrefetchScript = `(${installNavigationPrefetch.toString()})(${prefetchUrl.toString()});`;
module.exports = { prefetchUrl, navigationPrefetchScript };
