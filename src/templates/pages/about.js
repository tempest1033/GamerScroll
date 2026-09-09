'use strict';
/**
 * 사이트 소개 (/about/) — 누가 · 무엇을 · 어떻게 만드는지. 푸터 '소개' 링크의 착지점.
 * 스타일은 순위 허브(.rk / .rk-card / .rk-faq)를 그대로 쓴다.
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');

const siteBaseUrl = 'https://gamerscroll.com';
const X_URL = 'https://x.com/gamerscroll';

function renderAboutPage() {
  const body = `<div class="rk-head"><h1>게이머스크롤 소개</h1></div>
<div class="rk-card"><h2>무엇을 다루나</h2><div class="rk-faq">
<p>게이머스크롤은 게임 순위 데이터를 매일 기록하고 분석하는 사이트입니다. 애플 앱스토어와 구글플레이의 매출·무료 인기 순위(한국·일본·미국·중국·대만, 200위까지), 스팀 동시접속자·판매 순위(TOP 100)를 수집해 일간 순위와 월간·연간·장르별·개발사별 기록으로 정리합니다.</p>
<p><a href="/reports/">리포트</a>는 이 데이터를 바탕으로 순위 변동의 이유와 시장 흐름을 짚는 글이고, <a href="/games/">게임 DB</a>는 수집된 게임 하나하나의 순위 추이와 기록을 모아 둔 곳입니다.</p>
</div></div>
<div class="rk-card"><h2>누가 만드나</h2><div class="rk-faq">
<p>게이머스크롤은 게임 개발자인 <b>Editor J</b>(필명)가 혼자 만들고 운영합니다. AI 도구·코딩 에이전트 매체인 <a href="https://aiscroll.io/ko/" rel="noopener" target="_blank">AI스크롤</a>도 같은 사람이 운영합니다. 별도의 편집팀은 없으며, 리포트의 작성·검토·발행을 한 사람이 맡습니다.</p>
<p>정정 요청과 문의는 X <a href="${X_URL}" rel="me noopener" target="_blank">@gamerscroll</a>로 보내 주세요.</p>
</div></div>
<div class="rk-card"><h2>데이터는 어떻게 만드나</h2><div class="rk-faq">
<p>순위는 스토어의 공개 차트를 하루 여러 차례 수집하고, 일별 이력을 하루 한 번 저장해 추이·연속 1위 일수·월간 평균 같은 지표를 계산합니다. 매출 금액 추정치는 제공하지 않으며, 모든 지표는 순위 기록에서 계산한 값입니다.</p>
<p>수집 범위·주기·각 순위의 계산식은 <a href="/rankings/about/">순위 데이터 산출 방법</a>에 정리돼 있습니다.</p>
</div></div>
<div class="rk-card"><h2>이 사이트에 없는 것</h2><div class="rk-faq">
<p>보도자료를 옮겨 적은 글, 써 보지 않은 게임에 대한 단정, 근거 없는 매출 추정은 싣지 않습니다. 리포트에 인용한 수치는 본문 끝의 출처와 게이머스크롤이 직접 기록한 순위 데이터로 확인할 수 있습니다.</p>
</div></div>`;

  const content = `
    <section class="section active" id="about">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}
      </div>
    </section>`;

  return wrapWithLayout(content, {
    currentPage: 'about',
    title: '게이머스크롤 소개 — 누가, 무엇을, 어떻게 만드나 | 게이머스크롤',
    description: '게이머스크롤은 앱스토어·구글플레이·스팀 게임 순위를 매일 기록하고 분석하는 사이트입니다. 운영자, 다루는 데이터, 산출 방식과 연락처를 안내합니다.',
    keywords: '게이머스크롤 소개, 게임 순위 데이터, Editor J, 운영자, 데이터 출처',
    canonical: `${siteBaseUrl}/about/`,
    breadcrumbs: [{ name: '홈', url: `${siteBaseUrl}/` }, { name: '소개', url: `${siteBaseUrl}/about/` }],
  });
}

module.exports = { renderAboutPage };
