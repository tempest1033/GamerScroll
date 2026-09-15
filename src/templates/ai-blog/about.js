/**
 * AIScroll 소개·저자 페이지 (/about/, /ko/about/)
 *
 * 구글 "누가·어떻게·왜" 신호의 착지점: Editor J(Person)와 AIScroll(Organization)을 X 계정과 sameAs로 묶고,
 * 후기·벤치마크·뉴스를 어떤 기준으로 만드는지 밝힌다. 기사 바이라인(rel="author")과 푸터가 이 페이지로 온다.
 */

const { wrapWithLayout, SITE_CONFIG, I18N, escapeHtml } = require('./index');
const { CATEGORY_IDS, categoryLabel, categoryDescription, SITE_X_URL, PERSON_AUTHOR } = require('./taxonomy');

const X_HANDLE = '@' + SITE_X_URL.replace(/^https?:\/\/x\.com\//, '');

const COPY = {
  en: {
    title: 'About AIScroll',
    metaTitle: `About AIScroll and Editor J - ${SITE_CONFIG.name}`,
    description: 'Who runs AIScroll, how reviews and benchmarks are produced, and how to reach the editor.',
    updated: 'Last updated: September 2026',
    sections: [
      ['Who writes this', [
        `AIScroll is a blog run by <strong>Editor J</strong> (pen name), a developer in Korea who has built <strong>Mixdog</strong>, a coding agent, along with a range of other software, and creates content with AI. This site is where that experience with AI gets shared. Editor J also runs <a href="https://gamerscroll.com/" rel="noopener" target="_blank">GamerScroll</a>.`,
        `Editor J is on X as <a href="${SITE_X_URL}" rel="me noopener" target="_blank">${X_HANDLE}</a>. Corrections and questions go there.`
      ]],
      ['How each type of article is made', [
        `<strong>Reviews</strong> cover hands-on use, comparisons, evaluations, and recommendations for AI models and tools. Hands-on articles state the usage period, tasks, costs, and limitations. Comparisons based on official documentation or release notes identify those sources and do not claim first-hand experience.`,
        `<strong>Benchmarks</strong> are measured on the editor's own machine with the method, harness, and run count written into the article. Numbers quoted from vendor announcements or public leaderboards are labeled as such and never mixed with our own runs.`,
        `<strong>Guides</strong> carry an as-of date and are revised in place when tools change, instead of being republished as new posts.`,
        `<strong>News</strong> is checked against the primary source (release notes, filings, official posts) before publication, and the sources are linked at the end of each piece.`,
        `<strong>Hot Picks</strong> cover sales, special offers, free giveaways, and limited-time events. General tool recommendations belong in Reviews. Nothing is placed for payment, and affiliate links, if any, are marked.`
      ]],
    ],
    sectionsHeading: 'Sections'
  },
  ko: {
    title: 'AIScroll 소개',
    metaTitle: `AIScroll과 Editor J 소개 - ${SITE_CONFIG.name}`,
    description: 'AIScroll을 누가 운영하는지, 후기와 벤치마크를 어떻게 만드는지, 연락 방법을 밝힙니다.',
    updated: '최종 수정: 2026년 9월',
    sections: [
      ['누가 쓰는가', [
        `AIScroll은 <strong>Editor J</strong>(필명)가 운영하는 블로그입니다. 코딩 에이전트 <strong>Mixdog</strong>를 비롯해 여러 프로그램을 개발해 온 한국의 개발자로, AI를 활용해 다양한 콘텐츠를 만들고 있습니다. 그 과정에서 얻은 AI 관련 경험을 공유하기 위해 이 사이트에 글을 쓰고 있습니다. <a href="https://gamerscroll.com/" rel="noopener" target="_blank">게이머스크롤</a>도 함께 운영합니다.`,
        `X 계정은 <a href="${SITE_X_URL}" rel="me noopener" target="_blank">${X_HANDLE}</a>입니다. 정정 요청과 문의는 이곳으로 주세요.`
      ]],
      ['글 종류별 제작 기준', [
        `<strong>리뷰</strong>는 AI 모델·도구의 사용기·비교·평가·추천을 다룹니다. 실사용 글에는 사용 기간과 작업, 비용과 한계를 적습니다. 공식 문서·릴리스 기록에 기반한 비교는 출처를 밝히며 직접 사용한 경험처럼 표현하지 않습니다.`,
        `<strong>벤치마크</strong>는 편집자 소유 장비에서 직접 측정하고, 방법·하네스·실행 횟수를 본문에 씁니다. 공식 발표나 공개 리더보드 수치는 출처를 표시하고 자체 측정값과 섞지 않습니다.`,
        `<strong>가이드</strong>는 기준 시점을 밝히고, 도구가 바뀌면 새 글을 내는 대신 같은 글을 고칩니다.`,
        `<strong>뉴스</strong>는 발행 전 1차 자료(릴리스 노트, 공시, 공식 게시물)로 확인하고, 출처를 글 끝에 링크합니다.`,
        `<strong>핫픽</strong>은 할인·특가·무료 배포·기간 한정 이벤트를 다룹니다. 일반적인 도구 추천은 리뷰로 분류합니다. 대가를 받고 싣는 항목은 없고, 제휴 링크가 있으면 표시합니다.`
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
    <section class="home-section active" id="about">
      <article class="page-container issue-container">
        <div class="blog-card">
          <header class="blog-header">
            <h1 class="blog-title">${escapeHtml(t.title)}</h1>
            <div class="blog-meta">
              <time class="blog-date">${escapeHtml(t.updated)}</time>
            </div>
          </header>
          <div class="blog-content">
${sectionsHtml}
            <h2 class="blog-heading">${escapeHtml(t.sectionsHeading)}</h2>
            <ul class="blog-list about-category-list">
              ${categoryListHtml}
            </ul>
          </div>
        </div>
      </article>
    </section>
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
      "name": PERSON_AUTHOR.name,
      "url": `${SITE_CONFIG.baseUrl}${PERSON_AUTHOR.path}`,
      "sameAs": [SITE_X_URL],
      "jobTitle": _lang === 'ko' ? '게임 개발자·편집자' : 'Game developer and editor',
      "worksFor": { "@id": orgId },
      "knowsAbout": ['AI coding agents', 'LLM benchmarks', 'Claude', 'Codex', 'Terminal-Bench']
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
    keywords: _lang === 'ko' ? 'AIScroll 소개, Editor J, 제작 기준, 코딩 에이전트 후기' : `About AIScroll, Editor J, editorial policy, coding agent reviews, ${_t.categories}`,
    canonical: pageUrl,
    jsonLd,
    lang: _lang,
    alternates: { en: `${SITE_CONFIG.baseUrl}${PERSON_AUTHOR.path}`, ko: `${SITE_CONFIG.baseUrl}/ko${PERSON_AUTHOR.path}` }
  });
}

module.exports = { generateAboutPage };
