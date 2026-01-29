/**
 * 게임 대시보드 페이지 자동 생성
 * games.json의 모든 게임에 대해 개별 페이지 생성
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const buildCache = require('../build-cache');

const gamesPath = path.join(__dirname, '..', 'data', 'games.json');
const historyDir = path.join(__dirname, '..', 'history');
const reportsDir = path.join(__dirname, '..', 'reports');
const snapshotsDir = path.join(__dirname, '..', 'snapshots', 'rankings');
const wikiDir = path.join(__dirname, '..', 'data', 'wiki');
const issueDir = path.join(reportsDir, 'issue');
const hotpickDir = path.join(reportsDir, 'hotpick');
const insightDir = path.join(reportsDir, 'insight');

// 통합 빌드 출력 경로
const docsDir = 'docs';
const siteBaseUrl = 'https://gamerscroll.com';
const outputDir = path.join(__dirname, '..', docsDir, 'games');

// 템플릿 import
const { generateGamePage } = require('../src/templates/pages/game');
const { setCssFilename } = require('../src/templates/layout');

// 해시된 CSS 파일명 찾아서 설정
const cssFiles = fs.readdirSync(path.join(__dirname, '..', docsDir)).filter(f => f.match(/^styles\.[a-f0-9]{8}\.css$/));
if (cssFiles.length > 0) {
  setCssFilename('/' + cssFiles[0]);
}

// 게임 데이터 로드
const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf8').replace(/^\uFEFF/, ''));

// 이름 정규화 (비교용)
function normalize(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// URL 수정 헬퍼 (width: 용도별 크기 - 480 카드, 150 사이드바, 960 본문)
function fixUrl(url, width = 960) {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  // 모든 외부 이미지 프록시
  if (url.startsWith('http')) {
    return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=' + width + '&output=webp';
  }
  return url;
}

// 지역별 appId 조회 (지역별 우선, 기본 폴백)
function getAppIdForRegion(gameAppIds, platform, region) {
  // aos → android 매핑 (스냅샷은 aos, games.json은 android)
  const normalizedPlatform = platform === 'aos' ? 'android' : platform;
  const regionKey = `${normalizedPlatform}:${region}`;
  const regionKeyAlt = `${normalizedPlatform}_${region}`;
  return gameAppIds[regionKey] || gameAppIds[regionKeyAlt] || gameAppIds[normalizedPlatform];
}

// 이름 기반 매칭 (appId 폴백용)
function findByTitleMatch(items, normalizedNames) {
  for (let i = 0; i < items.length; i++) {
    const itemTitle = normalize(items[i].title || '');
    if (normalizedNames.includes(itemTitle)) {
      return { index: i, item: items[i] };
    }
  }
  return null;
}

/**
 * 순위 인덱스 미리 빌드 (성능 최적화)
 * 구조: { appId: { "date|cat|platform|region": rank } }
 */
function buildRankIndex(allHistory) {
  const index = new Map();  // appId -> Map(key -> rank)

  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const categories = ['grossing', 'free'];

  for (const { date, data } of allHistory) {
    for (const cat of categories) {
      for (const region of regions) {
        for (const platform of ['ios', 'android']) {
          const keyPrefix = platform === 'ios' ? 'ios' : 'aos';
          const bestRankKey = `${keyPrefix}_${region}_${cat}`;

          // 1. bestRanks에서 인덱스 빌드
          if (data.bestRanks?.[bestRankKey]) {
            for (const [appId, rank] of Object.entries(data.bestRanks[bestRankKey])) {
              if (!index.has(appId)) index.set(appId, new Map());
              index.get(appId).set(`${date}|${cat}|${keyPrefix}|${region}`, rank);
            }
          }

          // 2. rankings에서도 인덱스 빌드 (bestRanks 없는 경우 폴백)
          const items = data.rankings?.[cat]?.[region]?.[platform] || [];
          for (let i = 0; i < items.length; i++) {
            const appId = String(items[i].appId);
            if (!appId) continue;
            const rankKey = `${date}|${cat}|${keyPrefix}|${region}`;
            if (!index.has(appId)) index.set(appId, new Map());
            // bestRanks가 없을 때만 설정
            if (!index.get(appId).has(rankKey)) {
              index.get(appId).set(rankKey, i + 1);
            }
          }
        }
      }
    }

    // 스팀 인덱스도 빌드
    const steamMostPlayed = data.steam?.mostPlayed || [];
    const steamTopSellers = data.steam?.topSellers || [];

    for (const item of steamMostPlayed) {
      const appId = `steam:${item.appid}`;
      if (!index.has(appId)) index.set(appId, new Map());
      index.get(appId).set(`${date}|mostPlayed`, { rank: item.rank, ccu: item.ccu });
    }

    for (const item of steamTopSellers) {
      const appId = `steam:${item.appid}`;
      if (!index.has(appId)) index.set(appId, new Map());
      index.get(appId).set(`${date}|topSellers`, { rank: item.rank });
    }
  }

  return index;
}

// URL-safe 슬러그 생성 (앱 ID 우선, 없으면 이름 기반)
function createSlug(name, appIds = null) {
  // 앱 ID가 있으면 우선 사용 (Android > iOS)
  if (appIds) {
    if (appIds.android) {
      return String(appIds.android).toLowerCase().replace(/\./g, '-');  // com-nexon-maplem
    }
    if (appIds.ios && appIds.ios.startsWith('com.')) {
      return String(appIds.ios).toLowerCase().replace(/\./g, '-');  // com-xxx-xxx 형식만
    }
  }

  // 앱 ID 없으면 이름 기반 slug (fallback)
  // 일본어/중국어 문자는 영문으로 변환하거나 제거
  let slug = name
    .toLowerCase()
    // 일본어/중국어 문자 범위 제거 (한글은 유지)
    .replace(/[\u3040-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/g, '')
    .replace(/[^a-z0-9가-힣]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // 슬러그가 비어있거나 너무 짧으면 해시 사용
  if (slug.length < 2) {
    // 이름의 해시 생성
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    slug = 'game-' + Math.abs(hash).toString(36);
  }

  return slug;
}

// 별칭 → 공식명 매핑
const aliasToCanonical = new Map();
for (const [gameName, info] of Object.entries(gamesData.games)) {
  const normalizedName = normalize(gameName);
  aliasToCanonical.set(normalizedName, gameName);
  for (const alias of info.aliases || []) {
    aliasToCanonical.set(normalize(alias), gameName);
  }
}

// 히스토리에서 최신 데이터 로드
function loadLatestHistory() {
  const files = fs.readdirSync(historyDir)
    .filter(f => f.endsWith('.json') && !f.includes('mentions'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const latestFile = files[0];
  return JSON.parse(fs.readFileSync(path.join(historyDir, latestFile), 'utf8'));
}

// 전체 히스토리 파일 목록 가져오기
function getAllHistoryFiles() {
  return fs.readdirSync(historyDir)
    .filter(f => f.endsWith('.json') && !f.includes('mentions'))
    .sort();
}

// 히스토리 로드 (특정 파일만 또는 전체)
function loadHistoryFiles(files) {
  const historyList = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        historyList.push({
          date: dateMatch[1],
          file: file,
          data: data
        });
      }
    } catch (e) {
      // 파싱 실패 무시
    }
  }
  return historyList;
}

// 전체 리포트 파일 목록 가져오기
function getAllReportFiles() {
  if (!fs.existsSync(reportsDir)) return [];
  return fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('.json') && !f.includes('weekly'))
    .sort();
}

// 리포트 로드 (특정 파일만 또는 전체)
function loadReportFiles(files) {
  const reports = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));
      if (data.ai) {
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        reports.push({
          date: dateMatch ? dateMatch[1] : data.ai.date,
          file: file,
          ai: data.ai
        });
      }
    } catch (e) {
      // 파싱 실패 무시
    }
  }
  return reports;
}

// 주간 리포트 JSON 로드
function loadWeeklyReports() {
  const weeklyDir = path.join(reportsDir, 'weekly');
  if (!fs.existsSync(weeklyDir)) return [];

  const files = fs.readdirSync(weeklyDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  const reports = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(weeklyDir, file), 'utf8'));
      if (data.ai) {
        reports.push({
          weekNumber: data.weekInfo?.weekNumber || file.replace('.json', ''),
          file: file,
          ai: data.ai
        });
      }
    } catch (e) {
      // 파싱 실패 무시
    }
  }
  return reports;
}

// 24시간 실시간 스냅샷 로드 (시간 단위)
function loadHourlySnapshots() {
  if (!fs.existsSync(snapshotsDir)) return {};

  // KST (UTC+9) 기준으로 날짜 계산 (스냅샷 파일명이 KST 기준)
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const todayStr = kstNow.toISOString().split('T')[0];
  const kstYesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = kstYesterday.toISOString().split('T')[0];

  const platforms = ['ios', 'aos'];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const categories = ['grossing', 'free'];

  const result = {};

  for (const platform of platforms) {
    for (const region of regions) {
      for (const cat of categories) {
        const key = `${platform}-${region}-${cat}`;
        const allData = [];

        // 어제 + 오늘 CSV 읽기
        for (const dateStr of [yesterdayStr, todayStr]) {
          const fileName = `${dateStr}_${platform}_${region}_${cat}.csv`;
          const filePath = path.join(snapshotsDir, fileName);

          if (fs.existsSync(filePath)) {
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              const lines = content.split('\n').slice(1); // 헤더 제외

              for (const line of lines) {
                if (!line.trim()) continue;
                // CSV 파싱: time,rank,id,title (id는 빈 값일 수 있음)
                const match = line.match(/^(\d{2}:\d{2}),(\d+),([^,]*),"?([^"]*)"?$/);
                if (match) {
                  const [, time, rank, appId, title] = match;
                  allData.push({
                    date: dateStr,
                    time,
                    rank: parseInt(rank, 10),
                    appId: appId.trim(),
                    title: title.trim()
                  });
                }
              }
            } catch (e) {
              // 파싱 실패 무시
            }
          }
        }

        // 30분 단위(:00, :30) 데이터만 필터링하고 시간순 정렬
        const hourlyData = allData
          .filter(d => d.time.endsWith(':00') || d.time.endsWith(':30'))
          .sort((a, b) => {
            const aKey = `${a.date} ${a.time}`;
            const bKey = `${b.date} ${b.time}`;
            return aKey.localeCompare(bKey);
          });

        result[key] = hourlyData;
      }
    }
  }

  return result;
}

/**
 * 실시간 스냅샷 역인덱스 빌드
 * appId/title → { snapshotKey → ranks[] } 매핑
 */
function buildHourlySnapshotsIndex(hourlySnapshots) {
  const byAppId = new Map();    // appId → Map(snapshotKey → ranks[])
  const byTitle = new Map();    // normalizedTitle → Map(snapshotKey → ranks[])

  for (const [snapshotKey, data] of Object.entries(hourlySnapshots)) {
    for (const item of data) {
      // appId로 인덱싱
      if (item.appId) {
        const appIdStr = String(item.appId);
        if (!byAppId.has(appIdStr)) {
          byAppId.set(appIdStr, new Map());
        }
        const keyMap = byAppId.get(appIdStr);
        if (!keyMap.has(snapshotKey)) {
          keyMap.set(snapshotKey, []);
        }
        keyMap.get(snapshotKey).push({
          date: item.date,
          time: item.time,
          rank: item.rank
        });
      }

      // title로도 인덱싱 (폴백용)
      if (item.title) {
        const normalizedTitle = normalize(item.title);
        if (!byTitle.has(normalizedTitle)) {
          byTitle.set(normalizedTitle, new Map());
        }
        const keyMap = byTitle.get(normalizedTitle);
        if (!keyMap.has(snapshotKey)) {
          keyMap.set(snapshotKey, []);
        }
        keyMap.get(snapshotKey).push({
          date: item.date,
          time: item.time,
          rank: item.rank
        });
      }
    }
  }

  return { byAppId, byTitle };
}

// 게임별 실시간 순위 추출 (역인덱스 기반 O(1) 조회)
function extractGameHourlyRanks(gameName, gameInfo, hourlySnapshots, hourlyIndex = null) {
  const gameAppIds = gameInfo.appIds || {};
  const result = {};

  // 인덱스 없으면 빈 결과 반환 (레거시 호환)
  if (!hourlyIndex) return result;

  // 게임 이름들 정규화 (폴백 매칭용)
  const normalizedNames = [normalize(gameName)];
  if (gameInfo.aliases) {
    for (const alias of gameInfo.aliases) {
      normalizedNames.push(normalize(alias));
    }
  }

  // 스냅샷 키 목록 (ios-kr-grossing 등)
  const snapshotKeys = Object.keys(hourlySnapshots);

  for (const snapshotKey of snapshotKeys) {
    const [platform, region] = snapshotKey.split('-');
    const expectedAppId = getAppIdForRegion(gameAppIds, platform, region);

    let gameRanks = null;

    // 1. appId로 O(1) 조회
    if (expectedAppId) {
      const appIdMap = hourlyIndex.byAppId.get(String(expectedAppId));
      if (appIdMap && appIdMap.has(snapshotKey)) {
        gameRanks = appIdMap.get(snapshotKey);
      }
    }

    // 2. 폴백: title로 O(1) 조회
    if (!gameRanks) {
      for (const normalizedName of normalizedNames) {
        const titleMap = hourlyIndex.byTitle.get(normalizedName);
        if (titleMap && titleMap.has(snapshotKey)) {
          gameRanks = titleMap.get(snapshotKey);
          break;
        }
      }
    }

    if (gameRanks && gameRanks.length > 0) {
      // 중복 제거 + 시간순 정렬
      const seenTimes = new Set();
      const uniqueRanks = [];
      for (const r of gameRanks) {
        const timeKey = `${r.date} ${r.time}`;
        if (!seenTimes.has(timeKey)) {
          seenTimes.add(timeKey);
          uniqueRanks.push(r);
        }
      }

      uniqueRanks.sort((a, b) => {
        const aKey = `${a.date} ${a.time}`;
        const bKey = `${b.date} ${b.time}`;
        return aKey.localeCompare(bKey);
      });

      // 최근 24시간 데이터만 필터링
      const lastItem = uniqueRanks[uniqueRanks.length - 1];
      const lastDateTime = new Date(`${lastItem.date}T${lastItem.time}:00Z`);
      const cutoffTime = new Date(lastDateTime.getTime() - 24 * 60 * 60 * 1000);
      const cutoffDateStr = cutoffTime.toISOString().split('T')[0];
      const cutoffTimeStr = String(cutoffTime.getUTCHours()).padStart(2, '0') + ':00';
      const cutoffKey = `${cutoffDateStr} ${cutoffTimeStr}`;

      const filtered = uniqueRanks.filter(r => {
        const rKey = `${r.date} ${r.time}`;
        return rKey >= cutoffKey;
      });

      result[snapshotKey] = filtered.length > 0 ? filtered : uniqueRanks.slice(-48);
    }
  }

  return result;
}

// 게임명으로 리포트에서 mentions 수집
function collectReportMentions(normalizedNames, reports) {
  const mentions = [];

  for (const report of reports) {
    const ai = report.ai;
    if (!ai) continue;

    // ai.rankings - 정확한 게임명 매칭 (title)
    for (const item of ai.rankings || []) {
      if (normalizedNames.includes(normalize(item.title || ''))) {
        mentions.push({
          date: report.date,
          type: 'ranking',
          tag: item.tag,
          title: item.title,
          desc: item.desc,
          platform: item.platform,
          rank: item.rank,
          prevRank: item.prevRank,
          change: item.change
        });
      }
    }

    // ai.community - tag가 정확한 게임명
    for (const item of ai.community || []) {
      if (normalizedNames.includes(normalize(item.tag || ''))) {
        mentions.push({
          date: report.date,
          type: 'community',
          tag: item.tag,
          title: item.title,
          desc: item.desc
        });
      }
    }

    // ai.issues - title이나 desc에 게임명 포함
    for (const item of ai.issues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: report.date,
          type: 'issue',
          tag: item.tag,
          title: item.title,
          desc: item.desc
        });
      }
    }

    // ai.metrics - title이나 desc에 게임명 포함
    for (const item of ai.metrics || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: report.date,
          type: 'metric',
          tag: item.tag,
          title: item.title,
          desc: item.desc
        });
      }
    }

    // ai.streaming - title이나 desc에 게임명 포함
    for (const item of ai.streaming || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: report.date,
          type: 'streaming',
          tag: item.tag,
          title: item.title,
          desc: item.desc
        });
      }
    }

    // ai.industryIssues - title이나 desc에 게임명 포함
    for (const item of ai.industryIssues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: report.date,
          type: 'industry',
          tag: item.tag || '업계',
          title: item.title,
          desc: item.desc
        });
      }
    }

    // ai.stocks - title이나 desc에 게임명 포함
    for (const item of ai.stocks || []) {
      const text = `${item.name || ''} ${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: report.date,
          type: 'stock',
          tag: '주가',
          title: item.name || item.title,
          desc: item.desc
        });
      }
    }
  }

  // 같은 타입 + 같은 제목 중복 제거 (최신 날짜 우선, ranking은 변동폭 큰 것 우선)
  const uniqueMap = new Map();
  for (const m of mentions) {
    // 제목 기반 키로 중복 제거 (연속 날짜에 같은 내용 방지)
    const titleKey = `${m.type}-${(m.title || '').slice(0, 30)}`;
    const existing = uniqueMap.get(titleKey);
    if (!existing) {
      uniqueMap.set(titleKey, m);
    } else if (m.type === 'ranking') {
      // ranking 타입은 변동폭 큰 것 우선
      const existingChange = Math.abs(existing.change || 0);
      const newChange = Math.abs(m.change || 0);
      if (newChange > existingChange) {
        uniqueMap.set(titleKey, m);
      }
    } else {
      // 다른 타입은 최신 날짜 우선
      if (m.date > existing.date) {
        uniqueMap.set(titleKey, m);
      }
    }
  }
  const dedupedMentions = Array.from(uniqueMap.values());

  // 날짜 기준 정렬 (최신 순)
  dedupedMentions.sort((a, b) => b.date.localeCompare(a.date));

  return dedupedMentions;
}

// 주간 리포트에서 mentions 수집 (모든 섹션)
function collectWeeklyMentions(normalizedNames, weeklyReports) {
  const mentions = [];

  for (const report of weeklyReports) {
    const ai = report.ai;
    if (!ai) continue;

    const weekDate = ai.date || `W${report.weekNumber}`;

    // MVP 게임 매칭
    if (ai.mvp && normalizedNames.includes(normalize(ai.mvp.name || ''))) {
      mentions.push({
        date: weekDate,
        type: 'mvp',
        tag: 'MVP',
        title: ai.mvp.name,
        desc: ai.mvp.desc,
        highlights: ai.mvp.highlights || []
      });
    }

    // issues - title이나 desc에 게임명 포함
    for (const item of ai.issues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: weekDate,
          type: 'issue',
          tag: item.tag || '이슈',
          title: item.title,
          desc: item.desc
        });
      }
    }

    // industryIssues - title이나 desc에 게임명 포함
    for (const item of ai.industryIssues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: weekDate,
          type: 'industry',
          tag: item.tag || '업계',
          title: item.title,
          desc: item.desc
        });
      }
    }

    // metrics - title이나 desc에 게임명 포함
    for (const item of ai.metrics || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: weekDate,
          type: 'metric',
          tag: item.tag || '지표',
          title: item.title,
          desc: item.desc
        });
      }
    }

    // community - tag가 정확한 게임명
    for (const item of ai.community || []) {
      if (normalizedNames.includes(normalize(item.tag || ''))) {
        mentions.push({
          date: weekDate,
          type: 'community',
          tag: item.tag,
          title: item.title,
          desc: item.desc
        });
      }
    }

    // streaming - title이나 desc에 게임명 포함
    for (const item of ai.streaming || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: weekDate,
          type: 'streaming',
          tag: item.tag || '스트리밍',
          title: item.title,
          desc: item.desc
        });
      }
    }

    // stocks - 게임명 관련 주가 (이름 기준 매칭)
    const stockItems = [...(ai.stocks?.up || []), ...(ai.stocks?.down || [])];
    for (const item of stockItems) {
      const text = `${item.name || ''} ${item.comment || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: weekDate,
          type: 'stock',
          tag: '주가',
          title: item.name,
          desc: item.comment
        });
      }
    }

    // releases에서 게임 찾기
    for (const item of ai.releases || []) {
      if (normalizedNames.includes(normalize(item.name || item.title || ''))) {
        mentions.push({
          date: weekDate,
          type: 'release',
          tag: '신규 출시',
          title: item.name || item.title,
          desc: item.desc
        });
      }
    }

    // global에서 게임 찾기
    for (const item of ai.global || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({
          date: weekDate,
          type: 'global',
          tag: item.tag || '글로벌',
          title: item.title,
          desc: item.desc
        });
      }
    }
  }

  return mentions;
}

/**
 * 최신 히스토리 순위 역인덱스 빌드
 * historyData.rankings를 appId/title 기반 O(1) 조회용으로 변환
 */
function buildLatestRankingsIndex(historyData) {
  const index = {
    byAppId: new Map(),   // "cat-region-platform-appId" -> {item, index}
    byTitle: new Map(),   // "cat-region-platform-normalizedTitle" -> {item, index}
    steam: {
      mostPlayedById: new Map(),   // appId -> item
      mostPlayedByName: new Map(), // normalizedName -> item
      topSellersById: new Map(),   // appId -> item
      topSellersByName: new Map()  // normalizedName -> item
    }
  };

  if (!historyData) return index;

  const categories = ['grossing', 'free'];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const platforms = ['ios', 'android'];

  // Rankings 인덱싱
  for (const cat of categories) {
    for (const region of regions) {
      for (const platform of platforms) {
        const items = historyData.rankings?.[cat]?.[region]?.[platform] || [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const keyBase = `${cat}-${region}-${platform}`;

          // appId로 인덱싱
          if (item.appId) {
            index.byAppId.set(`${keyBase}-${item.appId}`, { item, index: i });
          }

          // title로 인덱싱 (폴백용)
          if (item.title) {
            const normalizedTitle = normalize(item.title);
            const titleKey = `${keyBase}-${normalizedTitle}`;
            if (!index.byTitle.has(titleKey)) {
              index.byTitle.set(titleKey, { item, index: i });
            }
          }
        }
      }
    }
  }

  // Steam 인덱싱
  const mostPlayed = historyData.steam?.mostPlayed || [];
  for (const item of mostPlayed) {
    if (item.appid) {
      index.steam.mostPlayedById.set(String(item.appid), item);
    }
    if (item.name) {
      index.steam.mostPlayedByName.set(normalize(item.name), item);
    }
  }

  const topSellers = historyData.steam?.topSellers || [];
  for (const item of topSellers) {
    if (item.appid) {
      index.steam.topSellersById.set(String(item.appid), item);
    }
    if (item.name) {
      index.steam.topSellersByName.set(normalize(item.name), item);
    }
  }

  return index;
}

/**
 * 리포트 멘션 역인덱스 빌드
 * 한 번만 실행하여 gameName → mentions[] 매핑 생성
 */
function buildMentionsIndex(reports, weeklyReports, gamesData) {
  const index = new Map();  // gameName -> mentions[]

  // 모든 게임명 + 별칭을 정규화해서 매핑 준비
  const gameNameMap = new Map();  // normalizedName -> gameName
  for (const [gameName, gameInfo] of Object.entries(gamesData.games)) {
    const allNames = [gameName, ...(gameInfo.aliases || [])];
    for (const name of allNames) {
      gameNameMap.set(normalize(name), gameName);
    }
    index.set(gameName, []);
  }

  const allNormalizedNames = [...gameNameMap.keys()];

  // 헬퍼: 텍스트에서 게임명 찾기
  const findGameInText = (text) => {
    const lowerText = text.toLowerCase();
    for (const normalizedName of allNormalizedNames) {
      if (lowerText.includes(normalizedName)) {
        return gameNameMap.get(normalizedName);
      }
    }
    return null;
  };

  // 헬퍼: 정확한 이름 매칭
  const findGameExact = (name) => {
    const normalized = normalize(name || '');
    return gameNameMap.get(normalized) || null;
  };

  // 일간 리포트 인덱싱
  for (const report of reports) {
    const ai = report.ai;
    if (!ai) continue;
    const date = report.date;

    // ai.rankings
    for (const item of ai.rankings || []) {
      const gameName = findGameExact(item.title);
      if (gameName) {
        index.get(gameName).push({
          date, type: 'ranking', tag: item.tag, title: item.title,
          desc: item.desc, platform: item.platform, rank: item.rank,
          prevRank: item.prevRank, change: item.change
        });
      }
    }

    // ai.community
    for (const item of ai.community || []) {
      const gameName = findGameExact(item.tag);
      if (gameName) {
        index.get(gameName).push({
          date, type: 'community', tag: item.tag, title: item.title, desc: item.desc
        });
      }
    }

    // ai.issues, metrics, streaming, industryIssues, stocks - 텍스트 검색
    const textSections = [
      { key: 'issues', type: 'issue' },
      { key: 'metrics', type: 'metric' },
      { key: 'streaming', type: 'streaming' },
      { key: 'industryIssues', type: 'industry', defaultTag: '업계' },
      { key: 'stocks', type: 'stock', defaultTag: '주가', useNameField: true }
    ];

    for (const section of textSections) {
      for (const item of ai[section.key] || []) {
        const text = section.useNameField
          ? `${item.name || ''} ${item.title || ''} ${item.desc || ''}`
          : `${item.title || ''} ${item.desc || ''}`;
        const gameName = findGameInText(text);
        if (gameName) {
          index.get(gameName).push({
            date, type: section.type, tag: item.tag || section.defaultTag,
            title: section.useNameField ? (item.name || item.title) : item.title,
            desc: item.desc
          });
        }
      }
    }
  }

  // 주간 리포트 인덱싱
  for (const report of weeklyReports) {
    const ai = report.ai;
    if (!ai) continue;
    const weekDate = ai.date || `W${report.weekNumber}`;

    // MVP
    if (ai.mvp) {
      const gameName = findGameExact(ai.mvp.name);
      if (gameName) {
        index.get(gameName).push({
          date: weekDate, type: 'mvp', tag: 'MVP', title: ai.mvp.name,
          desc: ai.mvp.desc, highlights: ai.mvp.highlights || []
        });
      }
    }

    // issues, industryIssues, metrics, community, streaming, prediction
    const weeklySections = [
      { key: 'issues', type: 'issue', defaultTag: '이슈' },
      { key: 'industryIssues', type: 'industry', defaultTag: '업계' },
      { key: 'metrics', type: 'metric', defaultTag: '지표' },
      { key: 'streaming', type: 'streaming', defaultTag: '스트리밍' },
      { key: 'prediction', type: 'prediction', defaultTag: '전망' }
    ];

    for (const section of weeklySections) {
      for (const item of ai[section.key] || []) {
        const text = `${item.title || ''} ${item.desc || ''}`;
        const gameName = findGameInText(text);
        if (gameName) {
          index.get(gameName).push({
            date: weekDate, type: section.type, tag: item.tag || section.defaultTag,
            title: item.title, desc: item.desc
          });
        }
      }
    }

    // community - exact match
    for (const item of ai.community || []) {
      const gameName = findGameExact(item.tag);
      if (gameName) {
        index.get(gameName).push({
          date: weekDate, type: 'community', tag: item.tag,
          title: item.title, desc: item.desc
        });
      }
    }

    // rankings - exact match
    for (const item of ai.rankings || []) {
      const gameName = findGameExact(item.title);
      if (gameName) {
        index.get(gameName).push({
          date: weekDate, type: 'ranking', tag: item.tag, title: item.title,
          desc: item.desc, platform: item.platform, rank: item.rank,
          prevRank: item.prevRank, change: item.change
        });
      }
    }
  }

  // 각 게임별로 중복 제거 + 정렬 적용
  for (const [gameName, mentions] of index) {
    const uniqueMap = new Map();
    for (const m of mentions) {
      const titleKey = `${m.type}-${(m.title || '').slice(0, 30)}`;
      const existing = uniqueMap.get(titleKey);
      if (!existing) {
        uniqueMap.set(titleKey, m);
      } else if (m.type === 'ranking') {
        if (Math.abs(m.change || 0) > Math.abs(existing.change || 0)) {
          uniqueMap.set(titleKey, m);
        }
      } else if (m.date > existing.date) {
        uniqueMap.set(titleKey, m);
      }
    }
    const deduped = Array.from(uniqueMap.values());
    deduped.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    index.set(gameName, deduped);
  }

  return index;
}

/**
 * 뉴스/커뮤니티/유튜브 콘텐츠 역인덱스 빌드
 * 한 번만 실행하여 gameName → {news, community, youtube} 매핑 생성
 */
function buildContentIndex(historyData, gamesData) {
  const index = new Map();  // gameName -> { news: [], community: [], youtube: [] }

  // 모든 게임명 + 별칭을 정규화해서 매핑 준비
  const gameNameMap = new Map();  // normalizedName -> gameName
  for (const [gameName, gameInfo] of Object.entries(gamesData.games)) {
    const allNames = [gameName, ...(gameInfo.aliases || [])];
    for (const name of allNames) {
      gameNameMap.set(normalize(name), gameName);
    }
    // 결과 저장용 초기화
    index.set(gameName, { news: [], community: [], youtube: [] });
  }

  const allNormalizedNames = [...gameNameMap.keys()];

  // 뉴스 인덱싱
  const newsSources = historyData?.news || {};
  for (const [source, items] of Object.entries(newsSources)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const title = (item.title || '').toLowerCase();
      for (const normalizedName of allNormalizedNames) {
        if (title.includes(normalizedName)) {
          const gameName = gameNameMap.get(normalizedName);
          index.get(gameName).news.push({
            title: item.title,
            link: item.link,
            thumbnail: item.thumbnail,
            source: source,
            date: item.date
          });
          break;  // 한 아이템은 한 게임에만 매칭 (중복 방지)
        }
      }
    }
  }

  // 커뮤니티 인덱싱
  const communityData = historyData?.community || {};
  for (const [source, items] of Object.entries(communityData)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const title = (item.title || '').toLowerCase();
      for (const normalizedName of allNormalizedNames) {
        if (title.includes(normalizedName)) {
          const gameName = gameNameMap.get(normalizedName);
          index.get(gameName).community.push({
            title: item.title,
            link: item.link,
            source: source,
            comments: item.comments,
            views: item.views
          });
          break;
        }
      }
    }
  }

  // 유튜브 인덱싱
  const youtubeItems = Array.isArray(historyData?.youtube) ? historyData.youtube : [];
  for (const item of youtubeItems) {
    const title = (item.title || '').toLowerCase();
    for (const normalizedName of allNormalizedNames) {
      if (title.includes(normalizedName)) {
        const gameName = gameNameMap.get(normalizedName);
        index.get(gameName).youtube.push({
          title: item.title,
          link: item.link,
          thumbnail: item.thumbnail,
          channel: item.channel
        });
        break;
      }
    }
  }

  return index;
}

// 게임 이름으로 관련 데이터 수집
function collectGameData(gameName, gameInfo, historyData, reports, rankIndex, historyDates, weeklyReports = [], hourlySnapshots = {}, contentIndex = null, mentionsIndex = null, latestRankingsIndex = null, hourlyIndex = null) {
  const allNames = [gameName, ...(gameInfo.aliases || [])];
  const normalizedNames = allNames.map(n => normalize(n));
  const normalizedNameSet = new Set(normalizedNames);  // O(1) 조회용

  const result = {
    name: gameName,
    platforms: gameInfo.platforms || [],
    developer: gameInfo.developer || '',
    icon: gameInfo.icon || null,  // 게임 아이콘 URL
    rankings: {},
    rankHistory: [],  // 모바일 순위 추이 데이터
    realtimeRanks: {},  // 24시간 실시간 순위 데이터
    steamHistory: [],  // 스팀 순위 추이 데이터
    news: [],
    community: [],
    steam: null,
    youtube: [],
    mentions: []  // 리포트 mentions 추가
  };

  // 실시간 순위 추출 (역인덱스 사용)
  result.realtimeRanks = extractGameHourlyRanks(gameName, gameInfo, hourlySnapshots, hourlyIndex);

  // 리포트 mentions (역인덱스 사용 - O(1) 조회)
  if (mentionsIndex && mentionsIndex.has(gameName)) {
    result.mentions = mentionsIndex.get(gameName);
  }

  // 순위 히스토리 수집 (매출 추이용) - 인덱스 기반 O(1) 조회
  const gameAppIds = gameInfo.appIds || {};
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const categories = ['grossing', 'free'];

  if (rankIndex && historyDates && historyDates.length > 0) {
    // 이 게임의 모든 appId 수집
    const appIdList = [];
    for (const platform of ['ios', 'android']) {
      for (const region of regions) {
        const appId = getAppIdForRegion(gameAppIds, platform, region);
        if (appId) appIdList.push(String(appId));
      }
    }
    // 중복 제거
    const uniqueAppIds = [...new Set(appIdList)];

    // 각 날짜별로 순위 수집 (인덱스에서 O(1) 조회)
    for (const date of historyDates) {
      const dayRanks = { date };
      let hasAnyRank = false;

      for (const cat of categories) {
        for (const region of regions) {
          for (const platform of ['ios', 'android']) {
            const expectedAppId = getAppIdForRegion(gameAppIds, platform, region);
            if (!expectedAppId) continue;

            const keyPrefix = platform === 'ios' ? 'ios' : 'aos';
            const rankKey = `${date}|${cat}|${keyPrefix}|${region}`;

            // 인덱스에서 O(1) 조회
            const appIdIndex = rankIndex.get(String(expectedAppId));
            if (appIdIndex && appIdIndex.has(rankKey)) {
              dayRanks[`${cat}-${keyPrefix}-${region}`] = appIdIndex.get(rankKey);
              hasAnyRank = true;
            }
          }
        }
      }

      if (hasAnyRank) {
        result.rankHistory.push(dayRanks);
      }

      // 스팀 히스토리 수집 (인덱스에서 조회)
      const steamAppId = gameAppIds['steam:global'] || gameAppIds['steam'];
      if (steamAppId) {
        const steamKey = `steam:${steamAppId}`;
        const steamIndex = rankIndex.get(steamKey);

        if (steamIndex) {
          let steamDay = null;

          const mpData = steamIndex.get(`${date}|mostPlayed`);
          if (mpData) {
            steamDay = { date, ccuRank: mpData.rank, ccu: mpData.ccu };
          }

          const tsData = steamIndex.get(`${date}|topSellers`);
          if (tsData) {
            if (!steamDay) steamDay = { date };
            steamDay.salesRank = tsData.rank;
          }

          if (steamDay) {
            result.steamHistory.push(steamDay);
          }
        }
      }
    }
  }

  if (!historyData) return result;

  // 순위 데이터 수집 + 아이콘 수집 (역인덱스 사용 - O(1))
  const platforms = ['ios', 'android'];

  if (latestRankingsIndex) {
    for (const cat of categories) {
      for (const region of regions) {
        for (const platform of platforms) {
          const expectedAppId = getAppIdForRegion(gameAppIds, platform, region);
          const keyBase = `${cat}-${region}-${platform}`;
          let matched = null;

          // 1. appId로 O(1) 조회
          if (expectedAppId) {
            matched = latestRankingsIndex.byAppId.get(`${keyBase}-${expectedAppId}`);
          }

          // 2. 폴백: title로 O(1) 조회
          if (!matched) {
            for (const normalizedName of normalizedNames) {
              matched = latestRankingsIndex.byTitle.get(`${keyBase}-${normalizedName}`);
              if (matched) break;
            }
          }

          if (matched) {
            result.rankings[`${region}-${platform}-${cat}`] = {
              rank: matched.index + 1,
              change: matched.item.change || 0
            };
            if (!result.icon && matched.item.icon) {
              result.icon = matched.item.icon;
            }
          }
        }
      }
    }
  }

  // 스팀 데이터 수집 (역인덱스 사용 - O(1))
  const steamAppId = gameAppIds['steam:global'] || gameAppIds['steam'];
  let mpItem = null;
  let tsItem = null;

  if (latestRankingsIndex) {
    // mostPlayed - appId 우선, 이름 폴백
    if (steamAppId) {
      mpItem = latestRankingsIndex.steam.mostPlayedById.get(String(steamAppId));
    }
    if (!mpItem) {
      for (const normalizedName of normalizedNames) {
        mpItem = latestRankingsIndex.steam.mostPlayedByName.get(normalizedName);
        if (mpItem) break;
      }
    }

    // topSellers - appId 우선, 이름 폴백
    if (steamAppId) {
      tsItem = latestRankingsIndex.steam.topSellersById.get(String(steamAppId));
    }
    if (!tsItem) {
      for (const normalizedName of normalizedNames) {
        tsItem = latestRankingsIndex.steam.topSellersByName.get(normalizedName);
        if (tsItem) break;
      }
    }
  }

  if (mpItem) {
    result.steam = {
      currentPlayers: mpItem.ccu || mpItem.currentPlayers,
      rank: mpItem.rank,
      img: mpItem.img
    };
    if (!result.icon && mpItem.img) {
      result.icon = mpItem.img;
    }
  }

  // topSellers 처리 (위에서 이미 조회됨)
  if (tsItem) {
    if (!result.steam) {
      result.steam = { img: tsItem.img };
    }
    result.steam.salesRank = tsItem.rank;
    result.steam.price = tsItem.price || '';
    result.steam.discount = tsItem.discount || '';
    if (!result.icon && tsItem.img) {
      result.icon = tsItem.img;
    }
  }

  // 뉴스/커뮤니티/유튜브 수집 (역인덱스 사용 - O(1) 조회)
  if (contentIndex && contentIndex.has(gameName)) {
    const cached = contentIndex.get(gameName);
    result.news = cached.news || [];
    result.community = cached.community || [];
    result.youtube = cached.youtube || [];
  }

  return result;
}

// 관련 콘텐츠 로드 함수들 (이슈, 위키, 핫픽, 인사이트)
function loadIssueReports() {
  if (!fs.existsSync(issueDir)) return [];
  return fs.readdirSync(issueDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(issueDir, f), 'utf8'));
        if (data.status !== 'approved') return null;
        return {
          type: 'issue',
          slug: data.slug,
          title: data.title,
          summary: data.summary || '',
          thumbnail: fixUrl(data.thumbnail) || '',
          date: data.date,
          relatedGames: data.relatedGames || []
        };
      } catch (e) { return null; }
    })
    .filter(Boolean);
}

function loadHotpickReports() {
  if (!fs.existsSync(hotpickDir)) return [];
  return fs.readdirSync(hotpickDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(hotpickDir, f), 'utf8'));
        if (data.status !== 'approved') return null;
        return {
          type: 'hotpick',
          slug: data.slug,
          title: data.title,
          summary: data.summary || '',
          thumbnail: fixUrl(data.thumbnail) || '',
          date: data.date,
          relatedGames: data.relatedGames || []
        };
      } catch (e) { return null; }
    })
    .filter(Boolean);
}

function loadInsightReports() {
  if (!fs.existsSync(insightDir)) return [];
  return fs.readdirSync(insightDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(insightDir, f), 'utf8'));
        if (data.status !== 'approved') return null;
        return {
          type: 'insight',
          slug: data.slug,
          title: data.title,
          summary: data.summary || '',
          thumbnail: fixUrl(data.thumbnail) || '',
          date: data.date,
          relatedGames: data.relatedGames || []
        };
      } catch (e) { return null; }
    })
    .filter(Boolean);
}

function loadWikiArticles() {
  if (!fs.existsSync(wikiDir)) return [];
  const categories = ['business', 'tech', 'history', 'knowledge'];
  const categoryNames = { history: '히스토리', knowledge: '지식', tech: '기술', business: '비즈니스' };
  const articles = [];

  for (const category of categories) {
    const catDir = path.join(wikiDir, category);
    if (!fs.existsSync(catDir)) continue;

    fs.readdirSync(catDir)
      .filter(f => f.endsWith('.json'))
      .forEach(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(catDir, f), 'utf8'));
          if (data.status !== 'approved') return;
          articles.push({
            type: 'wiki',
            category: category,
            categoryName: categoryNames[category],
            slug: data.slug,
            title: data.title,
            summary: data.summary || '',
            thumbnail: fixUrl(data.thumbnail) || '',
            date: data.date,
            relatedGames: data.relatedGames || []
          });
        } catch (e) {}
      });
  }
  return articles;
}

// 게임 slug로 관련 콘텐츠 필터링
function collectRelatedContent(gameSlug, allContent) {
  return allContent
    .filter(item => item.relatedGames && item.relatedGames.includes(gameSlug))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function updateSitemapGameEntries() {
  const sitemapPath = path.join(__dirname, '..', docsDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.warn('⚠️ sitemap.xml 없음: 게임 페이지 항목 갱신 스킵');
    return;
  }

  let xml = fs.readFileSync(sitemapPath, 'utf8');
  const lineBreak = xml.includes('\r\n') ? '\r\n' : '\n';
  const sitemapDate = new Date().toISOString().split('T')[0];

  const urlBlockRegex = /<url>[\s\S]*?<\/url>\s*/g;
  xml = xml.replace(urlBlockRegex, (block) => {
    const match = block.match(/<loc>([^<]+)<\/loc>/);
    if (!match) return block;
    const loc = match[1];
    const isGameDetail = /^https:\/\/(?:m\.)?gamerscroll\.com\/games\/[^/]+\/$/.test(loc);
    return isGameDetail ? '' : block;
  });

  const gameDirs = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const entries = [];
  for (const slug of gameDirs) {
    const indexPath = path.join(outputDir, slug, 'index.html');
    if (!fs.existsSync(indexPath)) continue;

    const htmlHead = fs.readFileSync(indexPath, 'utf8').slice(0, 1000);
    if (htmlHead.includes('noindex')) continue;

    const loc = `${siteBaseUrl}/games/${slug}/`;
    entries.push([
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${sitemapDate}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.6</priority>',
      '  </url>'
    ].join(lineBreak));
  }

  const insertBlock = entries.length ? lineBreak + entries.join(lineBreak) + lineBreak : '';
  if (xml.includes('</urlset>')) {
    xml = xml.replace(/<\/urlset>\s*$/, `${insertBlock}</urlset>`);
    fs.writeFileSync(sitemapPath, xml, 'utf8');
    console.log(`📍 sitemap 게임 항목 갱신: ${entries.length}개`);
  } else {
    console.warn('⚠️ sitemap.xml 형식 이상: </urlset> 없음');
  }
}

// ============ 메인 실행 ============
console.log(`🎮 게임 페이지 생성 시작... (→ ${docsDir}/games)\n`);

// 출력 디렉토리 생성
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// ★ 스킵 체크를 파일 로드 전에 수행 (성능 최적화)
const incrementalCache = buildCache.loadCache();
const inputSignature = buildCache.getInputFilesSignature([
  gamesPath,
  historyDir,
  reportsDir,
  snapshotsDir,
  wikiDir,
  issueDir,
  hotpickDir,
  insightDir
]);

const searchIndexPath = path.join(outputDir, 'search-index.json');
if (!buildCache.checkInputFilesChanged(incrementalCache, 'gamePages', inputSignature)) {
  // 입력 파일 변경 없음 → 전체 스킵 (파일 로드 없이 즉시 종료)
  console.log(`  ⚡ 입력 파일 변경 없음 → 게임 페이지 전체 스킵`);
  buildCache.saveCache(incrementalCache);

  if (fs.existsSync(searchIndexPath)) {
    const existingIndex = JSON.parse(fs.readFileSync(searchIndexPath, 'utf8'));
    console.log(`\n✅ 게임 페이지 생성 완료! (전체 스킵)`);
    console.log(`검색 인덱스: ${existingIndex.length}개 (기존 유지)`);
    process.exit(0);
  }
}

console.log(`  🔄 입력 파일 변경 감지 → 증분 빌드 진행`);

// 전체 파일 목록 가져오기
const allHistoryFiles = getAllHistoryFiles();
const allReportFiles = getAllReportFiles();

console.log(`📈 히스토리: ${allHistoryFiles.length}개`);
console.log(`📊 리포트: ${allReportFiles.length}개`);

// 전체 히스토리 로드 (1회만)
const allHistory = loadHistoryFiles(allHistoryFiles);

// 최신 히스토리 = allHistory 마지막 항목 (중복 로드 제거)
const historyData = allHistory.length > 0 ? allHistory[allHistory.length - 1].data : null;
console.log(`📂 최신 히스토리 로드: ${historyData ? '성공' : '없음'}`);

// 최신 히스토리 순위/스팀 역인덱스 빌드
const latestRankingsIndex = buildLatestRankingsIndex(historyData);

// 순위 인덱스 빌드 (성능 최적화)
console.time('🔍 순위 인덱스 빌드');
const rankIndex = buildRankIndex(allHistory);
const historyDates = allHistory.map(h => h.date).sort();
console.timeEnd('🔍 순위 인덱스 빌드');
console.log(`   인덱스 크기: ${rankIndex.size}개 appId`);

// 전체 리포트 로드
const allReports = loadReportFiles(allReportFiles);

// 주간 리포트 로드 (수량 적어서 전체 로드)
const weeklyReports = loadWeeklyReports();
console.log(`📊 주간 리포트 로드: ${weeklyReports.length}개`);

// 24시간 실시간 스냅샷 로드 (항상 최신)
const hourlySnapshots = loadHourlySnapshots();
const snapshotKeys = Object.keys(hourlySnapshots).filter(k => hourlySnapshots[k].length > 0);
console.log(`⏱️ 실시간 스냅샷 로드: ${snapshotKeys.length}개 지역`);

// 실시간 스냅샷 역인덱스 빌드
const t0Hourly = Date.now();
const hourlyIndex = buildHourlySnapshotsIndex(hourlySnapshots);
console.log(`🔍 실시간 스냅샷 인덱스: ${Date.now() - t0Hourly}ms (appId: ${hourlyIndex.byAppId.size}, title: ${hourlyIndex.byTitle.size})`);

// 관련 콘텐츠 로드 (이슈, 위키, 핫픽, 인사이트)
const issueArticles = loadIssueReports();
const hotpickArticles = loadHotpickReports();
const insightArticles = loadInsightReports();
const wikiArticles = loadWikiArticles();
const allRelatedContent = [...issueArticles, ...hotpickArticles, ...insightArticles, ...wikiArticles];
console.log(`📰 관련 콘텐츠 로드: 이슈 ${issueArticles.length}개, 핫픽 ${hotpickArticles.length}개, 인사이트 ${insightArticles.length}개, 위키 ${wikiArticles.length}개`);

// 검색 인덱스 생성
const searchIndex = [];

let forceFullRebuild = false;

// CSS/템플릿 변경 시 전체 재빌드 (generate-html-report.js에서 이미 체크했으므로 여기선 캐시만 참조)
if (buildCache.checkTemplateChanged(incrementalCache)) {
  forceFullRebuild = true;
  console.log('  📝 템플릿 버전 변경 → 전체 재빌드');
}

// 순위에 있거나 데이터가 있는 게임만 페이지 생성
let generatedCount = 0;
let skippedCount = 0;
let cacheSkippedCount = 0;

// 성능 측정
let timeCollectData = 0, timeRelated = 0, timeHash = 0, timeTemplate = 0, timeWrite = 0;

// 파일 쓰기 카운터
let writeCount = 0;

// 역인덱스 사전 빌드 (O(items × games) → 1회만)
const t0Index = Date.now();
const contentIndex = buildContentIndex(historyData, gamesData);
const mentionsIndex = buildMentionsIndex(allReports, weeklyReports, gamesData);
console.log(`🔍 역인덱스 빌드: ${Date.now() - t0Index}ms (콘텐츠 + 멘션)`);

for (const [gameName, gameInfo] of Object.entries(gamesData.games)) {
  // games.json의 slug를 우선 사용, 없으면 createSlug로 생성
  const slug = gameInfo.slug || createSlug(gameName, gameInfo.appIds);

  // 게임 데이터 수집
  let t0 = Date.now();
  const gameData = collectGameData(gameName, gameInfo, historyData, allReports, rankIndex, historyDates, weeklyReports, hourlySnapshots, contentIndex, mentionsIndex, latestRankingsIndex, hourlyIndex);
  timeCollectData += Date.now() - t0;

  // 관련 콘텐츠 수집 (relatedGames에 이 게임 slug가 포함된 이슈/위키/핫픽/인사이트)
  t0 = Date.now();
  gameData.relatedContent = collectRelatedContent(slug, allRelatedContent);
  timeRelated += Date.now() - t0;

  // 데이터가 없어도 페이지/검색 인덱스를 생성하도록 변경
  const hasData = Object.keys(gameData.rankings).length > 0 ||
    gameData.news.length > 0 ||
    gameData.community.length > 0 ||
    gameData.steam !== null ||
    gameData.youtube.length > 0 ||
    gameData.mentions.length > 0 ||
    gameData.rankHistory.length > 0 ||
    gameData.steamHistory.length > 0;

  if (!hasData) {
    skippedCount++;
  }

  const gameDir = path.join(outputDir, slug);

  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  // slug를 gameData에 추가하여 템플릿에서 canonical URL 생성에 사용
  gameData.slug = slug;
  gameData.hasData = hasData;

  // 증분 빌드: 게임 데이터 해시 비교
  const cacheKey = slug;
  if (!forceFullRebuild && !buildCache.checkItemChanged(incrementalCache.games, cacheKey, gameData)) {
    cacheSkippedCount++;
    // 검색 인덱스에는 항상 추가 (스킵해도)
    searchIndex.push({
      name: gameName,
      slug: slug,
      icon: gameInfo.icon || null,
      aliases: gameInfo.aliases || [],
      platforms: gameInfo.platforms || [],
      developer: gameInfo.developer || '',
      hasRankings: Object.keys(gameData.rankings).length > 0,
      hasSteam: (gameInfo.platforms || []).includes('steam'),
      hasData
    });
    generatedCount++;
    continue;
  }

  t0 = Date.now();
  const html = generateGamePage(gameData);
  timeTemplate += Date.now() - t0;

  // 파일 쓰기 (동기)
  const t0w = Date.now();
  fs.writeFileSync(path.join(gameDir, 'index.html'), html, 'utf8');
  timeWrite += Date.now() - t0w;

  // 캐시 업데이트
  buildCache.updateCacheSection(incrementalCache.games, cacheKey, gameData);
  writeCount++;

  // 검색 인덱스에 추가
  searchIndex.push({
    name: gameName,
    slug: slug,
    icon: gameInfo.icon || null,
    aliases: gameInfo.aliases || [],
    platforms: gameInfo.platforms || [],
    developer: gameInfo.developer || '',
    hasRankings: Object.keys(gameData.rankings).length > 0,
    hasSteam: (gameInfo.platforms || []).includes('steam'),
    hasData
  });

  generatedCount++;
  if (generatedCount <= 10 || generatedCount % 100 === 0) {
    console.log(`✓ ${gameName} → /games/${slug}/`);
  }
}

// 성능 측정 결과 출력
console.log(`\n⏱️  성능 측정:`);
console.log(`   collectGameData: ${(timeCollectData/1000).toFixed(2)}s`);
console.log(`   collectRelatedContent: ${(timeRelated/1000).toFixed(2)}s`);
console.log(`   generateGamePage: ${(timeTemplate/1000).toFixed(2)}s`);
console.log(`   파일 쓰기: ${(timeWrite/1000).toFixed(2)}s`);

// 검색 인덱스 저장
fs.writeFileSync(searchIndexPath, JSON.stringify(searchIndex, null, 2), 'utf8');

// 증분 빌드: 입력 파일 시그니처 + 캐시 저장
buildCache.updateInputFilesSignature(incrementalCache, 'gamePages', inputSignature);
buildCache.saveCache(incrementalCache);

// updateSitemapGameEntries(); // 게임 페이지는 noindex → sitemap 제외

const actualBuilt = generatedCount - cacheSkippedCount;
console.log(`\n✅ 게임 페이지 생성 완료!`);
console.log(`총: ${generatedCount}개, 빌드: ${actualBuilt}개, 캐시 스킵: ${cacheSkippedCount}개`);
console.log(`데이터 없음 스킵: ${skippedCount}개`);
console.log(`검색 인덱스: ${searchIndexPath}`);
