const fs = require('fs');
const path = require('path');

/**
 * 구 주간 트렌드 페이지(docs/magazine/weekly) 제거.
 *
 * 2025년 자동 생성물로 생성기가 없고 deploy 브랜치 seed로만 잔존하는 thin content다.
 * 2026-09-07 아카이브 결정에 따라 noindex 주입 대신 매 빌드에서 디렉터리를 통째로 지운다
 * (seed가 매번 복원하므로 멱등). 사이드바 '주간' 링크는 함께 제거됐다.
 *
 * @param {string} weeklyDir docs/magazine/weekly 경로
 * @returns {number} 이번 빌드에서 제거한 페이지 디렉터리 수 (허브 index.html 포함)
 */
function removeLegacyWeeklyPages(weeklyDir) {
  if (!fs.existsSync(weeklyDir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(weeklyDir, { withFileTypes: true })) {
    if (entry.isDirectory()) removed++;
  }
  if (fs.existsSync(path.join(weeklyDir, 'index.html'))) removed++;
  fs.rmSync(weeklyDir, { recursive: true, force: true });
  return removed;
}

module.exports = { removeLegacyWeeklyPages };
