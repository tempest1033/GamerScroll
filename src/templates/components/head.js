/**
 * HTML <head> 컴포넌트
 * SEO 메타, 스타일, 폰트, Firebase Analytics 등
 */

function generateHead(options = {}) {
  const {
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    keywords = '게임 순위, 모바일 게임, 스팀 순위, 게임 뉴스, 앱스토어 순위, 플레이스토어 순위, 게임 업계, 게임주, 게이머스크롤',
    canonical = 'https://gamerscrawl.com',
    pageData = {},
    articleSchema = null,  // Article JSON-LD (리포트 페이지용)
    noindex = false,  // 검색엔진 인덱싱 제외 (thin content용)
    ogImage = ''
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
  const canonicalText = normalizeMeta(canonical);
  const safeCanonical = escapeHtmlAttr(canonicalText);
  const isMobileCanonical = canonicalText.startsWith('https://m.gamerscrawl.com');
  const desktopCanonical = canonicalText.replace('https://m.gamerscrawl.com', 'https://gamerscrawl.com');
  const mobileCanonical = canonicalText.replace('https://gamerscrawl.com', 'https://m.gamerscrawl.com');
  const alternateLink = isMobileCanonical
    ? `<link rel="alternate" media="only screen and (min-width: 641px)" href="${escapeHtmlAttr(desktopCanonical)}">`
    : `<link rel="alternate" media="only screen and (max-width: 640px)" href="${escapeHtmlAttr(mobileCanonical)}">`;
  const resolvedOgImage = escapeHtmlAttr(
    (typeof ogImage === 'string' && ogImage) ||
    (articleSchema && typeof articleSchema.image === 'string' && articleSchema.image) ||
    'https://gamerscrawl.com/og-image.png'
  );

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
      "url": "https://gamerscrawl.com/"
    },
    "publisher": {
      "@type": "Organization",
      "name": "게이머스크롤",
      "url": "https://gamerscrawl.com/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://gamerscrawl.com/icon-192.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": ${jsonString(canonicalText)}
    }${articleSchema.image ? `,
    "image": ${jsonString(articleSchema.image)}` : ''}
  }
  </script>` : '';

  // 페이지별 데이터 스크립트는 layout.js에서 main 안에 삽입

  return `
	  <meta charset="UTF-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1.0">${noindex ? `
	  <meta name="robots" content="noindex, follow">` : ''}
	  <!-- Critical CSS: 레이아웃(폭) 선적용 (Auto ads/Side rail 첫 로드 안정화) -->
	  <style>
	    :root { --space-page-x: 16px; }
	    body { margin: 0; }
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
	    @media (max-width: 768px) {
	      body { width: 100%; max-width: 100vw; overscroll-behavior-x: none; }
	      .header, .header-inner, .nav-inner { width: 100%; max-width: 100%; }
	      .nav, .container, .site-container { width: 100%; max-width: 100%; }
	    }
	  </style>
		  <script>
		    (function() {
		      var host = location.hostname;
		      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
		        document.documentElement.classList.add('is-localhost');
		      } else if (host === 'gamerscrawl.com' || host === 'www.gamerscrawl.com') {
		        var ua = navigator.userAgent || '';
		        if (/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
		          location.replace('https://m.gamerscrawl.com' + location.pathname + location.search);
		          return;
		        }
		      }
		    })();
		  </script>
		  <title>${safeTitle}</title>
  <!-- SEO -->
  <meta name="description" content="${safeDescription}">
  <meta name="keywords" content="${safeKeywords}">
  <link rel="canonical" href="${safeCanonical}">
  ${alternateLink}
  <!-- JSON-LD 구조화 데이터 -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "게이머스크롤",
    "alternateName": ["GAMERSCRAWL", "GAMERS CRAWL", "gamerscrawl.com", "게이머스크롤", "게이머 스크롤"],
    "url": "https://gamerscrawl.com/",
    "description": ${jsonString(description)},
    "publisher": {
      "@type": "Organization",
      "name": "게이머스크롤",
      "url": "https://gamerscrawl.com/"
    }
  }
  </script>${articleJsonLd}
  <!-- Open Graph / SNS 공유 -->
  <meta property="og:type" content="${articleSchema ? 'article' : 'website'}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${resolvedOgImage}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:site_name" content="게이머스크롤">
  <meta property="og:locale" content="ko_KR">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${resolvedOgImage}">
  <meta name="twitter:site" content="@gamerscrawl">
  <meta name="twitter:creator" content="@gamerscrawl">
  <!-- Theme & Favicon -->
  <meta name="theme-color" content="#f5f7fa" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png">
  <link rel="manifest" href="/manifest.json">
  <!-- preconnect: AdSense + 광고 요청 + 폰트 CDN -->
  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
  <link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <!-- dns-prefetch: fallback + 이미지 CDN -->
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="preload" href="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825" as="script" crossorigin>
  <link rel="dns-prefetch" href="https://googleads.g.doubleclick.net">
  <link rel="dns-prefetch" href="https://adservice.google.com">
  <link rel="dns-prefetch" href="https://tpc.googlesyndication.com">
  <link rel="dns-prefetch" href="https://cdn.jsdelivr.net">
  <link rel="dns-prefetch" href="https://play-lh.googleusercontent.com">
  <link rel="dns-prefetch" href="https://is1-ssl.mzstatic.com">
  <link rel="dns-prefetch" href="https://i.ytimg.com">
  <link rel="dns-prefetch" href="https://cdn.cloudflare.steamstatic.com">
	  <!-- Prefetch (load 이후, 네트워크 여건이 좋을 때만) -->
	  <script>
	    (function() {
	      var urls = ['/trend/', '/news/', '/community/', '/youtube/', '/rankings/', '/steam/', '/upcoming/', '/metacritic/'];
	      function shouldPrefetch() {
	        var c = navigator.connection;
	        if (!c) return true;
	        if (c.saveData) return false;
	        var type = String(c.effectiveType || '').toLowerCase();
	        if (type.includes('2g')) return false;
	        return true;
	      }
	      function addPrefetch() {
	        if (!shouldPrefetch()) return;
	        for (var i = 0; i < urls.length; i++) {
	          var link = document.createElement('link');
	          link.rel = 'prefetch';
	          link.as = 'document';
	          link.href = urls[i];
	          document.head.appendChild(link);
	        }
	      }
	      window.addEventListener('load', addPrefetch);
	    })();
	  </script>
	  <!-- Font Preload -->
		  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2" as="font" type="font/woff2" crossorigin>
		  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-SemiBold.woff2" as="font" type="font/woff2" crossorigin>
		  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2" as="font" type="font/woff2" crossorigin>
		  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
			  <link rel="stylesheet" href="/styles.css">
	  <!-- AdSense 스크립트 (async 권장) -->
	  <script async fetchpriority="high" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825" crossorigin="anonymous"></script>
		  <script async fetchpriority="low" src="https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
	  <!-- Firebase Analytics (프로덕션만) -->
	  <script>
	    // 페이지뷰 큐 (Firebase 로드 전 이벤트 저장) - 일반 스크립트로 즉시 실행
	    (function() {
	      var host = window.location.hostname;
	      if (host !== 'gamerscrawl.com' && host !== 'm.gamerscrawl.com') return;
	      window.__gcPageViewQueue = [];
	      window.__gcLogPageView = function(path) {
	        window.__gcPageViewQueue.push(path);
	      };
	    })();
	  </script>
	  <script type="module">
	    (function() {
	      var host = window.location.hostname;
	      if (host !== 'gamerscrawl.com' && host !== 'm.gamerscrawl.com') return;

	      (async function() {
	        try {
	          const [{ initializeApp }, { getAnalytics, logEvent }] = await Promise.all([
	            import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
	            import('https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js')
	          ]);
	          const firebaseConfig = {
	            apiKey: "AIzaSyBlVfvAGVrhEEMPKpDKJBrOPF7BINleV7I",
	            authDomain: "gamerscrawl-b104b.firebaseapp.com",
	            projectId: "gamerscrawl-b104b",
	            storageBucket: "gamerscrawl-b104b.firebasestorage.app",
	            messagingSenderId: "831886529376",
	            appId: "1:831886529376:web:2d9f0f64782fa5e5e80405",
	            measurementId: "G-2269FV044J"
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

	          // 실제 로깅 함수로 교체
	          window.__gcLogPageView = function(path) {
	            logEvent(analytics, 'page_view', {
	              page_path: path,
	              page_location: window.location.origin + path
	            });
	          };

	          // 초기 페이지 로드 page_view 전송 (직접 접속 시)
	          logEvent(analytics, 'page_view', {
	            page_path: window.location.pathname,
	            page_location: window.location.href
	          });
	        } catch (e) {}
	      })();
	    })();
	  </script>`;
}

module.exports = { generateHead };
