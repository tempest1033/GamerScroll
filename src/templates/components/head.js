/**
 * HTML <head> 컴포넌트
 * SEO 메타, 스타일, Firebase Analytics 등
 */

// 광고 활성화 여부 (ADS_ENABLED=false면 비활성화)
const i18n = require('../../i18n');
const { t } = i18n;
const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';
const { renderCssLinks } = require('../../build/css-links');
const { lazyImageLoaderScript } = require('../../build/lazy-images');

function generateHead(options = {}) {
  const {
    title = t('head.gamerscroll_game_ranking_data_analysis'),
    description = t('head.daily_records_and_analysis_of'),
    keywords = t('head.game_rankings_mobile_game_revenue'),
    canonical = 'https://gamerscroll.com',
    pageData = {},
    articleSchema = null,  // Article JSON-LD (리포트 페이지용)
    articleSection = '',  // article:section OG 메타 (카테고리별 다르게 설정)
    breadcrumbs = null,  // BreadcrumbList JSON-LD [{name, url}]
    softwareSchema = null,  // SoftwareApplication JSON-LD (게임 페이지용) {name, description, image, operatingSystem, applicationCategory, aggregateRating}
    noindex = false,  // 검색엔진 인덱싱 제외 (thin content용)
    ogImage = '',
    preloadImage = null,  // LCP 이미지 preload {src, srcset, sizes} 또는 URL 문자열
    cssFilename = '/styles-core.css',  // 기본 CSS 파일명 (하위 호환)
    cssFilenames = null,  // 다중 CSS 파일명
    usesWsrv = false,  // 본문이 wsrv.nl 이미지를 쓸 때만 사전 연결
    steamImageHost = ''  // 본문 스팀 이미지 CDN 호스트 (크롤 시점마다 akamai·fastly 등으로 바뀜)
  } = options;

  const normalizeMeta = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  const escapeHtmlAttr = (value) => normalizeMeta(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const escapeHtmlText = (value) => escapeHtmlAttr(value);
  const jsonString = (value) => JSON.stringify(value == null ? '' : String(value))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  // 날짜 문자열에 KST 타임존 보정 (+09:00)
  const ensureTimezone = (dateStr) => {
    if (!dateStr) return dateStr;
    const s = String(dateStr);
    // 이미 타임존이 있으면 그대로 반환 (Z, +HH:MM, -HH:MM)
    if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
    // YYYY-MM-DD 형식 → T00:00:00+09:00 추가
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00:00+09:00';
    // YYYY-MM-DDTHH:MM 형식 → :00+09:00 추가
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s + ':00+09:00';
    // YYYY-MM-DDTHH:MM:SS 형식 → +09:00 추가
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s + '+09:00';
    return s;
  };

  const safeTitle = escapeHtmlText(title);
  // <title> 태그용: 사이트명이 없으면 "| 게이머스크롤" 추가 (og:title은 원본 유지)
  const SITE_SUFFIX = t('head.gamerscroll_2');
  const needsSuffix = !title.includes(t('head.gamerscroll'));
  const pageTitleText = needsSuffix ? escapeHtmlText(title + SITE_SUFFIX) : safeTitle;
  // Description 155자 제한
  const trimmedDescription = description.length > 155
    ? description.slice(0, 152).replace(/\s+\S*$/, '') + '...'
    : description;
  const safeDescription = escapeHtmlAttr(trimmedDescription);
  const safeKeywords = escapeHtmlAttr(keywords || '');
  const keywordTags = articleSchema && keywords
    ? String(keywords).split(',').map(tag => normalizeMeta(tag)).filter(Boolean).slice(0, 6)
    : [];
  // Edition builds: the canonical is self-referencing (edition prefix) and every edition is announced via hreflang.
  const editionMode = i18n.isEditionMode();
  const edition = i18n.currentEdition();
  const pagePath = editionMode ? i18n.stripEditionPrefix(new URL(normalizeMeta(canonical), i18n.SITE_ORIGIN).pathname) : '';
  const canonicalText = editionMode ? i18n.absoluteUrl(edition.code, pagePath) : normalizeMeta(canonical);
  const safeCanonical = escapeHtmlAttr(canonicalText);
  const normalizeToCanonical = (value) => normalizeMeta(value || '');
  const schemaCanonical = normalizeToCanonical(canonicalText);
  const schemaBreadcrumbs = breadcrumbs && breadcrumbs.length > 0
    ? breadcrumbs.map(item => ({ ...item, url: normalizeToCanonical(item.url) }))
    : null;
  const alternateLink = editionMode && !noindex
    ? [...i18n.EDITIONS.map((e) => `<link rel="alternate" hreflang="${e.hreflang}" href="${i18n.absoluteUrl(e.code, pagePath)}">`), `<link rel="alternate" hreflang="x-default" href="${i18n.absoluteUrl('en', pagePath)}">`].join('\n  ')
    : '';
  const resolvedOgImage = escapeHtmlAttr(
    (typeof ogImage === 'string' && ogImage) ||
    (articleSchema && typeof articleSchema.image === 'string' && articleSchema.image) ||
    'https://gamerscroll.com/og-image.png'
  );
  const safeImageAlt = safeTitle;
  const resolvedCssFiles = (() => {
    const files = Array.isArray(cssFilenames) && cssFilenames.length > 0
      ? cssFilenames
      : [cssFilename];
    const seen = new Set();
    const out = [];
    for (const file of files) {
      const normalized = String(file || '').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out.length > 0 ? out : ['/styles-core.css'];
  })();
  const deferredCssFiles = resolvedCssFiles.slice(1);
  const cssLinksHtml = renderCssLinks(resolvedCssFiles);
  const deferredCssInitScript = deferredCssFiles.length > 0 ? `<script>
    (function() {
      var root = document.documentElement;
      if (!root || !root.classList) return;
      root.classList.add('deferred-css-pending');
    })();
  </script>` : '';
  const deferredCssGuardStyle = deferredCssFiles.length > 0 ? `<style>
    .deferred-css-pending *,.deferred-css-pending *::before,.deferred-css-pending *::after{
      transition:none !important;
      animation:none !important;
    }
  </style>` : '';
  const articleOgMeta = articleSchema ? [
    articleSchema.datePublished ? `<meta property="article:published_time" content="${escapeHtmlAttr(ensureTimezone(articleSchema.datePublished))}">` : '',
    (articleSchema.dateModified || articleSchema.datePublished) ? `<meta property="article:modified_time" content="${escapeHtmlAttr(ensureTimezone(articleSchema.dateModified || articleSchema.datePublished))}">` : '',
    `<meta property="article:section" content="${escapeHtmlAttr(articleSection || t('est.game'))}">`,
    `<meta property="article:author" content="${t('head.gamerscroll')}">`,
    ...keywordTags.map(tag => `<meta property="article:tag" content="${escapeHtmlAttr(tag)}">`)
  ].filter(Boolean).join('\n  ') : '';

  // Article JSON-LD 생성 (리포트 페이지용)
  const articleJsonLd = articleSchema ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${jsonString(articleSchema.headline || title)},
    "description": ${jsonString(articleSchema.description || description)},
    ${articleSchema.datePublished ? `"datePublished": ${jsonString(ensureTimezone(articleSchema.datePublished))},` : ''}
    ${(articleSchema.dateModified || articleSchema.datePublished) ? `"dateModified": ${jsonString(ensureTimezone(articleSchema.dateModified || articleSchema.datePublished))},` : ''}
    "author": {
      "@type": "Person",
      "name": ${jsonString(articleSchema.author || 'Editor J')}
    },
    "publisher": {
      "@type": "Organization",
      "name": "${t('head.gamerscroll')}",
      "url": "https://gamerscroll.com/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://gamerscroll.com/icon-192.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": ${jsonString(schemaCanonical)}
    }${articleSchema.image ? `,
    "image": ${jsonString(articleSchema.image)}` : ''}
  }
  </script>` : '';

  // BreadcrumbList JSON-LD 생성
  const breadcrumbJsonLd = schemaBreadcrumbs && schemaBreadcrumbs.length > 0 ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [${schemaBreadcrumbs.map((item, index) => `
      {
        "@type": "ListItem",
        "position": ${index + 1},
        "name": ${jsonString(item.name)},
        "item": ${jsonString(item.url)}
      }`).join(',')}
    ]
  }
  </script>` : '';

  // SoftwareApplication JSON-LD 생성 (게임 페이지용)
  const softwareJsonLd = softwareSchema ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": ${jsonString(softwareSchema.name)},
    "description": ${jsonString(softwareSchema.description)},
    "applicationCategory": "GameApplication"${softwareSchema.operatingSystem ? `,
    "operatingSystem": ${jsonString(softwareSchema.operatingSystem)}` : ''}${softwareSchema.image ? `,
    "image": ${jsonString(softwareSchema.image)}` : ''}${softwareSchema.aggregateRating ? `,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": ${jsonString(softwareSchema.aggregateRating.ratingValue)},
      "bestRating": "100",
      "worstRating": "0"${softwareSchema.aggregateRating.ratingCount ? `,
      "ratingCount": ${softwareSchema.aggregateRating.ratingCount}` : ''}
    }` : ''}
  }
  </script>` : '';

  // 페이지별 데이터 스크립트는 layout.js에서 main 안에 삽입

  return `
	  <meta charset="UTF-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">${noindex ? `
	  <meta name="robots" content="noindex, follow">` : `
	  <meta name="robots" content="max-image-preview:large">`}
	  <!-- preconnect: AdSense / 광고 서빙 — preload·async script보다 먼저 연결 핸드셰이크 시작 -->${ADS_ENABLED ? `
	  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
	  <link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin>
	  <link rel="preconnect" href="https://tpc.googlesyndication.com" crossorigin>` : ''}${usesWsrv ? `
	  <link rel="preconnect" href="https://wsrv.nl">` : ''}
	  <!-- Critical CSS: 레이아웃 선적용 (CLS 방지) -->
	  <style>
	    :root { --space-page-x: 16px; --space-block-gap: 20px; --space-block-y: 24px; }
	    body { margin: 0; }
	    .home-trend-card-image { background: transparent !important; }
	    :is(.site-container, .container) {
	      max-width: 1180px;
	      margin: 0 auto;
	      padding-left: var(--space-page-x);
	      padding-right: var(--space-page-x);
	      box-sizing: border-box;
	    }
	    .header-inner {
	      max-width: 1180px;
	      margin: 0 auto;
	      padding: 0 32px;
	      box-sizing: border-box;
	    }
	    .nav-inner {
	      max-width: 1180px;
	      margin: 0 auto;
	      padding: 0 var(--space-page-x);
	      box-sizing: border-box;
	    }
	    .home-container {
	      display: grid;
	      grid-template-columns: 1fr 300px;
	      gap: var(--space-block-gap);
	      padding: 0 0 var(--space-block-y) 0;
	    }
	    .home-main > * { margin-bottom: var(--space-block-gap); }
	    .home-card { margin-bottom: var(--space-block-gap); }
	    @media (max-width: 768px) {
	      body { width: 100%; max-width: 100vw; overscroll-behavior-x: none; }
	      .header, .header-inner, .nav-inner { width: 100%; max-width: 100%; }
	      .nav, .container, .site-container { width: 100%; max-width: 100%; }
	      .home-container { display: block; padding: 0; }
	      .home-main > *, .home-card { margin-bottom: 0; }
	    }
	  </style>
	  <!-- AdSense: preload + static async (preload scanner picks it up at first byte) -->${ADS_ENABLED ? `
	  <link rel="preload" as="script" crossorigin="anonymous" fetchpriority="high" href="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825">
	  <script async crossorigin="anonymous" fetchpriority="high" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825"></script>` : ''}
	  <!-- LCP 이미지 preload: 광고 스크립트 다음 순서 (광고 우선), 본문 <img>와 동일 URL로 dedupe -->${(() => {
	    const opt = preloadImage && typeof preloadImage === 'object'
	      ? preloadImage
	      : (preloadImage ? { src: String(preloadImage) } : null);
	    const src = (opt && opt.src) || (articleSchema && typeof articleSchema.image === 'string' && articleSchema.image) || '';
	    if (!src) return '';
	    const srcsetAttr = opt && opt.srcset ? ` imagesrcset="${escapeHtmlAttr(opt.srcset)}"` : '';
	    const sizesAttr = opt && opt.sizes ? ` imagesizes="${escapeHtmlAttr(opt.sizes)}"` : '';
	    return `
	  <link rel="preload" as="image" fetchpriority="high" href="${escapeHtmlAttr(src)}"${srcsetAttr}${sizesAttr}>`;
	  })()}
		  <title>${pageTitleText}</title>
  <!-- SEO -->
  <meta name="description" content="${safeDescription}">
  <meta name="keywords" content="${safeKeywords}">
  <meta name="application-name" content="${t('head.gamerscroll')}">
  <meta name="apple-mobile-web-app-title" content="${t('head.gamerscroll')}">
  ${noindex ? '' : `<link rel="canonical" href="${safeCanonical}">`}
  ${alternateLink}${
    // WebSite 스키마는 홈페이지에서만 출력 (구글 권장사항)
    (editionMode ? pagePath === '/' : (canonicalText === 'https://gamerscroll.com' || canonicalText === 'https://gamerscroll.com/')) ? `
  <!-- JSON-LD 구조화 데이터: WebSite (홈페이지 전용) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "${t('head.gamerscroll')}",
    "alternateName": ["${t('head.gamerscroll')}", "${t('head.gamer_scroll')}"],
    "url": "https://gamerscroll.com/",
    "description": ${jsonString(description)},
    "publisher": {
      "@type": "Organization",
      "name": "${t('head.gamerscroll')}",
      "url": "https://gamerscroll.com/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://gamerscroll.com/icon-192.png",
        "width": 192,
        "height": 192
      }
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "${editionMode ? i18n.absoluteUrl(edition.code, '/games/') : 'https://gamerscroll.com/games/'}?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  }
  </script>` : ''
  }${articleJsonLd}${breadcrumbJsonLd}${softwareJsonLd}
  <!-- Open Graph / SNS 공유 -->
  <meta property="og:type" content="${articleSchema ? 'article' : 'website'}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${resolvedOgImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${safeImageAlt}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:site_name" content="${t('head.gamerscroll')}">
  <meta property="og:locale" content="${edition.ogLocale}">${editionMode ? i18n.EDITIONS.filter((e) => e.code !== edition.code).map((e) => `
  <meta property="og:locale:alternate" content="${e.ogLocale}">`).join('') : ''}
  ${articleOgMeta ? `${articleOgMeta}\n  ` : ''}
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${resolvedOgImage}">
  <meta name="twitter:image:alt" content="${safeImageAlt}">
  <meta name="twitter:site" content="@gamerscroll">
  <meta name="twitter:creator" content="@gamerscroll">
  <!-- Theme & Favicon -->
  <meta name="theme-color" content="#ffffff">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png">
  <link rel="manifest" href="/manifest.json">
  <!-- dns-prefetch: preconnect 안 한 도메인용 (광고 도메인 preconnect는 <head> 최상단으로 이동) -->
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="dns-prefetch" href="https://www.gstatic.com">
  <link rel="dns-prefetch" href="https://googleads.g.doubleclick.net">
  <link rel="dns-prefetch" href="https://tpc.googlesyndication.com">
  <link rel="dns-prefetch" href="https://play-lh.googleusercontent.com">
  <link rel="dns-prefetch" href="https://is1-ssl.mzstatic.com">${steamImageHost ? `
  <link rel="dns-prefetch" href="https://${steamImageHost}">` : ''}
	  ${deferredCssInitScript}
	  ${deferredCssGuardStyle}
	  <!-- 메인 CSS -->
	  ${cssLinksHtml}
	  ${lazyImageLoaderScript}
	  <!-- Firebase Analytics (프로덕션만) -->
	  <script>
	    // 페이지뷰 큐 (Firebase 로드 전 이벤트 저장) - 일반 스크립트로 즉시 실행
	    (function() {
	      var host = window.location.hostname;
	      if (host !== 'gamerscroll.com') return;
	      window.__gcPageViewQueue = [];
	      window.__gcLogPageView = function(path) {
	        window.__gcPageViewQueue.push(path);
	      };
	    })();
	  </script>
	  <script type="module">
	    (function() {
	      var host = window.location.hostname;
	      if (host !== 'gamerscroll.com') return;

	      // 페이지 로드 완료 후 Firebase 초기화 (LCP 영향 제거)
	      function initFirebase() {
	        (async function() {
	          try {
	            const [{ initializeApp }, { getAnalytics, logEvent }] = await Promise.all([
	              import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
	              import('https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js')
	            ]);
	          const firebaseConfig = {
	            apiKey: "AIzaSyBn7HyeG6RhNZcWYOTg6_GfRHxuMZOgSTI",
	            authDomain: "gamerscroll-958b4.firebaseapp.com",
	            projectId: "gamerscroll-958b4",
	            storageBucket: "gamerscroll-958b4.firebasestorage.app",
	            messagingSenderId: "529297035305",
	            appId: "1:529297035305:web:a0df9b47d2189ed5d50c38",
	            measurementId: "G-W6SPVQ67NJ"
	          };
	          const app = initializeApp(firebaseConfig);
	          const analytics = getAnalytics(app);

	          // 큐에 쌓인 페이지뷰 처리
	          if (window.__gcPageViewQueue) {
	            window.__gcPageViewQueue.forEach(function(path) {
	              logEvent(analytics, 'page_view', {
	                page_path: path,
	                page_location: window.location.origin + path
	              });
	            });
	          }

	          // 실제 로깅 함수로 교체 (SPA 페이지 전환용, 현재 미사용)
	          window.__gcLogPageView = function(path) {
	            logEvent(analytics, 'page_view', {
	              page_path: path,
	              page_location: window.location.origin + path
	            });
	          };

	          // Firebase 자동 page_view 추적 사용 (getAnalytics 호출 시 자동 전송)
	          } catch (e) {}
	        })();
	      }
	      // 페이지 로드 후 상단 광고 결과(filled/unfilled)가 나오면 실행 (최대 3초 대기):
	      // 분석 스크립트(gtag 포함 약 190KB)가 광고 소재와 대역폭·CPU를 나눠 쓰지 않게 한다.
	      function afterTopAd() {
	        var ad = document.querySelector('ins.adsbygoogle[data-gs-ad-pushed="1"]');
	        if (!ad || ad.getAttribute('data-ad-status')) return initFirebase();
	        var started = false;
	        var observer = new MutationObserver(function() {
	          if (ad.getAttribute('data-ad-status')) start();
	        });
	        function start() {
	          if (started) return;
	          started = true;
	          observer.disconnect();
	          initFirebase();
	        }
	        observer.observe(ad, { attributes: true, attributeFilter: ['data-ad-status'] });
	        setTimeout(start, 3000);
	      }
	      if (document.readyState === 'complete') {
	        setTimeout(afterTopAd, 0);
	      } else {
	        window.addEventListener('load', afterTopAd);
	      }
	    })();
	  </script>`;
}

module.exports = { generateHead };
