// AIScroll 분류 체계 (2026-09 재출발)
//
// 카테고리(URL /article/<id>/) = 글 종류 5개. 주제(회사·도구·바이브코딩)는 topics 태그로 두고
// /topic/<id>/ 페이지가 모아 보여준다. 글 하나 = 카테고리 1개 + topics 여러 개.
// 옛 회사 기준 카테고리(general/openai/google/anthropic/vibecoding/ai/ai-tools)는 LEGACY_CATEGORY_REDIRECTS로 301.

const CATEGORY_IDS = ['news', 'reviews', 'guides', 'benchmarks', 'hot'];
const DEFAULT_CATEGORY = 'news';

const CATEGORY_LABELS = {
  en: { news: 'News', reviews: 'Reviews', guides: 'Guides', benchmarks: 'Benchmarks', hot: 'Hot Picks' },
  ko: { news: '뉴스', reviews: '후기', guides: '가이드', benchmarks: '벤치마크', hot: '핫픽' }
};

// 카테고리 페이지 <title>·description 용 설명 (언어별)
const CATEGORY_DESCRIPTIONS = {
  en: {
    news: 'AI model launches, pricing changes, and industry moves, checked against primary sources.',
    reviews: 'Hands-on reviews of AI models and coding agents from paid subscriptions the editor actually uses.',
    guides: 'Install and setup guides for coding agents, kept current with a stated as-of date.',
    benchmarks: 'Terminal-Bench and coding-agent results measured on our own hardware, with methodology.',
    hot: 'Deals, free credits, limit resets, and tools worth grabbing this week.'
  },
  ko: {
    news: 'AI 모델 출시, 요금 변경, 업계 동향을 1차 자료로 확인해 정리한 뉴스.',
    reviews: '편집자가 실제 결제해 쓰는 AI 모델·코딩 에이전트의 실사용 후기.',
    guides: '코딩 에이전트 설치·설정 가이드. 기준 시점을 밝히고 계속 갱신합니다.',
    benchmarks: '자체 하드웨어에서 직접 측정한 Terminal-Bench·코딩 에이전트 결과와 방법론.',
    hot: '할인, 무료 크레딧, 한도 리셋, 이번 주 잡을 만한 도구.'
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

// 상단 내비에 카테고리와 나란히 두는 대표 주제 (글이 0건이어도 페이지를 만든다)
const NAV_TOPIC_IDS = ['vibecoding'];

// 옛 카테고리 URL → 새 URL (EN·KO 양쪽에 같은 규칙 적용)
const LEGACY_CATEGORY_REDIRECTS = {
  general: '/article/news/',
  ai: '/article/news/',
  'ai-tools': '/article/news/',
  openai: '/topic/openai/',
  google: '/topic/google/',
  anthropic: '/topic/anthropic/',
  vibecoding: '/topic/vibecoding/'
};

// 저자. 후기·가이드·뉴스는 사람(Editor J), 순위·벤치마크·핫픽처럼 집계 방법론이 저자인 글은 사이트(Organization).
// JSON의 author 필드로 글 단위 재지정: "site" → Organization, 그 외 문자열 → Person 이름.
const SITE_X_URL = 'https://x.com/aiscroll_io';
const PERSON_AUTHOR = { name: 'Editor J', path: '/about/' };
const ORG_AUTHOR_CATEGORIES = new Set(['benchmarks', 'hot']);

function normalizeLang(lang) { return lang === 'ko' ? 'ko' : 'en'; }

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
function authorOf(article, siteName = 'AIScroll', baseUrl = 'https://aiscroll.io') {
  const explicit = article && typeof article.author === 'string' ? article.author.trim() : '';
  const category = normalizeCategory(article && article.category);
  const useOrg = explicit === 'site' || (!explicit && ORG_AUTHOR_CATEGORIES.has(category));
  if (useOrg) {
    return { type: 'Organization', name: siteName, url: baseUrl, sameAs: [SITE_X_URL] };
  }
  const name = explicit || (article && article.editor) || PERSON_AUTHOR.name;
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
  normalizeCategory,
  categoryLabel,
  categoryDescription,
  isTopic,
  topicLabel,
  topicsOf,
  countTopics,
  countCategories,
  authorOf
};
