/**
 * HTML <head> 컴포넌트
 * SEO 메타, 스타일, 폰트, Firebase Analytics 등
 */

function generateHead(options = {}) {
  const {
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    keywords = '게임 순위, 모바일 게임, 스팀 순위, 게임 뉴스, 앱스토어 순위, 플레이스토어 순위, 게임 업계, 게임주, 게이머스크롤',
    canonical = 'https://gamerscroll.com',
    pageData = {},
    articleSchema = null,  // Article JSON-LD (리포트 페이지용)
    breadcrumbs = null,  // BreadcrumbList JSON-LD [{name, url}]
    softwareSchema = null,  // SoftwareApplication JSON-LD (게임 페이지용) {name, description, image, operatingSystem, applicationCategory, aggregateRating}
    noindex = false,  // 검색엔진 인덱싱 제외 (thin content용)
    ogImage = '',
    preloadImages = [],
    cssFilename = '/styles.css'  // 해시 기반 CSS 파일명
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

  const safeTitle = escapeHtmlText(title);
  const safeDescription = escapeHtmlAttr(description);
  const safeKeywords = escapeHtmlAttr(keywords || '');
  const keywordTags = articleSchema && keywords
    ? String(keywords).split(',').map(tag => normalizeMeta(tag)).filter(Boolean).slice(0, 6)
    : [];
  const canonicalText = normalizeMeta(canonical);
  const safeCanonical = escapeHtmlAttr(canonicalText);
  const normalizeToCanonical = (value) => normalizeMeta(value || '');
  const schemaCanonical = normalizeToCanonical(canonicalText);
  const schemaBreadcrumbs = breadcrumbs && breadcrumbs.length > 0
    ? breadcrumbs.map(item => ({ ...item, url: normalizeToCanonical(item.url) }))
    : null;
  const alternateLink = '';
  const resolvedOgImage = escapeHtmlAttr(
    (typeof ogImage === 'string' && ogImage) ||
    (articleSchema && typeof articleSchema.image === 'string' && articleSchema.image) ||
    'https://gamerscroll.com/og-image.png'
  );
  const safeImageAlt = safeTitle;
  const preloadImageList = Array.isArray(preloadImages) ? preloadImages : [];
  const preloadUrls = [...new Set(preloadImageList.map(item => normalizeMeta(item)).filter(Boolean))].slice(0, 3);
  const preloadLinks = preloadUrls.length > 0
    ? preloadUrls.map((url, index) =>
      `<link rel="preload" as="image" href="${escapeHtmlAttr(url)}"${index === 0 ? ' fetchpriority="high"' : ''}>`
    ).join('\n  ')
    : '';
  const articleOgMeta = articleSchema ? [
    articleSchema.datePublished ? `<meta property="article:published_time" content="${escapeHtmlAttr(articleSchema.datePublished)}">` : '',
    articleSchema.dateModified ? `<meta property="article:modified_time" content="${escapeHtmlAttr(articleSchema.dateModified)}">` : '',
    `<meta property="article:section" content="게임">`,
    `<meta property="article:author" content="게이머스크롤">`,
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
    "datePublished": ${jsonString(articleSchema.datePublished)},
    ${articleSchema.dateModified ? `"dateModified": ${jsonString(articleSchema.dateModified)},` : ''}
    "author": {
      "@type": "Organization",
      "name": "게이머스크롤",
      "url": "https://gamerscroll.com/"
    },
    "publisher": {
      "@type": "Organization",
      "name": "게이머스크롤",
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
	  <meta name="viewport" content="width=device-width, initial-scale=1.0">${noindex ? `
	  <meta name="robots" content="noindex, follow">` : ''}
	  <!-- Critical CSS: 레이아웃 선적용 (CLS 방지) -->
	  <style>
	    :root { --space-page-x: 16px; --space-block-gap: 20px; --space-block-y: 24px; }
	    body { margin: 0; visibility: hidden; }
	    .home-trend-card-image { background: transparent !important; }
	    :is(.site-container, .container) {
	      max-width: 1190px;
	      margin: 0 auto;
	      padding-left: var(--space-page-x);
	      padding-right: var(--space-page-x);
	      box-sizing: border-box;
	    }
	    .header-inner {
	      max-width: 1190px;
	      margin: 0 auto;
	      padding: 0 16px;
	      box-sizing: border-box;
	    }
	    .nav-inner {
	      max-width: 1190px;
	      margin: 0 auto;
	      padding: 0 var(--space-page-x);
	      box-sizing: border-box;
	    }
	    .home-container {
	      display: grid;
	      grid-template-columns: 1fr 300px;
	      gap: var(--space-block-gap);
	      padding: var(--space-block-y) 0;
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
	  <!-- AdSense: 최상단 로드 (광고 빠른 렌더링) -->
	  <script>
	    (function() {
	      var s = document.createElement('script');
	      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825';
	      s.async = true;
	      s.crossOrigin = 'anonymous';
	      s.fetchPriority = 'high';
	      s.onload = function() {
	        window.__adsenseReady = true;
	        window.dispatchEvent(new Event('adsenseReady'));
	      };
	      document.head.appendChild(s);
	    })();
	  </script>
		  <title>${safeTitle}</title>
  <!-- SEO -->
  <meta name="description" content="${safeDescription}">
  <meta name="keywords" content="${safeKeywords}">
  <meta name="application-name" content="게이머스크롤">
  <meta name="apple-mobile-web-app-title" content="게이머스크롤">
  <link rel="canonical" href="${safeCanonical}">
  ${alternateLink}
  <link rel="alternate" type="application/rss+xml" title="게이머스크롤 RSS" href="https://gamerscroll.com/rss.xml">${
    // WebSite 스키마는 홈페이지에서만 출력 (구글 권장사항)
    (canonicalText === 'https://gamerscroll.com' || canonicalText === 'https://gamerscroll.com/') ? `
  <!-- JSON-LD 구조화 데이터: WebSite (홈페이지 전용) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "게이머스크롤",
    "alternateName": ["게이머스크롤", "게이머 스크롤"],
    "url": "https://gamerscroll.com/",
    "description": ${jsonString(description)},
    "publisher": {
      "@type": "Organization",
      "name": "게이머스크롤",
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
        "urlTemplate": "https://gamerscroll.com/games/?q={search_term_string}"
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
  <meta property="og:image:alt" content="${safeImageAlt}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:site_name" content="게이머스크롤">
  <meta property="og:locale" content="ko_KR">
  ${articleOgMeta ? `${articleOgMeta}\n  ` : ''}
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${resolvedOgImage}">
  <meta name="twitter:image:alt" content="${safeImageAlt}">
  <meta name="twitter:site" content="@gamerscroll">
  <meta name="twitter:creator" content="@gamerscroll">
  ${preloadLinks ? `${preloadLinks}\n  ` : ''}
  <!-- Theme & Favicon -->
  <meta name="theme-color" content="#f5f7fa" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png">
  <link rel="manifest" href="/manifest.json">
  <!-- preconnect: 핵심 도메인 4개 (PageSpeed 권고) -->
  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
  <link rel="preconnect" href="https://www.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://ep1.adtrafficquality.google" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <!-- dns-prefetch: fallback + 추가 도메인 -->
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="dns-prefetch" href="https://www.gstatic.com">
  <link rel="dns-prefetch" href="https://ep1.adtrafficquality.google">
  <link rel="dns-prefetch" href="https://cdn.jsdelivr.net">
  <link rel="dns-prefetch" href="https://googleads.g.doubleclick.net">
  <link rel="dns-prefetch" href="https://wsrv.nl">
  <link rel="dns-prefetch" href="https://adservice.google.com">
  <link rel="dns-prefetch" href="https://tpc.googlesyndication.com">
  <link rel="dns-prefetch" href="https://www.googletagservices.com">
  <link rel="dns-prefetch" href="https://unpkg.com">
  <link rel="dns-prefetch" href="https://play-lh.googleusercontent.com">
  <link rel="dns-prefetch" href="https://is1-ssl.mzstatic.com">
  <link rel="dns-prefetch" href="https://i.ytimg.com">
  <link rel="dns-prefetch" href="https://cdn.cloudflare.steamstatic.com">
	  <!-- 폰트 CSS: Pretendard Variable (단일 woff2) -->
	  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
	  <noscript><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable.css"></noscript>
	  <!-- 메인 CSS -->
	  <link rel="stylesheet" href="${cssFilename}">
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
	      // 페이지 로드 완료 후 실행
	      if (document.readyState === 'complete') {
	        setTimeout(initFirebase, 0);
	      } else {
	        window.addEventListener('load', initFirebase);
	      }
	    })();
	  </script>`;
}

module.exports = { generateHead };
