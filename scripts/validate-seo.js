#!/usr/bin/env node
/**
 * validate-seo.js
 *
 * Run lighthouse SEO audit + structural HTML checks against an article URL,
 * emit a binary PASS/FAIL report aligned with the gamerscroll-article SKILL
 * "Final consistency check" (step 5) invariants.
 *
 * Usage:
 *   node scripts/validate-seo.js <url> [<url> ...]
 *
 * Exit code: 0 if every check passes, 1 if any FAIL.
 *
 * Note: image hotlink (wsrv proxy) and caption<->image semantic match are
 * intentionally NOT covered here; they live in scripts/validate-thumbnails.js
 * and human review respectively.
 */

// Pin every native thread pool BEFORE any module that may load onnxruntime-node
// or OpenMP-backed BLAS. These vars are read once at library init, so setting
// them after `require('@huggingface/transformers')` has no effect.
for (const k of ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'OMP_THREAD_LIMIT', 'ORT_NUM_THREADS']) {
  if (!process.env[k]) process.env[k] = '1';
}
if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '2';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const axios = require('axios');
const cheerio = require('cheerio');

// --- Orphaned headless-Chrome reaper -------------------------------------
// Lighthouse launches headless Chrome via chrome-launcher. When this process
// is killed mid-run (e.g. an external tool-call timeout firing during the
// blocking spawnSync below), that Chrome is orphaned and piles up across runs
// until it saturates the machine. We reap only automation Chrome — processes
// carrying BOTH --headless and a remote-debugging-port — so any interactive
// Chrome the user has open is never touched.
function reapLighthouseChrome() {
  try {
    if (process.platform === 'win32') {
      spawnSync('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
        "Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match 'remote-debugging-port' } | " +
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"],
        { timeout: 15000, windowsHide: true, stdio: 'ignore' });
    } else {
      spawnSync('pkill', ['-f', 'headless.*remote-debugging-port'], { timeout: 15000, stdio: 'ignore' });
    }
  } catch (_) { /* best-effort cleanup, never fatal */ }
}

// Sweep orphans left by earlier runs before we start, and guarantee our own
// Chrome is reaped however this process ends.
reapLighthouseChrome();
let _reaped = false;
function _finalReap() { if (_reaped) return; _reaped = true; reapLighthouseChrome(); }
process.on('exit', _finalReap);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { _finalReap(); process.exit(130); });
}
process.on('uncaughtException', (err) => { _finalReap(); console.error(err); process.exit(1); });
// ------------------------------------------------------------------------

const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const MORPH_SCRIPT = path.join(__dirname, 'morph_analyze.py');

// Yoast keyphrase density (noWordForms preset, applies to Korean).
// Source: yoast/wordpress-seo packages/yoastseo/src/scoring/assessments/seo/KeywordDensityAssessment.js
const DENSITY_MIN = 0.005; // 0.5 %
const DENSITY_MAX = 0.030; // 3.0 %
// Korean publication-style readability defaults.
const READ_SENTENCE_CHARS_MAX = 120;
const READ_PARAGRAPH_SENTENCES_MAX = 7;
// English sentences run far longer per character than Korean, so the char cap
// above only applies to Korean bodies; English is capped by word count instead.
const READ_SENTENCE_WORDS_MAX = 45;
// Google SERP truncation thresholds for Korean characters.
const TITLE_CHARS_MIN = 15;
const TITLE_CHARS_MAX = 60;
const DESC_CHARS_MIN = 80;
const DESC_CHARS_MAX = 160;
// Title vs H1 noun-overlap ratio for page consistency.
const TITLE_H1_OVERLAP_MIN = 0.50;
// Yoast keyphrase length: noFunctionWords preset (Korean falls here).
// recommendedMaximum=6, acceptableMaximum=9. Source: KeyphraseLengthAssessment.js
const KEYPHRASE_NOUNS_RECOMMENDED_MAX = 6;
const KEYPHRASE_NOUNS_ACCEPTABLE_MAX = 9;
// Yoast SubHeadingsKeyword: matched / total_h2 must fall inside [lower, upper].
// Below = topic underweighted. Above = stuffing in headings.
// Source: SubHeadingsKeywordAssessment.js (lowerBoundary 0.3, upperBoundary 0.75).
const SUBHEADING_LOWER_BOUNDARY = 0.30;
const SUBHEADING_UPPER_BOUNDARY = 0.75;
// Yoast keyphrase distribution: distractionPercentage = longest run of body
// paragraphs without any keyphrase match / total paragraphs * 100.
// <=30 GOOD, <=50 OK, >50 BAD. Source: KeyphraseDistributionAssessment.js
const DISTRIBUTION_OK_MAX_PERCENTAGE = 50;

// Article-type profiles. Ranking articles get longer body & section budget;
// in turn they require a higher minimum word count.
const PROFILES = {
  default: {
    h2SectionCharsMax: 2500,
    bodyCharsMin: 600,
  },
  ranking: {
    h2SectionCharsMax: 5000,
    bodyCharsMin: 1500,
  },
};

function articleType(url) {
  let pathname = '';
  try { pathname = new URL(url).pathname; } catch { return 'default'; }
  if (/\/magazine\/ranking\//.test(pathname) || /\/ranking\//.test(pathname)) return 'ranking';
  return 'default';
}

function profileFor(url) {
  return PROFILES[articleType(url)] || PROFILES.default;
}

const LIGHTHOUSE_AUDITS = [
  // SEO category
  'document-title',
  'meta-description',
  'http-status-code',
  'link-text',
  'crawlable-anchors',
  'is-crawlable',
  'image-alt',
  'hreflang',
  'canonical',
  'robots-txt',
  'font-size',
  'tap-targets',
  // Accessibility category (subset most relevant to SEO + content quality)
  'color-contrast',
  'link-name',
  'aria-allowed-attr',
  'aria-required-attr',
  'aria-roles',
  'aria-valid-attr',
  'button-name',
  'duplicate-id-aria',
  'heading-order',
  'html-has-lang',
  'html-lang-valid',
  'list',
  'meta-viewport',
  'object-alt',
  'valid-lang',
];

function runLighthouse(url) {
  const tmp = path.join(os.tmpdir(), `lh-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  // SEO + Accessibility together. Accessibility catches alt-text, contrast,
  // ARIA label, and link-name issues that Google increasingly factors into
  // SERP ranking. Performance/best-practices stay out (heavier audit, separate
  // concern from publishing-time validation).
  const args = [
    url,
    // Only the audits we actually score, so Lighthouse skips the rest of the
    // SEO/a11y categories and the extra gatherers they would pull in.
    `--only-audits=${LIGHTHOUSE_AUDITS.join(',')}`,
    '--output=json',
    `--output-path=${tmp}`,
    '--quiet',
    '--throttling-method=provided',
    '--max-wait-for-load=12000',
    '--disable-full-page-screenshot',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --renderer-process-limit=1 --js-flags=--single-threaded --disable-extensions --disable-background-networking --disable-sync --metrics-recording-only --no-first-run --mute-audio',
  ];
  const result = spawnSync('lighthouse', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' },
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString().slice(-400);
    throw new Error(`lighthouse exit ${result.status}: ${stderr}`);
  }
  const json = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
  return json;
}

function lighthouseChecks(lhr) {
  const out = [];
  for (const id of LIGHTHOUSE_AUDITS) {
    const audit = lhr.audits[id];
    if (!audit) continue;
    const score = audit.score;
    const isManual = audit.scoreDisplayMode === 'manual' || audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'informative';
    if (isManual || score === null) continue;
    let detail = '';
    if (score < 1) {
      detail = audit.title || '';
      // Extract failing selectors from the audit details so the report points
      // at the actual offending element instead of the generic title.
      const items = audit.details && Array.isArray(audit.details.items) ? audit.details.items : [];
      const samples = [];
      for (const item of items.slice(0, 3)) {
        const node = item.node || item.subItems?.items?.[0]?.relatedNode;
        const sel = node?.selector || node?.snippet || item.selector || item.url || '';
        if (sel) samples.push(typeof sel === 'string' ? sel.slice(0, 100) : '');
      }
      if (samples.length) detail += ` -- ${samples.join(' | ')}${items.length > 3 ? ` (+${items.length - 3})` : ''}`;
    }
    out.push({ name: `lighthouse/${id}`, pass: score >= 1, detail });
  }
  return out;
}

async function fetchHtml(url) {
  const res = await axios.get(url, { responseType: 'text', timeout: 15000, validateStatus: () => true });
  if (res.status !== 200) throw new Error(`GET ${url} -> ${res.status}`);
  return res.data;
}

function parseJsonLd($) {
  const blocks = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const txt = $(el).contents().text();
    try { blocks.push(JSON.parse(txt)); }
    catch { blocks.push(null); }
  });
  return blocks;
}

function jsonLdHasType(blocks, typeName) {
  for (const b of blocks) {
    if (!b) continue;
    const items = Array.isArray(b) ? b : [b];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const t = item['@type'];
      if (t === typeName) return true;
      if (Array.isArray(t) && t.includes(typeName)) return true;
      if (item['@graph']) {
        for (const g of item['@graph']) {
          const gt = g && g['@type'];
          if (gt === typeName) return true;
          if (Array.isArray(gt) && gt.includes(typeName)) return true;
        }
      }
    }
  }
  return false;
}

// Schema.org Article rich-result requires headline, image, datePublished,
// author. Returns { found, missing } for the first Article-typed node found
// across all JSON-LD blocks (including nested @graph entries).
function jsonLdArticleFields(blocks) {
  const required = ['headline', 'image', 'datePublished', 'author'];
  for (const b of blocks) {
    if (!b) continue;
    const items = Array.isArray(b) ? b : [b];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const t = item['@type'];
      const isArticle = t === 'Article' || (Array.isArray(t) && t.includes('Article'));
      if (isArticle) return { found: true, missing: required.filter((f) => !item[f]) };
      if (item['@graph']) {
        for (const g of item['@graph']) {
          if (!g || typeof g !== 'object') continue;
          const gt = g['@type'];
          const ga = gt === 'Article' || (Array.isArray(gt) && gt.includes('Article'));
          if (ga) return { found: true, missing: required.filter((f) => !g[f]) };
        }
      }
    }
  }
  return { found: false, missing: required };
}

function structuralChecks(html, url) {
  const $ = cheerio.load(html);
  const checks = [];

  const title = $('head > title').text().trim();
  const titleLen = title.length;
  const titleOk = titleLen >= TITLE_CHARS_MIN && titleLen <= TITLE_CHARS_MAX;
  checks.push({
    name: 'meta/title',
    pass: titleOk,
    detail: titleLen === 0 ? '(empty)' : `${titleLen} chars (target ${TITLE_CHARS_MIN}-${TITLE_CHARS_MAX})${titleOk ? '' : ' OUT OF RANGE'} -- ${title}`,
  });

  const desc = $('meta[name="description"]').attr('content') || '';
  const descLen = desc.trim().length;
  const descOk = descLen >= DESC_CHARS_MIN && descLen <= DESC_CHARS_MAX;
  checks.push({
    name: 'meta/description',
    pass: descOk,
    detail: descLen === 0 ? '(empty)' : `${descLen} chars (target ${DESC_CHARS_MIN}-${DESC_CHARS_MAX})${descOk ? '' : ' OUT OF RANGE'}`,
  });

  const keywords = $('meta[name="keywords"]').attr('content') || '';
  checks.push({ name: 'meta/keywords', pass: keywords.trim().length > 0, detail: keywords ? `${keywords.split(',').length} keys` : '(empty)' });

  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const expectedPath = new URL(url).pathname;
  const canonicalOk = canonical.length > 0 && canonical.startsWith('https://') && canonical.endsWith(expectedPath);
  checks.push({
    name: 'meta/canonical',
    pass: canonicalOk,
    detail: canonical
      ? `${canonical}${canonical.startsWith('https://') ? '' : ' -- must start with https://'}${canonical.endsWith(expectedPath) ? '' : ' -- path mismatch'}`
      : '(empty)',
  });

  const ogPairs = [
    ['og:title', $('meta[property="og:title"]').attr('content') || ''],
    ['og:description', $('meta[property="og:description"]').attr('content') || ''],
    ['og:image', $('meta[property="og:image"]').attr('content') || ''],
    ['og:image:width', $('meta[property="og:image:width"]').attr('content') || ''],
    ['og:image:height', $('meta[property="og:image:height"]').attr('content') || ''],
  ];
  for (const [k, v] of ogPairs) {
    let pass;
    if (k === 'og:image:width') pass = v === '1200';
    else if (k === 'og:image:height') pass = v === '630';
    else pass = v.trim().length > 0;
    checks.push({ name: `meta/${k}`, pass, detail: v || '(empty)' });
  }

  const twCard = $('meta[name="twitter:card"]').attr('content') || '';
  checks.push({ name: 'meta/twitter:card', pass: twCard.trim().length > 0, detail: twCard || '(empty)' });

  const ldBlocks = parseJsonLd($);
  const parsedAll = ldBlocks.length > 0 && ldBlocks.every((b) => b !== null);
  checks.push({ name: 'jsonld/parses', pass: parsedAll, detail: `${ldBlocks.length} blocks, ${ldBlocks.filter((b) => b === null).length} broken` });
  checks.push({ name: 'jsonld/Article', pass: jsonLdHasType(ldBlocks, 'Article'), detail: '' });
  checks.push({ name: 'jsonld/BreadcrumbList', pass: jsonLdHasType(ldBlocks, 'BreadcrumbList'), detail: '' });

  // Schema.org Article required fields. Google's Article rich-result spec
  // expects headline + image + datePublished + author for valid markup.
  const articleFields = jsonLdArticleFields(ldBlocks);
  if (articleFields.found) {
    checks.push({
      name: 'jsonld/Article-fields',
      pass: articleFields.missing.length === 0,
      detail: articleFields.missing.length === 0
        ? 'headline + author + datePublished + image present'
        : `missing: ${articleFields.missing.join(', ')}`,
    });
  }

  const headings = $('h2.blog-heading');
  const headingTexts = headings.map((_i, el) => $(el).text().trim()).get();
  const dupHeadings = headingTexts.filter((t, i, arr) => arr.indexOf(t) !== i);
  checks.push({
    name: 'body/h2-unique',
    pass: dupHeadings.length === 0 && headingTexts.length > 0,
    detail: dupHeadings.length ? `dup: ${[...new Set(dupHeadings)].join(' | ')}` : `${headingTexts.length} headings`,
  });

  // Yoast SingleH1: the article body should contain exactly one H1 (or zero
  // when the H1 is templated outside <article>). Multiple H1s split topic
  // signal across the page.
  const articleRoot = $('article').first().length ? $('article').first() : $('main').first();
  const h1Count = articleRoot.find('h1').length;
  checks.push({
    name: 'body/single-h1',
    pass: h1Count <= 1,
    detail: `${h1Count} h1 in article body${h1Count > 1 ? ' -- multiple H1 dilutes topic signal' : ''}`,
  });

  // Hero figure (the very first .blog-figure in the article) is intentionally
  // captionless by design — it functions as a key-visual masthead, not an
  // inline figure. Inline body images still require alt + figcaption.
  const blogImages = $('img.blog-image').toArray();
  const heroEl = $('figure.blog-figure').first().get(0);
  const inlineImages = blogImages.filter((el) => {
    if (!heroEl) return true;
    return $(el).closest('figure.blog-figure').get(0) !== heroEl;
  });
  const imgFail = [];
  for (const el of inlineImages) {
    const $el = $(el);
    const alt = ($el.attr('alt') || '').trim();
    const $parent = $el.parent();
    const figcap = $parent.find('figcaption, .blog-image-caption').text().trim() ||
                   $parent.next('figcaption, .blog-image-caption').text().trim() ||
                   $el.next('figcaption, .blog-image-caption').text().trim();
    if (!alt || !figcap) {
      imgFail.push({ src: $el.attr('src') || '(no src)', alt: !!alt, cap: !!figcap });
    }
  }
  checks.push({
    name: 'body/img-alt+caption',
    pass: imgFail.length === 0 && inlineImages.length > 0,
    detail: imgFail.length
      ? `${imgFail.length}/${inlineImages.length} fail (e.g. ${imgFail[0].src.slice(-60)})`
      : `${inlineImages.length} inline images OK (hero exempt)`,
  });

  // Yoast TextImages: at least one image (or media) in the body. Articles
  // without any image read as low-effort and have weak time-on-page.
  // recommendedCount=1. Source: yoast TextImagesAssessment.js (file is named
  // ImageCountAssessment.js but exports TextImagesAssessment).
  const totalImages = blogImages.length;
  checks.push({
    name: 'body/has-image',
    pass: totalImages >= 1,
    detail: totalImages === 0 ? '0 images in body -- add at least 1 image' : `${totalImages} images (hero + ${inlineImages.length} inline)`,
  });

  return { checks, $ };
}

async function internalLinkCheck($, baseUrl) {
  const internalPathRe = /^(?:\/ko)?\/(?:games|article|wiki|tech|magazine)\//;
  const hrefs = new Set();
  $('article a[href], .blog-content a[href], main a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (internalPathRe.test(href)) hrefs.add(href);
  });
  const base = new URL(baseUrl);
  const broken = [];
  for (const href of hrefs) {
    const target = new URL(href, base).toString();
    try {
      const r = await axios.get(target, { timeout: 8000, validateStatus: () => true, maxRedirects: 5 });
      if (r.status !== 200) broken.push(`${href} -> ${r.status}`);
    } catch (e) {
      broken.push(`${href} -> ERR`);
    }
  }
  return {
    name: 'body/internal-links',
    pass: broken.length === 0,
    detail: broken.length ? broken.slice(0, 3).join('; ') + (broken.length > 3 ? ` (+${broken.length - 3})` : '') : `${hrefs.size} links OK`,
  };
}

// Yoast OutboundLinks 4-tier scoring:
//   - 0 links            -> bad   (no citation, weakest credibility signal)
//   - all nofollow       -> okay  (citation visible to readers but no SEO weight)
//   - some nofollow      -> good  (mixed signal, Google still trusts the dofollow ones)
//   - all dofollow       -> best  (full credibility signal)
// Source: yoast OutboundLinksAssessment.js
function outboundLinkCheck($, baseUrl) {
  const baseHost = (() => { try { return new URL(baseUrl).hostname; } catch { return ''; } })();
  const body = $('.blog-content').first().length ? $('.blog-content').first() : ($('article').first().length ? $('article').first() : $('main').first());
  let total = 0;
  let nofollow = 0;
  body.find('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    let host = '';
    try { host = new URL(href).hostname; } catch { return; }
    if (!host || host === baseHost) return;
    total++;
    const rel = ($(el).attr('rel') || '').toLowerCase();
    if (rel.split(/\s+/).includes('nofollow')) nofollow++;
  });
  const dofollow = total - nofollow;
  let pass, detail;
  if (total === 0) {
    pass = false;
    detail = '0 outbound links -- add citation links to source material';
  } else if (nofollow === total) {
    pass = false;
    detail = `${total} outbound, ALL nofollow -- weak credibility signal (Google ignores rel=nofollow as a citation vote)`;
  } else if (nofollow > 0) {
    pass = true;
    detail = `${total} outbound (${dofollow} dofollow, ${nofollow} nofollow) -- mixed signal OK`;
  } else {
    pass = true;
    detail = `${total} outbound, all dofollow -- strong credibility signal`;
  }
  return { name: 'body/outbound-links', pass, detail };
}

// Yoast InternalLinks 4-tier scoring (mirror of outbound logic).
//   - 0 internal links   -> bad   (orphans the article from the site graph)
//   - all nofollow       -> okay
//   - some nofollow      -> good
//   - all dofollow       -> best
// Source: yoast InternalLinksAssessment.js
function internalLinkScoring($, baseUrl) {
  const baseHost = (() => { try { return new URL(baseUrl).hostname; } catch { return ''; } })();
  const internalPathRe = /^(?:\/ko)?\/(?:games|article|wiki|tech|magazine)\//;
  const body = $('.blog-content').first().length ? $('.blog-content').first() : ($('article').first().length ? $('article').first() : $('main').first());
  let total = 0;
  let nofollow = 0;
  body.find('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    let isInternal = false;
    if (internalPathRe.test(href)) {
      isInternal = true;
    } else if (/^https?:\/\//i.test(href)) {
      try { isInternal = new URL(href).hostname === baseHost; } catch {}
    }
    if (!isInternal) return;
    total++;
    const rel = ($(el).attr('rel') || '').toLowerCase();
    if (rel.split(/\s+/).includes('nofollow')) nofollow++;
  });
  const dofollow = total - nofollow;
  let pass, detail;
  if (total === 0) {
    pass = false;
    detail = '0 internal links -- article is orphaned from the site graph';
  } else if (nofollow === total) {
    pass = false;
    detail = `${total} internal, ALL nofollow -- internal nofollow is a strong anti-pattern`;
  } else if (nofollow > 0) {
    pass = true;
    detail = `${total} internal (${dofollow} dofollow, ${nofollow} nofollow)`;
  } else {
    pass = true;
    detail = `${total} internal, all dofollow`;
  }
  return { name: 'body/internal-link-quality', pass, detail };
}

// SKILL.md HARD RULE: every body image and the og:image thumbnail must return
// 200 with non-trivial size through the wsrv.nl proxy. Some upstream hosts
// silently 404 through the proxy even when the direct URL serves fine; size
// <=79 bytes is the wsrv silent-empty signature.
function shortHost(u) {
  try {
    const p = new URL(u);
    return p.hostname + p.pathname.slice(0, 30);
  } catch { return u.slice(0, 50); }
}

async function imageHotlinkCheck($) {
  const urls = new Set();
  const og = $('meta[property="og:image"]').attr('content');
  if (og && /^https?:\/\//i.test(og)) urls.add(og);
  $('img.blog-image').each((_i, el) => {
    const src = $(el).attr('src');
    if (src && /^https?:\/\//i.test(src)) urls.add(src);
  });
  if (urls.size === 0) return { name: 'body/image-hotlink', pass: true, detail: '0 images to check' };
  const fails = [];
  // Limit concurrency to avoid hammering wsrv from one validator run.
  const arr = Array.from(urls);
  const concurrency = 5;
  let idx = 0;
  async function worker() {
    while (idx < arr.length) {
      const my = idx++;
      const url = arr[my];
      try {
        const r = await axios.get(url, { timeout: 12000, responseType: 'arraybuffer', validateStatus: () => true, maxRedirects: 5 });
        const size = r.data?.byteLength ?? 0;
        if (r.status !== 200) fails.push(`${shortHost(url)} -> ${r.status}`);
        else if (size <= 79) fails.push(`${shortHost(url)} -> empty (${size}B, wsrv silent 404)`);
      } catch (e) {
        fails.push(`${shortHost(url)} -> ERR`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, arr.length) }, () => worker()));
  return {
    name: 'body/image-hotlink',
    pass: fails.length === 0,
    detail: fails.length
      ? fails.slice(0, 3).join('; ') + (fails.length > 3 ? ` (+${fails.length - 3})` : '')
      : `${urls.size} images all 200`,
  };
}

// Yoast TextCompetingLinks: zero INTERNAL link anchors should match a
// declared keyphrase. An internal anchor that uses your own keyphrase routes
// ranking signal away from this article toward the linked one (self-canni-
// balization). External citations are exempt — they cannot cannibalize.
function competingLinkCheck($, keyphrases, kpNounLists, baseUrl) {
  if (keyphrases.length === 0 || !kpNounLists) {
    return { name: 'body/competing-links', pass: true, detail: 'no keyphrase declared (skipped)' };
  }
  const baseHost = (() => { try { return new URL(baseUrl).hostname; } catch { return ''; } })();
  const internalPathRe = /^(?:\/ko)?\/(?:games|article|wiki|tech|magazine)\//;
  // Restrict to the actual article body (.blog-content). The <article> element
  // also wraps the sidebar (categories, related cards), and those navigation
  // anchors are not in-body keyphrase competition.
  const body = $('.blog-content').first().length ? $('.blog-content').first() : ($('article').first().length ? $('article').first() : $('main').first());
  const competing = [];
  body.find('a[href]').each((_i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (!text || !href) return;
    // Card / nav / image-wrapper anchors wrap a heading or thumbnail — those
    // are layout, not in-body keyphrase links.
    const isCardLike = $(el).find('img, h1, h2, h3').length > 0;
    if (isCardLike) return;
    // Internal-only: same-host absolute URL, or relative URL hitting one of
    // our article path prefixes. External citations are skipped.
    let isInternal = false;
    if (internalPathRe.test(href)) {
      isInternal = true;
    } else if (/^https?:\/\//i.test(href)) {
      try { isInternal = new URL(href).hostname === baseHost; } catch {}
    }
    if (!isInternal) return;
    const lower = text.toLowerCase();
    for (let i = 0; i < kpNounLists.length; i++) {
      const kn = kpNounLists[i];
      if (kn.length === 0) continue;
      const matched = kn.filter((n) => lower.includes(n)).length;
      const required = kn.length === 1 ? 1 : Math.ceil(kn.length * 0.5);
      if (matched >= required) {
        competing.push(`"${text.slice(0, 40)}" -> ${href}`);
        break;
      }
    }
  });
  return {
    name: 'body/competing-links',
    pass: competing.length === 0,
    detail: competing.length === 0
      ? `0 internal anchors match keyphrase`
      : `${competing.length} self-cannibalizing anchors -- e.g. ${competing.slice(0, 2).join('; ')}`,
  };
}

function morphAnalyze(texts) {
  if (!texts || texts.length === 0) return [];
  const result = spawnSync(PYTHON_BIN, [MORPH_SCRIPT], {
    input: Buffer.from(JSON.stringify({ texts }), 'utf8'),
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = (result.stderr || Buffer.alloc(0)).toString('utf8').slice(-400);
    throw new Error(`morph_analyze.py exit ${result.status}: ${err}`);
  }
  const json = JSON.parse(result.stdout.toString('utf8'));
  return json.results || [];
}

function extractContentBlocks($) {
  // Scope to the article body (.blog-content). The <article> element also wraps
  // the sidebar (related cards) and the sources list, whose <p>/<li> would
  // otherwise inflate word/sentence/paragraph counts and register spurious long
  // "sentences" (e.g. a period-less source title).
  const root = $('.blog-content').first().length
    ? $('.blog-content').first()
    : ($('article').first().length ? $('article').first() : $('main').first());
  const intro = root.find('p').first().text().trim();
  const h2Texts = root.find('h2.blog-heading').map((_i, el) => $(el).text().trim()).get();
  const altTexts = root.find('img.blog-image').map((_i, el) => ($(el).attr('alt') || '').trim()).get().filter(Boolean);
  const bodyParas = root.find('p, li').map((_i, el) => $(el).text().trim()).get().filter((t) => t.length >= 20);
  return { intro, h2Texts, altTexts, bodyParas };
}

function extractKeyphrases($) {
  const raw = $('meta[name="keywords"]').attr('content') || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function findFailures(perKeyphraseFlags, keyphrases) {
  const failed = [];
  for (let i = 0; i < keyphrases.length; i++) {
    if (!perKeyphraseFlags[i]) failed.push(keyphrases[i]);
  }
  return failed;
}

// Keyphrase passes a slot when at least KEYPHRASE_OVERLAP of its noun tokens are
// present in the slot's noun set. Single-noun keyphrases require 100% match.
const KEYPHRASE_OVERLAP = 0.50;

function nounSet(morphResult) {
  const s = new Set();
  for (const n of (morphResult?.nouns) || []) s.add(String(n).toLowerCase());
  return s;
}

function keyphraseMatches(kpNouns, slotNounSet) {
  if (kpNouns.length === 0) return false;
  const matched = kpNouns.filter((n) => slotNounSet.has(n)).length;
  const required = kpNouns.length === 1 ? 1 : Math.ceil(kpNouns.length * KEYPHRASE_OVERLAP);
  return matched >= required;
}

// Per Google guidance, meta keywords are ignored for ranking and title/desc
// should be unique + descriptive (not stuffed with the keyword list). We do
// NOT enforce keyphrase-in-title/desc — those rules incentivise keyword
// stuffing. Instead we verify that every declared keyphrase is covered
// somewhere in the body (title-level coverage is the writer's craft, not a
// validator's call).
// Single Kiwi spawn for the whole run: every text the content checks need is
// analyzed in one batch. Kiwi init costs ~2s per spawn, so this collapses what
// used to be 3 separate morphAnalyze() calls (keyphrase nouns, morph checks,
// surface checks) into one. Returns the per-slot noun sets / morph each consumes.
function buildMorphData($, keyphrases) {
  const blocks = extractContentBlocks($);
  const titleText = $('head > title').text().trim();
  const root = $('article').first().length ? $('article').first() : $('main').first();
  const h1Text = root.find('h1.blog-title, h1').first().text().trim();
  const bodyJoined = blocks.bodyParas.join('\n');

  const texts = [];
  const at = (s) => texts.push(s) - 1;
  const iTitle = at(titleText);
  const iH1 = at(h1Text);
  const iH2 = blocks.h2Texts.map(at);
  const iAlt = blocks.altTexts.map(at);
  const iBody = blocks.bodyParas.map(at);
  const iJoined = at(bodyJoined);
  const iKp = keyphrases.map(at);

  const morph = morphAnalyze(texts);
  const empty = { nouns: [], sentences: [], token_count: 0 };
  return {
    blocks,
    bodyJoined,
    titleNouns: nounSet(morph[iTitle]),
    h1Nouns: nounSet(morph[iH1]),
    h2NounSets: iH2.map((i) => nounSet(morph[i])),
    altNounSets: iAlt.map((i) => nounSet(morph[i])),
    bodyNounSets: iBody.map((i) => nounSet(morph[i])),
    bodyJoinedMorph: morph[iJoined] || empty,
    kpMorphs: iKp.map((i) => morph[i] || empty),
    kpNounLists: iKp.map((i) => ((morph[i]?.nouns) || []).map((n) => n.toLowerCase())),
  };
}

function contentMorphChecks(keyphrases, profile, md) {
  if (keyphrases.length === 0) {
    return [{ name: 'content/keyphrases-present', pass: false, detail: 'meta keywords empty' }];
  }
  const { blocks, titleNouns, h1Nouns, h2NounSets, altNounSets, bodyNounSets, kpNounLists } = md;

  const flagsH2 = kpNounLists.map((kn) => h2NounSets.some((ns) => keyphraseMatches(kn, ns)));
  const flagsAlt = kpNounLists.map((kn) => altNounSets.length > 0 && altNounSets.some((ns) => keyphraseMatches(kn, ns)));
  const flagsBody = kpNounLists.map((kn) => bodyNounSets.some((ns) => keyphraseMatches(kn, ns)));

  // Yoast distractionPercentage: longest run of consecutive body paragraphs
  // without any keyphrase match, expressed as % of all body paragraphs.
  const bodyHasKeyphrase = bodyNounSets.map((ns) => kpNounLists.some((kn) => keyphraseMatches(kn, ns)));
  let maxRun = 0, currentRun = 0;
  for (const flag of bodyHasKeyphrase) {
    if (!flag) { currentRun++; if (currentRun > maxRun) maxRun = currentRun; }
    else currentRun = 0;
  }
  const distractionPct = bodyHasKeyphrase.length === 0 ? 100 : (maxRun / bodyHasKeyphrase.length) * 100;

  function bodyCoverageSummary(flags, label) {
    const passCount = flags.filter(Boolean).length;
    const ratio = passCount / keyphrases.length;
    const failed = findFailures(flags, keyphrases);
    const pass = ratio >= 1.0;
    const detail = `${passCount}/${keyphrases.length} (${(ratio * 100).toFixed(0)}%)` +
      (failed.length ? ` -- miss: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ` (+${failed.length - 3})` : ''}` : '');
    return { name: `content/keyphrase-${label}`, pass, detail };
  }

  // Yoast SubHeadings: matched_h2 / total_h2 must fall inside [lower, upper].
  // Below = topic underweighted in headings. Above = stuffing.
  // Short-text exemption: if the body itself is short (<600 chars, ~Yoast 300 word
  // recommendedMaximumLength), subheading keyword matching is not required at
  // all. Yoast labels this "goodShortTextNoSubheadings".
  const bodyTotalChars = blocks.bodyParas.reduce((a, p) => a + p.length, 0);
  function boundaryCheck(flags, label, totalSlots) {
    if (totalSlots === 0) {
      // No slots and short body = OK; no slots and long body = topic missing markers.
      const ok = bodyTotalChars < 600;
      return {
        name: `content/keyphrase-${label}`,
        pass: ok,
        detail: ok ? 'no slot, short body (exempt)' : `no slot in long body (${bodyTotalChars} chars)`,
      };
    }
    const matchedSlots = (label === 'in-subheading' ? h2NounSets : altNounSets).filter(
      (ns) => kpNounLists.some((kn) => keyphraseMatches(kn, ns))
    ).length;
    if (bodyTotalChars < 600 && matchedSlots === 0) {
      return {
        name: `content/keyphrase-${label}`,
        pass: true,
        detail: `0/${totalSlots} but body short (${bodyTotalChars} chars, exempt)`,
      };
    }
    // A single slot can only score 0% or 100% -- the 30-75% band is
    // mathematically unreachable, so a lone image/subheading is exempt from
    // the band check (matches the SKILL.md parity rule, where a 3-section
    // article carries exactly one even-section body image). Having or omitting
    // the keyphrase in a single alt is neither "too few" nor "stuffing".
    if (totalSlots === 1) {
      return {
        name: `content/keyphrase-${label}`,
        pass: true,
        detail: `${matchedSlots}/1 slot -- single slot, band check exempt`,
      };
    }
    const ratio = matchedSlots / totalSlots;
    const pass = ratio >= SUBHEADING_LOWER_BOUNDARY && ratio <= SUBHEADING_UPPER_BOUNDARY;
    const reason = ratio < SUBHEADING_LOWER_BOUNDARY ? 'too few' : ratio > SUBHEADING_UPPER_BOUNDARY ? 'too many (stuffing)' : 'in band';
    return {
      name: `content/keyphrase-${label}`,
      pass,
      detail: `${matchedSlots}/${totalSlots} slots (${(ratio * 100).toFixed(0)}%, target ${(SUBHEADING_LOWER_BOUNDARY * 100).toFixed(0)}-${(SUBHEADING_UPPER_BOUNDARY * 100).toFixed(0)}%) -- ${reason}`,
    };
  }

  // Yoast keyphrase length: warn when any keyphrase exceeds the recommended
  // noun count, fail when it crosses the acceptable cap. Long-tail keyphrases
  // are an authoring problem (not a coverage problem) per Yoast guidance.
  const tooLong = [];
  const wayTooLong = [];
  for (let i = 0; i < keyphrases.length; i++) {
    const n = kpNounLists[i].length;
    if (n > KEYPHRASE_NOUNS_ACCEPTABLE_MAX) wayTooLong.push(`${keyphrases[i]} (${n})`);
    else if (n > KEYPHRASE_NOUNS_RECOMMENDED_MAX) tooLong.push(`${keyphrases[i]} (${n})`);
  }
  const lengthCheck = {
    name: 'content/keyphrase-length',
    pass: wayTooLong.length === 0,
    detail: wayTooLong.length
      ? `${wayTooLong.length} too long (>${KEYPHRASE_NOUNS_ACCEPTABLE_MAX} nouns): ${wayTooLong.slice(0, 3).join(', ')}${wayTooLong.length > 3 ? ` (+${wayTooLong.length - 3})` : ''}`
      : tooLong.length
        ? `OK with ${tooLong.length} borderline (>${KEYPHRASE_NOUNS_RECOMMENDED_MAX} nouns): ${tooLong.slice(0, 3).join(', ')}${tooLong.length > 3 ? ` (+${tooLong.length - 3})` : ''}`
        : `all ${keyphrases.length} keyphrases <= ${KEYPHRASE_NOUNS_RECOMMENDED_MAX} nouns`,
  };

  const distributionCheck = {
    name: 'content/keyphrase-distribution',
    pass: distractionPct <= DISTRIBUTION_OK_MAX_PERCENTAGE,
    detail: `distraction ${distractionPct.toFixed(0)}% (max ${DISTRIBUTION_OK_MAX_PERCENTAGE}% acceptable)`,
  };

  // Title vs H1 consistency: page should declare the same topic in both.
  let titleH1Check;
  if (titleNouns.size === 0 || h1Nouns.size === 0) {
    titleH1Check = { name: 'content/title-h1-match', pass: false, detail: titleNouns.size === 0 ? 'title empty' : 'h1 empty' };
  } else {
    const titleArr = Array.from(titleNouns);
    const h1Arr = Array.from(h1Nouns);
    const intersect = titleArr.filter((n) => h1Nouns.has(n)).length;
    const overlap = intersect / Math.max(titleArr.length, h1Arr.length);
    titleH1Check = {
      name: 'content/title-h1-match',
      pass: overlap >= TITLE_H1_OVERLAP_MIN,
      detail: `noun overlap ${(overlap * 100).toFixed(0)}% (>= ${(TITLE_H1_OVERLAP_MIN * 100).toFixed(0)}% required)`,
    };
  }

  return [
    titleH1Check,
    lengthCheck,
    bodyCoverageSummary(flagsBody, 'in-body'),
    boundaryCheck(flagsH2, 'in-subheading', h2NounSets.length),
    boundaryCheck(flagsAlt, 'in-img-alt', altNounSets.length),
    distributionCheck,
  ];
}

function contentSurfaceChecks($, keyphrases, profile, md) {
  const { blocks, bodyJoined, bodyJoinedMorph: bodyMorph, kpMorphs } = md;

  const bodyNounCounts = new Map();
  for (const n of bodyMorph.nouns) bodyNounCounts.set(n, (bodyNounCounts.get(n) || 0) + 1);
  const bodyNounTotal = bodyMorph.nouns.length || 1;

  const densityFail = [];
  for (let i = 0; i < keyphrases.length; i++) {
    const kpNouns = (kpMorphs[i]?.nouns) || [];
    if (kpNouns.length === 0) continue;
    const counts = kpNouns.map((n) => bodyNounCounts.get(n) || 0);
    const minHits = Math.min(...counts);
    const ratio = minHits / bodyNounTotal;
    if (ratio < DENSITY_MIN) densityFail.push(`${keyphrases[i]}<${(DENSITY_MIN * 100).toFixed(2)}%`);
    if (ratio > DENSITY_MAX) densityFail.push(`${keyphrases[i]}>${(DENSITY_MAX * 100).toFixed(1)}%`);
  }

  const sentences = bodyMorph.sentences || [];
  // Language-aware sentence length. Korean caps characters; English caps words.
  // (Applying the Korean char cap to English mis-flags normal newspaper prose.)
  const hangulCount = (bodyJoined.match(/[가-힣]/g) || []).length;
  const letterCount = (bodyJoined.match(/[A-Za-z가-힣]/g) || []).length;
  const isKoreanBody = letterCount === 0 || hangulCount / letterCount >= 0.3;
  const wordCount = (s) => (s.trim().match(/\S+/g) || []).length;
  const longSentences = isKoreanBody
    ? sentences.filter((s) => s.length > READ_SENTENCE_CHARS_MAX).length
    : sentences.filter((s) => wordCount(s) > READ_SENTENCE_WORDS_MAX).length;
  const sentenceMetric = isKoreanBody
    ? `avg ${sentences.length ? Math.round(sentences.reduce((a, s) => a + s.length, 0) / sentences.length) : 0} chars (> ${READ_SENTENCE_CHARS_MAX})`
    : `avg ${sentences.length ? Math.round(sentences.reduce((a, s) => a + wordCount(s), 0) / sentences.length) : 0} words (> ${READ_SENTENCE_WORDS_MAX})`;

  const paraSentenceCounts = blocks.bodyParas.map((p) => (p.match(/(?<!\d)[.!?。？！]+(?!\d)/g) || []).length || 1);
  const longParas = paraSentenceCounts.filter((c) => c > READ_PARAGRAPH_SENTENCES_MAX).length;

  // Subheading distribution: chars between consecutive h2.blog-heading anchors in source order.
  const root = $('article').first().length ? $('article').first() : $('main').first();
  const headingNodes = root.find('h2.blog-heading').toArray();
  const sectionLengths = [];
  headingNodes.forEach((h, i) => {
    let len = 0;
    let next = h.nextSibling;
    const stop = headingNodes[i + 1];
    while (next && next !== stop) {
      const text = $(next).text ? $(next).text() : '';
      len += (text || '').length;
      next = next.nextSibling;
    }
    sectionLengths.push(len);
  });
  const longSections = sectionLengths.filter((l) => l > profile.h2SectionCharsMax).length;

  const bodyChars = bodyJoined.length;

  return [
    {
      name: 'content/word-count',
      pass: bodyChars >= profile.bodyCharsMin,
      detail: `${bodyChars} chars (min ${profile.bodyCharsMin})`,
    },
    {
      name: 'content/density',
      pass: densityFail.length === 0 && keyphrases.length > 0,
      detail: densityFail.length ? densityFail.slice(0, 4).join(', ') + (densityFail.length > 4 ? ` (+${densityFail.length - 4})` : '') : `${keyphrases.length} kp in ${DENSITY_MIN * 100}-${DENSITY_MAX * 100}% band`,
    },
    {
      name: 'content/sentence-length',
      pass: longSentences === 0,
      detail: `${sentenceMetric}, ${longSentences}/${sentences.length} too long`,
    },
    {
      name: 'content/paragraph-length',
      pass: longParas === 0,
      detail: `${longParas}/${paraSentenceCounts.length} paragraphs > ${READ_PARAGRAPH_SENTENCES_MAX} sentences`,
    },
    {
      name: 'content/h2-section-length',
      pass: longSections === 0 && sectionLengths.length > 0,
      detail: `${longSections}/${sectionLengths.length} sections > ${profile.h2SectionCharsMax} chars`,
    },
  ];
}

function printReport(url, checks) {
  console.log(`\n=== ${url}`);
  let pass = 0, fail = 0;
  for (const c of checks) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    if (c.pass) pass++; else fail++;
    const detail = c.detail ? `  -- ${c.detail}` : '';
    console.log(`  [${tag}] ${c.name}${detail}`);
  }
  console.log(`  ----`);
  console.log(`  ${pass} PASS / ${fail} FAIL`);
  return fail;
}

async function validate(url) {
  const profile = profileFor(url);
  const lhr = runLighthouse(url);
  const lhChecks = lighthouseChecks(lhr);
  const html = await fetchHtml(url);
  const { checks: structChecks, $ } = structuralChecks(html, url);
  const linkCheck = await internalLinkCheck($, url);
  const hotlinkCheck = await imageHotlinkCheck($);
  const internalQualityCheck = internalLinkScoring($, url);
  const outboundCheck = outboundLinkCheck($, url);
  const keyphrases = extractKeyphrases($);
  // One Kiwi spawn for the whole run (see buildMorphData) — was 3 spawns.
  const md = buildMorphData($, keyphrases);
  const competingCheck = competingLinkCheck($, keyphrases, md.kpNounLists, url);
  const morphChecks = contentMorphChecks(keyphrases, profile, md);
  const surfaceChecks = contentSurfaceChecks($, keyphrases, profile, md);
  return [...lhChecks, ...structChecks, linkCheck, hotlinkCheck, internalQualityCheck, outboundCheck, competingCheck, ...morphChecks, ...surfaceChecks];
}

(async () => {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error('Usage: node scripts/validate-seo.js <url> [<url> ...]');
    process.exit(2);
  }
  let totalFail = 0;
  for (const url of urls) {
    try {
      const checks = await validate(url);
      totalFail += printReport(url, checks);
    } catch (e) {
      console.error(`\n=== ${url}\n  [ERROR] ${e.message}`);
      totalFail += 1;
    }
  }
  process.exit(totalFail === 0 ? 0 : 1);
})();
