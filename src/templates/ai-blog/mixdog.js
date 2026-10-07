/**
 * 믹스독 제품 페이지 (/mixdog/, /ko/mixdog/) — cursor.com/ko 레이아웃 문법.
 * 모든 블록이 본문 폭(.page-wrap) 하나의 좌우 끝에 맞고, 카드 격자는 어디서나 10px 간격으로 그 폭을 나눈다.
 * 기능 패널은 같은 폭의 회색 판, 미디어는 3칸 격자의 두 칸(왼쪽 끝이 둘째 칸 시작선)을 차지한다.
 * 순서: 첫 화면(OS 자동 버튼 + OS 링크 줄) → 앱 창 → 비용(가운데 제목 · 숫자 3칸 · 막대) → 기능 패널 5개
 * → 토큰 절감 4칸 → 기능 4칸 격자 → 45초 영상 패널 → 오픈소스 패널 → 질문 → 마지막 다운로드.
 * 문구는 mixdog-copy.js, 영상·이미지는 assets/aiscroll-mixdog/ (빌드가 /assets/mixdog/로 복사).
 */

const { wrapWithLayout, SITE_CONFIG, escapeHtml, renderFeedCard, categoryHref, mixdogHref } = require('./index');
const COPY = require('./mixdog-copy');

const REPO = 'https://github.com/tribgames/mixdog';
const DL = `${REPO}/releases/latest/download`;
const WIN = `${DL}/mixdog-desktop-win-x64.exe`;
const MAC = `${DL}/mixdog-desktop-mac-arm64.dmg`;
const BENCH = `${REPO}/tree/main/benchmarks/terminal-bench-2.1`;
const A = '/assets/mixdog';

const ICON_DOWN = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.5v8m0 0L4.5 7M8 10.5 11.5 7M3 13.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_GH = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>';

const lines = (arr) => arr.map(escapeHtml).join('<br>');

// 기본은 Windows 버튼, 맥에서 열면 스크립트가 Mac 버튼으로 바꾸고 휴대폰에서는 숨긴다
const downloadBtn = (t) => `<a class="mxp-btn mxp-btn-dark" href="${WIN}" rel="noopener" data-dl data-mac="${MAC}" data-mac-label="${escapeHtml(t.mac)}"><span>${escapeHtml(t.win)}</span>${ICON_DOWN}</a>`;

// 버튼 아래 OS 링크 줄: 다른 OS 설치 파일도 바로 받는다. 지금 OS 쪽은 스크립트가 진하게 표시한다
const platformLinks = (t) => `<p class="mxp-platforms">${escapeHtml(t.free)} · <a href="${WIN}" rel="noopener" data-os="win">${escapeHtml(t.winLink)}</a> · <a href="${MAC}" rel="noopener" data-os="mac">${escapeHtml(t.macLink)}</a></p>`;

// 맥 스타일 창 틀 안의 앱 영상. 화면에 들어올 때만 받아서 재생한다
const appWindow = (name, alt, w, h) => `<div class="mxp-window">
              <div class="mxp-window-bar" aria-hidden="true"><i></i><i></i><i></i><span>Mixdog</span></div>
              <video class="mxp-clip" data-src="${A}/${name}.mp4" preload="none" poster="${A}/${name}.webp" width="${w}" height="${h}" muted loop playsinline aria-label="${escapeHtml(alt)}"></video>
            </div>`;

// 기능 패널: 글 한 칸 + 미디어 두 칸. flip이면 미디어가 왼쪽 두 칸
const panel = (title, body, media, { flip = false, extra = '', mediaClass = '' } = {}) => `
        <div class="mxp-panel${flip ? ' is-flip' : ''}">
          <div class="mxp-panel-text">
            <h3>${Array.isArray(title) ? lines(title) : escapeHtml(title)}</h3>
            <p>${escapeHtml(body)}</p>${extra}
          </div>
          <div class="mxp-panel-media${mediaClass ? ' ' + mediaClass : ''}">
            ${media}
          </div>
        </div>`;

const pageScript = `<script>
(function () {
  var ua = navigator.userAgent;
  var mobile = /iPhone|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var os = mobile ? '' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : 'win';
  document.querySelectorAll('[data-dl]').forEach(function (a) {
    if (mobile) a.hidden = true;
    else if (os === 'mac') { a.href = a.getAttribute('data-mac'); a.firstChild.textContent = a.getAttribute('data-mac-label'); }
  });
  document.querySelectorAll('[data-os="' + os + '"]').forEach(function (a) { a.classList.add('is-current'); });
  var vids = document.querySelectorAll('.mxp-clip[data-src]');
  if (!('IntersectionObserver' in window)) { vids.forEach(function (v) { v.src = v.getAttribute('data-src'); v.play(); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (!v.getAttribute('src')) v.src = v.getAttribute('data-src'); var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else if (v.getAttribute('src')) v.pause();
    });
  }, { threshold: 0.3 });
  vids.forEach(function (v) { io.observe(v); });
})();
</script>`;

function generateMixdogPage(articles = [], lang = 'en') {
  const _lang = lang === 'ko' ? 'ko' : 'en';
  const t = COPY[_lang];
  const pageUrl = `${SITE_CONFIG.baseUrl}${mixdogHref(_lang)}`;
  const posts = articles
    .filter(a => a.category === 'mixdog')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const maxBar = Math.max(...t.bars.map(b => b[2]));

  const postsHtml = posts.length ? `
      <section class="mxp-sec">
        <div class="sec-head"><h2>${escapeHtml(t.postsTitle)}</h2><a class="sec-more" href="${categoryHref('mixdog', _lang)}">${escapeHtml(t.postsMore)} →</a></div>
        <div class="feed-grid">${posts.slice(0, 6).map((item, i) => renderFeedCard(item, i, _lang)).join('')}
        </div>
      </section>` : '';

  const content = `
    <div class="page-wrap mixdog-page" id="mixdog">
      <section class="mxp-hero">
        <p class="mxp-eyebrow"><img src="${A}/icon.webp" width="22" height="22" alt="">Mixdog</p>
        <h1 class="mxp-title">${lines(t.title)}</h1>
        <p class="mxp-sub">${escapeHtml(t.sub)}</p>
        <div class="mxp-actions">
          ${downloadBtn(t)}
          <a class="mxp-btn mxp-btn-soft" href="${REPO}" rel="noopener" target="_blank">${ICON_GH}<span>${escapeHtml(t.github)}</span></a>
        </div>
        ${platformLinks(t)}
      </section>

      <figure class="mxp-backdrop mxp-hero-media">
        <video class="mxp-promo" src="${A}/promo-${_lang}.mp4" poster="${A}/promo-${_lang}.webp" width="1280" height="720" autoplay muted loop playsinline preload="auto" aria-label="${escapeHtml(t.filmLabel)}"></video>
      </figure>

      <section class="mxp-sec mxp-bench">
        <div class="mxp-bench-top">
          <div class="mxp-bench-text">
            <h2>${lines(t.costTitle)}</h2>
            <p>${escapeHtml(t.costBody)}</p>
            <a class="mxp-more" href="${BENCH}" rel="noopener" target="_blank">${escapeHtml(t.costLink)} →</a>
          </div>
          <div class="mxp-bench-chart">
            <p class="mxp-chart-label">${escapeHtml(t.barsLabel)} · Terminal-Bench 2.1</p>${t.bars.map(([name, value, n], i) => `
            <div class="mxp-bar${i === 0 ? ' is-us' : ''}">
              <span class="mxp-bar-name">${escapeHtml(name)}</span>
              <span class="mxp-bar-track"><span style="width:${(n / maxBar * 100).toFixed(1)}%"></span></span>
              <span class="mxp-bar-value">${escapeHtml(value)}</span>
            </div>`).join('')}
            <ul class="mxp-figures">${t.stats.map(([num, label, vs]) => `
              <li><strong>${escapeHtml(num)}</strong><span>${escapeHtml(label)}</span>${vs ? `<em>${escapeHtml(vs)}</em>` : ''}</li>`).join('')}
            </ul>
            <p class="mxp-note">${escapeHtml(t.costNote)}</p>
          </div>
        </div>
        <div class="mxp-bench-how">
          <h3>${escapeHtml(t.howTitle)}</h3>
          <ul>${t.how.map(([num, title, body]) => `
            <li><strong>${escapeHtml(num)}</strong><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></li>`).join('')}
          </ul>
        </div>
      </section>

      <section class="mxp-sec">
        <h2 class="mxp-h2">${escapeHtml(t.featuresTitle)}</h2>
        <div class="mxp-panels">${t.features.map(([name, title, body, alt, tint], i) => panel(title, body, `<div class="mxp-backdrop" style="--tint:${tint}">
            ${appWindow(name, alt, 1124, 704)}
            </div>`, { flip: i % 2 === 1 })).join('')}
        </div>
      </section>

      <section class="mxp-sec">
        <h2 class="mxp-h2">${escapeHtml(t.moreTitle)}</h2>
        <div class="mxp-groups">${t.moreGroups.map(([group, items]) => `
          <div>
            <h3>${escapeHtml(group)}</h3>
            <ul>${items.map(([title, body]) => `
              <li><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></li>`).join('')}
            </ul>
          </div>`).join('')}
        </div>
      </section>

      <section class="mxp-sec">${panel(t.ossTitle, t.ossBody, `<div class="mxp-cli">
              <p>${escapeHtml(t.cliLabel)}</p>
              <pre><code><span>$</span> npm install -g mixdog
<span>$</span> mixdog</code></pre>
            </div>`, {
    flip: true,
    mediaClass: 'is-cli',
    extra: `
            <div class="mxp-links">
              <a class="mxp-more" href="${REPO}" rel="noopener" target="_blank">${escapeHtml(t.github)} →</a>
              <a class="mxp-more" href="${BENCH}" rel="noopener" target="_blank">${escapeHtml(t.ossBench)} →</a>
            </div>`
  })}
      </section>

      <section class="mxp-sec mxp-faq">
        <h2 class="mxp-h2">${escapeHtml(t.faqTitle)}</h2>
        <div class="mxp-faq-list">${t.faq.map(([q, a]) => `
          <details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join('')}
        </div>
      </section>

      <section class="mxp-end">
        <h2>${escapeHtml(t.endTitle)}</h2>
        <p>${escapeHtml(t.endBody)}</p>
        <div class="mxp-actions">
          <a class="mxp-btn mxp-btn-dark" href="${WIN}" rel="noopener"><span>${escapeHtml(t.win)}</span>${ICON_DOWN}</a>
          <a class="mxp-btn mxp-btn-soft" href="${MAC}" rel="noopener"><span>${escapeHtml(t.mac)}</span>${ICON_DOWN}</a>
        </div>
        <p class="mxp-platforms">${escapeHtml(t.platforms)}</p>
      </section>
${postsHtml}
    </div>
  `;

  const jsonLd = [{
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Mixdog",
    "description": t.description,
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Windows, macOS",
    "url": pageUrl,
    "downloadUrl": [WIN, MAC],
    "license": "https://www.apache.org/licenses/LICENSE-2.0",
    "image": `${SITE_CONFIG.baseUrl}${A}/poster.webp`,
    "sameAs": [REPO],
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "inLanguage": _lang === 'ko' ? 'ko-KR' : 'en-US'
  }];

  return wrapWithLayout(content, {
    title: t.metaTitle,
    description: t.description,
    keywords: t.keywords,
    canonical: pageUrl,
    jsonLd,
    pageScripts: pageScript,
    ogImage: `${SITE_CONFIG.baseUrl}${A}/poster.webp`,
    ogImageWidth: 1280,
    ogImageHeight: 720,
    currentPage: 'mixdog',
    cssFilenames: ['/styles-core.css', '/styles-article.css'],
    lang: _lang,
    alternates: { en: `${SITE_CONFIG.baseUrl}${mixdogHref('en')}`, ko: `${SITE_CONFIG.baseUrl}${mixdogHref('ko')}` }
  });
}

module.exports = { generateMixdogPage };
