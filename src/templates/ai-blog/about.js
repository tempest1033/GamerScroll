/**
 * AIScroll 소개·저자 페이지 (/about/, /ko/about/)
 *
 * 구글 "누가·어떻게·왜" 신호의 착지점: 플랑크톤(Person)와 AIScroll(Organization)을 X 계정과 sameAs로 묶고,
 * 후기·벤치마크·뉴스를 어떤 기준으로 만드는지 밝힌다. 기사 바이라인(rel="author")과 푸터가 이 페이지로 온다.
 */

const { wrapWithLayout, SITE_CONFIG, I18N, escapeHtml } = require('./index');
const { CATEGORY_IDS, categoryLabel, categoryDescription, SITE_X_URL, PERSON_AUTHOR } = require('./taxonomy');

const X_HANDLE = '@' + SITE_X_URL.replace(/^https?:\/\/x\.com\//, '');

const COPY = {
  en: {
    title: 'About AIScroll',
    metaTitle: `About AIScroll and Plankton - ${SITE_CONFIG.name}`,
    description: 'Who writes AIScroll, how each kind of post is made, and how to get in touch.',
    updated: 'Last updated: October 2026',
    sections: [
      ['Who writes this', [
        `AIScroll is a blog run by <strong>Plankton</strong>, a developer in Korea who has built <strong>Mixdog</strong>, a coding agent, along with a range of other software, and creates content with AI. This site is where that experience with AI gets shared. Plankton also runs <a href="https://gamerscroll.com/" rel="noopener" target="_blank">GamerScroll</a>.`,
        `Plankton is on X as <a href="${SITE_X_URL}" rel="me noopener" target="_blank">${X_HANDLE}</a>. Corrections and questions go there.`
      ]],
      ['How each kind of post is made', [
        `<strong>Reviews</strong> cover AI models and tools I have actually used. Each one says how long I used it, for what work, what it cost, and where it fell short. When a comparison leans on official documentation instead of my own use, the post says so.`,
        `<strong>Analysis</strong> posts are deep dives built on sources and data I went through myself. They say what the evidence is and where my own reading starts.`,
        `<strong>Dev Log</strong> posts are notes from building Mixdog, GamerScroll, and this site: what broke, what I tried, and what fixed it.`,
        `<strong>News</strong> covers things I caught early or put together myself, kept short. Claims are checked against the primary source (release notes, filings, official posts), and the sources are linked at the end.`,
        `<strong>Mixdog</strong> posts document the coding agent I build: why it exists, how to use it, and what changed in each update.`,
        `Nothing is placed for payment, and affiliate links, if any, are marked.`
      ]],
    ],
    sectionsHeading: 'Sections'
  },
  ko: {
    title: 'AIScroll 소개',
    metaTitle: `AIScroll과 플랑크톤 소개 - ${SITE_CONFIG.name}`,
    description: 'AIScroll을 누가 쓰는지, 글 종류마다 어떻게 쓰는지, 연락 방법을 밝힙니다.',
    updated: '최종 수정: 2026년 10월',
    sections: [
      ['누가 쓰는가', [
        `AIScroll은 <strong>플랑크톤</strong>이 운영하는 블로그입니다. 코딩 에이전트 <strong>Mixdog</strong>를 비롯해 여러 프로그램을 개발해 온 한국의 개발자로, AI를 활용해 다양한 콘텐츠를 만들고 있습니다. 그 과정에서 얻은 AI 관련 경험을 공유하기 위해 이 사이트에 글을 쓰고 있습니다. <a href="https://gamerscroll.com/" rel="noopener" target="_blank">게이머스크롤</a>도 함께 운영합니다.`,
        `X 계정은 <a href="${SITE_X_URL}" rel="me noopener" target="_blank">${X_HANDLE}</a>입니다. 정정 요청과 문의는 이곳으로 주세요.`
      ]],
      ['글 종류별로 쓰는 방식', [
        `<strong>리뷰</strong>는 실제로 써 본 AI 모델과 도구를 다룹니다. 얼마 동안, 어떤 작업에 썼는지와 비용, 아쉬웠던 점을 적습니다. 직접 써 보지 않고 공식 문서에 기대어 비교한 부분은 그렇다고 밝힙니다.`,
        `<strong>분석</strong>은 자료와 데이터를 직접 파 보고 쓰는 글입니다. 무엇이 근거이고 어디부터가 제 해석인지 구분해서 적습니다.`,
        `<strong>개발일지</strong>는 믹스독, 게이머스크롤, 이 사이트를 만들면서 남기는 기록입니다. 무엇이 깨졌고, 무엇을 해 봤고, 무엇으로 고쳤는지 적습니다.`,
        `<strong>소식</strong>은 먼저 알게 됐거나 직접 정리한 내용을 짧게 전합니다. 1차 자료(릴리스 노트, 공시, 공식 게시물)로 확인하고, 출처를 글 끝에 링크합니다.`,
        `<strong>믹스독</strong>은 직접 만드는 코딩 에이전트의 기록입니다. 만든 이유, 사용법, 업데이트마다 바뀐 점을 적습니다.`,
        `대가를 받고 싣는 글은 없고, 제휴 링크가 있으면 표시합니다.`
      ]],
    ],
    sectionsHeading: '카테고리'
  }
};

function generateAboutPage(lang = 'en') {
  const _lang = lang === 'ko' ? 'ko' : 'en';
  const _p = _lang === 'ko' ? '/ko' : '';
  const t = COPY[_lang];
  const _t = I18N[_lang] || I18N.en;
  const pageUrl = `${SITE_CONFIG.baseUrl}${_p}${PERSON_AUTHOR.path}`;

  const sectionsHtml = t.sections.map(([heading, paragraphs]) => `
            <h2 class="blog-heading">${escapeHtml(heading)}</h2>
            ${paragraphs.map(p => `<p class="blog-paragraph">${p}</p>`).join('\n            ')}`).join('\n');

  const categoryListHtml = CATEGORY_IDS.map(id =>
    `<li><a href="${_p}/article/${id}/">${escapeHtml(categoryLabel(id, _lang))}</a> — ${escapeHtml(categoryDescription(id, _lang))}</li>`
  ).join('\n              ');

  const content = `
    <div class="page-wrap" id="about">
      <article class="prose-page">
        <header class="prose-head">
          <h1 class="blog-title">${escapeHtml(t.title)}</h1>
          <p class="byline"><span class="blog-date">${escapeHtml(t.updated)}</span></p>
        </header>
        <div class="blog-content">
${sectionsHtml}
          <h2 class="blog-heading">${escapeHtml(t.sectionsHeading)}</h2>
          <ul class="blog-list about-category-list">
            ${categoryListHtml}
          </ul>
        </div>
      </article>
    </div>
  `;

  const personId = `${SITE_CONFIG.baseUrl}${PERSON_AUTHOR.path}#editor`;
  const orgId = `${SITE_CONFIG.baseUrl}/#organization`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "name": t.title,
      "description": t.description,
      "inLanguage": _lang === 'ko' ? 'ko-KR' : 'en-US',
      "url": pageUrl,
      "mainEntity": { "@id": personId },
      "isPartOf": { "@type": "WebSite", "name": SITE_CONFIG.name, "url": `${SITE_CONFIG.baseUrl}${_p}/` }
    },
    {
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": personId,
      "name": _lang === 'ko' ? PERSON_AUTHOR.nameKo : PERSON_AUTHOR.name,
      "alternateName": _lang === 'ko' ? PERSON_AUTHOR.name : PERSON_AUTHOR.nameKo,
      "url": `${SITE_CONFIG.baseUrl}${PERSON_AUTHOR.path}`,
      "sameAs": [SITE_X_URL],
      "jobTitle": _lang === 'ko' ? '게임 개발자·편집자' : 'Game developer and editor',
      "worksFor": { "@id": orgId },
      "knowsAbout": ['AI coding agents', 'Mixdog', 'LLM evaluation', 'AI developer tools']
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": orgId,
      "name": SITE_CONFIG.name,
      "url": SITE_CONFIG.baseUrl,
      "sameAs": [SITE_X_URL],
      "founder": { "@id": personId },
      "logo": { "@type": "ImageObject", "url": `${SITE_CONFIG.baseUrl}/icon-192.png`, "width": 192, "height": 192 }
    }
  ];

  return wrapWithLayout(content, {
    title: t.metaTitle,
    description: t.description,
    keywords: _lang === 'ko' ? 'AIScroll 소개, 플랑크톤, 믹스독, 코딩 에이전트 리뷰' : `About AIScroll, Plankton, editorial policy, coding agent reviews, ${_t.categories}`,
    canonical: pageUrl,
    jsonLd,
    currentPage: 'about',
    cssFilenames: ['/styles-core.css', '/styles-article.css'],
    lang: _lang,
    alternates: { en: `${SITE_CONFIG.baseUrl}${PERSON_AUTHOR.path}`, ko: `${SITE_CONFIG.baseUrl}/ko${PERSON_AUTHOR.path}` }
  });
}

module.exports = { generateAboutPage };
