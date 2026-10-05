// AIScroll 분류 체계 (2026-10 개인 블로그로 전환)
//
// 카테고리(URL /article/<id>/) = 글 종류 5개: 리뷰 · 분석 · 개발일지 · 소식 · 믹스독.
// 나누는 기준은 글의 근거다: 직접 써 봤으면 리뷰, 자료·데이터를 파 봤으면 분석, 만들다 겪었으면 개발일지, 먼저 알게 된 일을 전하면 소식. 주제(회사·도구)는 topics 태그로 두고
// /topic/<id>/ 페이지가 모아 보여준다. 글 하나 = 카테고리 1개 + topics 여러 개.
// 없어진 카테고리(guides/benchmarks/hot, 더 옛 회사 기준 분류)는 LEGACY_CATEGORY_REDIRECTS로 301.

const CATEGORY_IDS = ['reviews', 'analysis', 'devlog', 'news', 'mixdog'];
const DEFAULT_CATEGORY = 'news';

const CATEGORY_LABELS = {
  en: { reviews: 'Reviews', analysis: 'Analysis', devlog: 'Dev Log', news: 'News', mixdog: 'Mixdog' },
  ko: { reviews: '리뷰', analysis: '분석', devlog: '개발일지', news: '소식', mixdog: '믹스독' }
};

// 카테고리 페이지 <title>·description 용 설명 (언어별)
const CATEGORY_DESCRIPTIONS = {
  en: {
    reviews: 'AI models and tools I paid for and used myself: what worked, what did not, and what I kept.',
    analysis: 'Deep dives built on sources and data I dug through myself: why something happened and where it is heading.',
    devlog: 'Notes from building things with AI: where I got stuck and how I got out.',
    news: 'AI news I caught early or put together myself, kept short.',
    mixdog: 'Mixdog, the coding agent I build and use: why it exists, how to use it, and what changed.'
  },
  ko: {
    reviews: '직접 돈 내고 써 본 AI 모델과 도구. 좋았던 것, 아쉬웠던 것, 계속 쓰는 것을 적습니다.',
    analysis: '자료와 데이터를 직접 파 보고 쓰는 심층 분석. 왜 그런지, 어디로 가는지를 다룹니다.',
    devlog: 'AI로 무언가를 만들면서 막힌 곳과 풀어낸 방법을 적는 기록.',
    news: '먼저 알게 됐거나 직접 정리한 AI 소식을 짧게 전합니다.',
    mixdog: '직접 만들어 쓰는 코딩 에이전트 믹스독. 만든 이유와 사용법, 바뀐 점을 기록합니다.'
  }
};

// 주제 태그. 여기 없는 topics 값은 무시된다 (오타·임의 태그로 빈 페이지가 생기지 않게).
const TOPIC_LABELS = {
  en: {
    vibecoding: 'Vibe Coding',
    'coding-agents': 'Coding Agents',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI',
    meta: 'Meta',
    'china-ai': 'China AI',
    pricing: 'Pricing & Limits',
    industry: 'Industry'
  },
  ko: {
    vibecoding: '바이브코딩',
    'coding-agents': '코딩 에이전트',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI',
    meta: 'Meta',
    'china-ai': '중국 AI',
    pricing: '요금·한도',
    industry: '산업'
  }
};

// 상단 내비에 카테고리와 나란히 두는 대표 주제 (지금은 없음: 메뉴는 글 종류 4개뿐)
const NAV_TOPIC_IDS = [];

// 옛 카테고리 URL → 새 URL (EN·KO 양쪽에 같은 규칙 적용)
const LEGACY_CATEGORY_REDIRECTS = {
  guides: '/article/reviews/',
  benchmarks: '/article/reviews/',
  hot: '/article/news/',
  general: '/article/news/',
  ai: '/article/news/',
  'ai-tools': '/article/news/',
  openai: '/topic/openai/',
  google: '/topic/google/',
  anthropic: '/topic/anthropic/',
  vibecoding: '/topic/vibecoding/'
};

// 저자. 모든 카테고리가 사람(필명 플랑크톤 / Plankton)으로 통일. JSON의 author 필드로 글 단위 재지정: "site" → Organization, 그 외 문자열 → Person 이름.
const SITE_X_URL = 'https://x.com/aiscroll_io';
const PERSON_AUTHOR = { name: 'Plankton', nameKo: '플랑크톤', path: '/about/' };
function personName(lang = 'en') { return lang === 'ko' ? PERSON_AUTHOR.nameKo : PERSON_AUTHOR.name; }
const ORG_AUTHOR_CATEGORIES = new Set();

function normalizeLang(lang) { return lang === 'ko' ? 'ko' : 'en'; }

// 기본은 한·영. 한국어 전용은 기사에 명시된 옵션으로만 선택한다.
function publicationLanguages(article = {}) {
  const languages = article.publishLanguages;
  if (languages === undefined) return ['en', 'ko'];
  if (!Array.isArray(languages) || !languages.includes('ko') ||
      languages.some(lang => lang !== 'en' && lang !== 'ko') ||
      new Set(languages).size !== languages.length) {
    throw new Error('publishLanguages must be ["ko"] or ["en", "ko"]');
  }
  return ['en', 'ko'].filter(lang => languages.includes(lang));
}

function articlePublicationUrls(article, baseUrl = 'https://aiscroll.io') {
  return Object.fromEntries(publicationLanguages(article).map(lang => [
    lang,
    `${baseUrl}${lang === 'ko' ? '/ko' : ''}/article/${normalizeCategory(article.category)}/${article.slug}/`
  ]));
}

function normalizeCategory(category) {
  return CATEGORY_IDS.includes(category) ? category : DEFAULT_CATEGORY;
}

function categoryLabel(id, lang = 'en') {
  const labels = CATEGORY_LABELS[normalizeLang(lang)];
  return labels[id] || labels[DEFAULT_CATEGORY];
}

function categoryDescription(id, lang = 'en') {
  const descriptions = CATEGORY_DESCRIPTIONS[normalizeLang(lang)];
  return descriptions[id] || descriptions[DEFAULT_CATEGORY];
}

function isTopic(id) { return Object.prototype.hasOwnProperty.call(TOPIC_LABELS.en, id); }

function topicLabel(id, lang = 'en') {
  return TOPIC_LABELS[normalizeLang(lang)][id] || TOPIC_LABELS.en[id] || String(id);
}

// 기사 JSON의 topics 배열에서 등록된 주제만, 중복 없이
function topicsOf(article) {
  const raw = Array.isArray(article && article.topics) ? article.topics : [];
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const id = String(t || '').trim().toLowerCase();
    if (!id || seen.has(id) || !isTopic(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// 기사 목록에서 주제별 개수 (NAV 주제는 0건이어도 포함)
function countTopics(articles) {
  const counts = {};
  for (const id of NAV_TOPIC_IDS) counts[id] = 0;
  for (const a of articles || []) {
    for (const id of topicsOf(a)) counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

function countCategories(articles) {
  const counts = {};
  for (const id of CATEGORY_IDS) counts[id] = 0;
  for (const a of articles || []) counts[normalizeCategory(a && a.category)] += 1;
  return counts;
}

// { type: 'Person'|'Organization', name, url?, sameAs }
function authorOf(article, siteName = 'AIScroll', baseUrl = 'https://aiscroll.io', lang = 'en') {
  const explicit = article && typeof article.author === 'string' ? article.author.trim() : '';
  const category = normalizeCategory(article && article.category);
  const useOrg = explicit === 'site' || (!explicit && ORG_AUTHOR_CATEGORIES.has(category));
  if (useOrg) {
    return { type: 'Organization', name: siteName, url: baseUrl, sameAs: [SITE_X_URL] };
  }
  const name = explicit || (article && article.editor) || personName(lang);
  return { type: 'Person', name, url: `${baseUrl}${PERSON_AUTHOR.path}`, path: PERSON_AUTHOR.path, sameAs: [SITE_X_URL] };
}

module.exports = {
  CATEGORY_IDS,
  DEFAULT_CATEGORY,
  CATEGORY_LABELS,
  TOPIC_LABELS,
  NAV_TOPIC_IDS,
  LEGACY_CATEGORY_REDIRECTS,
  SITE_X_URL,
  PERSON_AUTHOR,
  personName,
  normalizeCategory,
  publicationLanguages,
  articlePublicationUrls,
  categoryLabel,
  categoryDescription,
  isTopic,
  topicLabel,
  topicsOf,
  countTopics,
  countCategories,
  authorOf
};
