/**
 * HTML <head> 컴포넌트
 * SEO 메타, 스타일, 폰트, Firebase Analytics 등
 */

// 광고 배너 슬롯 표시 여부
const SHOW_ADS = true;

// AdSense 스크립트 로드 여부 (심사용/연결용)
// - 자동광고(Auto ads)는 AdSense 콘솔에서 별도로 OFF 권장
// - 슬롯(SHOW_ADS)은 계속 OFF 유지 가능
const LOAD_ADSENSE_SCRIPT = true;

function generateHead(options = {}) {
  const {
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    keywords = '게임 순위, 모바일 게임, 스팀 순위, 게임 뉴스, 앱스토어 순위, 플레이스토어 순위, 게임 업계, 게임주, 게이머스크롤',
    canonical = 'https://gamerscrawl.com',
    pageData = {},
    articleSchema = null,  // Article JSON-LD (리포트 페이지용)
    noindex = false  // 검색엔진 인덱싱 제외 (thin content용)
  } = options;

  // Article JSON-LD 생성 (리포트 페이지용)
  const articleJsonLd = articleSchema ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${articleSchema.headline || title}",
    "description": "${articleSchema.description || description}",
    "datePublished": "${articleSchema.datePublished}",
    ${articleSchema.dateModified ? `"dateModified": "${articleSchema.dateModified}",` : ''}
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
      "@id": "${canonical}"
    }${articleSchema.image ? `,
    "image": "${articleSchema.image}"` : ''}
  }
  </script>` : '';

  // 페이지별 데이터 스크립트 (필요한 경우에만)
  const dataScript = pageData.news || pageData.community || pageData.youtube || pageData.chzzk ? `
  <script>
    ${pageData.news ? `const allNewsData = ${JSON.stringify(pageData.news)};` : ''}
    ${pageData.community ? `const allCommunityData = ${JSON.stringify(pageData.community)};` : ''}
    ${pageData.youtube ? `const allYoutubeData = ${JSON.stringify(pageData.youtube)};` : ''}
    ${pageData.chzzk ? `const allChzzkData = ${JSON.stringify(pageData.chzzk)};` : ''}
  </script>` : '';

  return `
	  <meta charset="UTF-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1.0">${noindex ? `
	  <meta name="robots" content="noindex, nofollow">` : ''}
	  <script>
	    (function() {
	      var host = location.hostname;
	      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
	        document.documentElement.classList.add('is-localhost');
	      }
	    })();
	  </script>
	  <script>
	    (function() {
	      function getCurrentAdIns() {
	        var script = document.currentScript;
	        if (!script) return null;
	        var ins = script.previousElementSibling;
	        if (!ins || !ins.classList || !ins.classList.contains('adsbygoogle')) return null;
	        return ins;
	      }

	      window.gcAdsensePush = function() {
	        try {
	          var ins = getCurrentAdIns();
	          if (!ins) return;

	          // display:none(PC/모바일 전용) 상태면 availableWidth=0 에러가 날 수 있어 스킵
	          if ((ins.offsetWidth || 0) <= 0) return;

	          (adsbygoogle = window.adsbygoogle || []).push({});
	        } catch (e) {}
	      };
	    })();
	  </script>
	  <title>${title}</title>
  <!-- SEO -->
  <meta name="description" content="${description}">
  <meta name="keywords" content="${keywords}">
  <link rel="canonical" href="${canonical}">
  <!-- JSON-LD 구조화 데이터 -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "게이머스크롤",
    "alternateName": ["GAMERSCRAWL", "GAMERS CRAWL", "gamerscrawl.com", "게이머스크롤", "게이머 스크롤"],
    "url": "https://gamerscrawl.com/",
    "description": "${description}",
    "publisher": {
      "@type": "Organization",
      "name": "게이머스크롤",
      "url": "https://gamerscrawl.com/"
    }
  }
  </script>${articleJsonLd}
  <!-- Open Graph / SNS 공유 -->
  <meta property="og:type" content="${articleSchema ? 'article' : 'website'}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://gamerscrawl.com/og-image.png">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="게이머스크롤">
  <meta property="og:locale" content="ko_KR">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://gamerscrawl.com/og-image.png">
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
  <!-- AdSense 최우선 로드 -->
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="dns-prefetch" href="https://googleads.g.doubleclick.net">
  <link rel="dns-prefetch" href="https://adservice.google.com">
  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
  <link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin>
  <link rel="preconnect" href="https://adservice.google.com" crossorigin>
  ${LOAD_ADSENSE_SCRIPT ? `<link rel="preload" href="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825" as="script" crossorigin>` : ''}
  <!-- Preconnect (이미지/기타) -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="preconnect" href="https://play-lh.googleusercontent.com">
  <link rel="preconnect" href="https://is1-ssl.mzstatic.com">
  <link rel="preconnect" href="https://i.ytimg.com">
	  <link rel="preconnect" href="https://cdn.cloudflare.steamstatic.com">
	  <link rel="preconnect" href="https://www.google.com">
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
  <!-- AdSense 스크립트 (CSS 직후 최우선 로드) -->
  ${LOAD_ADSENSE_SCRIPT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825" crossorigin="anonymous"></script>` : ''}
	  <script async src="https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
	  <!-- Firebase Analytics (프로덕션만) -->
	  <script type="module">
	    (function() {
	      if (window.location.hostname !== 'gamerscrawl.com') return;

	      var init = async function() {
	        try {
	          const [{ initializeApp }, { getAnalytics }] = await Promise.all([
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
	          getAnalytics(app);
	        } catch (e) {}
	      };

	      if ('requestIdleCallback' in window) {
	        requestIdleCallback(function() { init(); }, { timeout: 2000 });
	      } else {
	        setTimeout(function() { init(); }, 0);
	      }
	    })();
	  </script>
	  ${dataScript}`;
}

module.exports = { generateHead, SHOW_ADS, LOAD_ADSENSE_SCRIPT };
