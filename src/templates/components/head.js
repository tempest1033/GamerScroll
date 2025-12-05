/**
 * HTML <head> 컴포넌트
 * SEO 메타, 스타일, 폰트, Firebase Analytics 등
 */

// 광고 표시 여부
const SHOW_ADS = false;

function generateHead(options = {}) {
  const {
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    canonical = 'https://gamerscrawl.com',
    pageData = {}
  } = options;

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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- SEO -->
  <meta name="description" content="${description}">
  <meta name="keywords" content="게임 순위, 모바일 게임, 스팀 순위, 게임 뉴스, 앱스토어 순위, 플레이스토어 순위, 게임 업계, 게임주, 게이머스크롤">
  <link rel="canonical" href="${canonical}">
  <!-- JSON-LD 구조화 데이터 -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "게이머스크롤",
    "alternateName": "GAMERS CRAWL",
    "url": "https://gamerscrawl.com",
    "description": "${description}",
    "publisher": {
      "@type": "Organization",
      "name": "게이머스크롤",
      "url": "https://gamerscrawl.com"
    }
  }
  </script>
  <!-- Open Graph / SNS 공유 -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://gamerscrawl.com/og-image.png">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="게이머스크롤">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://gamerscrawl.com/og-image.png">
  <!-- Theme & Favicon -->
  <meta name="theme-color" content="#f5f7fa" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">
  <link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png">
  <link rel="apple-touch-icon" href="icon-192.png">
  <link rel="shortcut icon" href="favicon-32x32.png">
  <!-- Preconnect -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="preconnect" href="https://play-lh.googleusercontent.com">
  <link rel="preconnect" href="https://is1-ssl.mzstatic.com">
  <link rel="preconnect" href="https://i.ytimg.com">
  <link rel="preconnect" href="https://cdn.cloudflare.steamstatic.com">
  <link rel="preconnect" href="https://www.google.com">
  <!-- Font Preload -->
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-SemiBold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="styles.css">
  <script src="https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
  <!-- Firebase Analytics -->
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
    import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js";
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
  </script>
  ${SHOW_ADS ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825" crossorigin="anonymous"></script>` : ''}
  ${dataScript}`;
}

module.exports = { generateHead, SHOW_ADS };
