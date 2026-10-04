/**
 * 홈 페이지 템플릿 진입점 — 홈 = 네 허브 요약 페이지 (home.js)
 */

function generateIndexPage() {
  return require('./home').renderHome();
}

module.exports = { generateIndexPage };
