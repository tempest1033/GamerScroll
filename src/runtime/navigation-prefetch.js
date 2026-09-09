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
  window.addEventListener('pagehide', () => clearTimeout(timer));
}

const navigationPrefetchScript = `(${installNavigationPrefetch.toString()})(${prefetchUrl.toString()});`;
module.exports = { prefetchUrl, navigationPrefetchScript };
