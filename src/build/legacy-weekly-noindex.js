const fs = require('fs');
const path = require('path');

const NOINDEX_META = '<meta name="robots" content="noindex, follow">';

/**
 * 구 주간 트렌드 페이지(docs/magazine/weekly) noindex 주입.
 *
 * 2025년 자동 생성물로 지금은 생성기가 없고 deploy 브랜치 seed로만 잔존하는 thin content다.
 * 사이드바 링크가 살아 있어 삭제 대신 noindex,follow 로 두고, 매 빌드마다 seed에서 복원되므로
 * 멱등하게 적용한다. noindex와 충돌하는 canonical 링크는 함께 제거한다.
 *
 * @param {string} weeklyDir docs/magazine/weekly 경로 (허브 index.html + 하위 주차 폴더)
 * @returns {number} 이번 빌드에서 새로 주입한 파일 수
 */
function noindexLegacyWeeklyPages(weeklyDir) {
  if (!fs.existsSync(weeklyDir)) return 0;

  const files = [path.join(weeklyDir, 'index.html')];
  for (const entry of fs.readdirSync(weeklyDir)) {
    const dir = path.join(weeklyDir, entry);
    if (fs.statSync(dir).isDirectory()) files.push(path.join(dir, 'index.html'));
  }

  let patched = 0;
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (html.slice(0, 2000).includes('noindex') || !html.includes('<head>')) continue;
    const next = html
      .replace(/\s*<link rel="canonical" href="[^"]*">/, '')
      .replace('<head>', `<head>\n  ${NOINDEX_META}`);
    fs.writeFileSync(file, next, 'utf8');
    patched++;
  }
  return patched;
}

module.exports = { noindexLegacyWeeklyPages };
