/**
 * 게임 대시보드 페이지 자동 생성
 * games-final.json의 모든 게임에 대해 개별 페이지 생성
 */

const fs = require('fs');
const path = require('path');

const gamesPath = path.join(__dirname, '..', 'data', 'games.json');
const historyDir = path.join(__dirname, '..', 'history');
const reportsDir = path.join(__dirname, '..', 'reports');
const snapshotsDir = path.join(__dirname, '..', 'snapshots', 'rankings');
const outputDir = path.join(__dirname, '..', 'docs', 'games');
const cacheDir = path.join(__dirname, '..', 'data', 'cache');
const cachePath = path.join(cacheDir, 'game-pages-cache.json');

// 캐시 버전 (데이터 구조 변경 시 증가)
const CACHE_VERSION = 1;

// 템플릿 import
const { generateGamePage } = require('../src/templates/pages/game');

// 게임 데이터 로드
const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));

// 이름 정규화 (비교용)
function normalize(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// URL-safe 슬러그 생성 (앱 ID 우선, 없으면 이름 기반)
function createSlug(name, appIds = null) {
  // 앱 ID가 있으면 우선 사용 (Android > iOS)
  if (appIds) {
    if (appIds.android) {
      return appIds.android;  // com.nexon.maplem
    }
    if (appIds.ios && appIds.ios.startsWith('com.')) {
      return appIds.ios;  // com.xxx.xxx 형식만
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

// ============ 캐시 시스템 ============

// 캐시 로드 (실패 시 빈 캐시 반환)
function loadCache() {
  try {
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      // 버전 체크
      if (cache.version !== CACHE_VERSION) {
        console.log('⚠️ 캐시 버전 불일치, 전체 재빌드...');
        return createEmptyCache();
      }
      return cache;
    }
  } catch (e) {
    console.log('⚠️ 캐시 로드 실패, 전체 재빌드...');
  }
  return createEmptyCache();
}

// 빈 캐시 생성
function createEmptyCache() {
  return {
    version: CACHE_VERSION,
    lastBuildDate: null,
    processedHistoryFiles: [],
    processedReportFiles: [],
    games: {}  // gameSlug -> { rankHistory, steamHistory, mentions }
  };
}

// 캐시 저장
function saveCache(cache) {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    cache.lastBuildDate = new Date().toISOString().split('T')[0];
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
    console.log(`💾 캐시 저장: ${cachePath}`);
  } catch (e) {
    console.log('⚠️ 캐시 저장 실패:', e.message);
  }
}

// 새로운 파일만 필터링
function getNewFiles(allFiles, processedFiles) {
  const processedSet = new Set(processedFiles);
  return allFiles.filter(f => !processedSet.has(f));
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

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const platforms = ['ios', 'aos'];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const categories = ['grossing'];

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
                // CSV 파싱: time,rank,id,title
                const match = line.match(/^(\d{2}:\d{2}),(\d+),.*?,"?([^"]*)"?$/);
                if (match) {
                  const [, time, rank, title] = match;
                  allData.push({
                    date: dateStr,
                    time,
                    rank: parseInt(rank, 10),
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

// 게임별 실시간 순위 추출 (빠진 시간대는 이전 순위로 채움)
function extractGameHourlyRanks(gameName, aliases, hourlySnapshots) {
  const allNames = [gameName, ...(aliases || [])].map(n => normalize(n));
  const result = {};

  for (const [key, data] of Object.entries(hourlySnapshots)) {
    const gameRanks = [];
    const seenTimes = new Set();

    for (const item of data) {
      if (allNames.includes(normalize(item.title))) {
        const timeKey = `${item.date} ${item.time}`;
        if (!seenTimes.has(timeKey)) {
          seenTimes.add(timeKey);
          gameRanks.push({
            date: item.date,
            time: item.time,
            rank: item.rank
          });
        }
      }
    }

    if (gameRanks.length > 0) {
      // 시간순 정렬
      gameRanks.sort((a, b) => {
        const aKey = `${a.date} ${a.time}`;
        const bKey = `${b.date} ${b.time}`;
        return aKey.localeCompare(bKey);
      });

      // 최근 24시간 데이터만 필터링 (데이터의 마지막 시간 기준)
      const lastItem = gameRanks[gameRanks.length - 1];
      const lastDateTime = new Date(`${lastItem.date}T${lastItem.time}:00Z`);
      const cutoffTime = new Date(lastDateTime.getTime() - 24 * 60 * 60 * 1000);
      const cutoffDateStr = cutoffTime.toISOString().split('T')[0];
      const cutoffTimeStr = String(cutoffTime.getUTCHours()).padStart(2, '0') + ':00';
      const cutoffKey = `${cutoffDateStr} ${cutoffTimeStr}`;

      const filtered = gameRanks.filter(r => {
        const rKey = `${r.date} ${r.time}`;
        return rKey >= cutoffKey;
      });

      result[key] = filtered.length > 0 ? filtered : gameRanks.slice(-24);
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

// 게임 이름으로 관련 데이터 수집
function collectGameData(gameName, gameInfo, historyData, reports, allHistory, weeklyReports = [], hourlySnapshots = {}) {
  const allNames = [gameName, ...(gameInfo.aliases || [])];
  const normalizedNames = allNames.map(n => normalize(n));

  const result = {
    name: gameName,
    platforms: gameInfo.platforms || [],
    developer: gameInfo.developer || '',
    icon: null,  // 게임 아이콘 URL
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

  // 실시간 순위 추출
  result.realtimeRanks = extractGameHourlyRanks(gameName, gameInfo.aliases, hourlySnapshots);

  // 리포트에서 mentions 수집 (일간 + 주간)
  const dailyMentions = reports && reports.length > 0
    ? collectReportMentions(normalizedNames, reports)
    : [];
  const weeklyMentions = weeklyReports && weeklyReports.length > 0
    ? collectWeeklyMentions(normalizedNames, weeklyReports)
    : [];

  // 일간 + 주간 합쳐서 날짜순 정렬
  result.mentions = [...dailyMentions, ...weeklyMentions]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 순위 히스토리 수집 (매출 추이용) - 모든 국가, 카테고리
  if (allHistory && allHistory.length > 0) {
    const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
    const categories = ['grossing', 'free'];

    for (const { date, data } of allHistory) {
      const dayRanks = { date };
      let hasAnyRank = false;

      for (const cat of categories) {
        for (const region of regions) {
          // iOS와 Android 평균 순위 계산
          let iosRank = null, androidRank = null;

          for (const platform of ['ios', 'android']) {
            const items = data.rankings?.[cat]?.[region]?.[platform] || [];
            for (let i = 0; i < items.length; i++) {
              if (normalizedNames.includes(normalize(items[i].title || ''))) {
                if (platform === 'ios') iosRank = i + 1;
                else androidRank = i + 1;
                break;
              }
            }
          }

          // iOS/Android 각각 저장
          if (iosRank) {
            dayRanks[`${cat}-ios-${region}`] = iosRank;
            hasAnyRank = true;
          }
          if (androidRank) {
            dayRanks[`${cat}-aos-${region}`] = androidRank;
            hasAnyRank = true;
          }
        }
      }

      if (hasAnyRank) {
        result.rankHistory.push(dayRanks);
      }

      // 스팀 히스토리 수집 (동접 순위)
      const steamGames = [
        ...(data.steam?.mostPlayed || []),
        ...(data.steam?.topSellers || [])
      ];
      for (const item of steamGames) {
        if (normalizedNames.includes(normalize(item.name || ''))) {
          // 기존 날짜 데이터가 있으면 업데이트, 없으면 추가
          let steamDay = result.steamHistory.find(s => s.date === date);
          if (!steamDay) {
            steamDay = { date };
            result.steamHistory.push(steamDay);
          }
          // mostPlayed에서 찾으면 동접 순위
          if (data.steam?.mostPlayed?.some(g => normalize(g.name || '') === normalize(item.name || ''))) {
            const mpItem = data.steam.mostPlayed.find(g => normalize(g.name || '') === normalize(item.name || ''));
            if (mpItem) {
              steamDay.ccuRank = mpItem.rank;
              steamDay.ccu = mpItem.ccu;
            }
          }
          // topSellers에서 찾으면 판매 순위
          if (data.steam?.topSellers?.some(g => normalize(g.name || '') === normalize(item.name || ''))) {
            const tsItem = data.steam.topSellers.find(g => normalize(g.name || '') === normalize(item.name || ''));
            if (tsItem) {
              steamDay.salesRank = tsItem.rank;
            }
          }
          break;
        }
      }
    }
  }

  if (!historyData) return result;

  // 순위 데이터 수집 + 아이콘 수집
  const categories = ['grossing', 'free'];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const platforms = ['ios', 'android'];

  for (const cat of categories) {
    for (const region of regions) {
      for (const platform of platforms) {
        const items = historyData.rankings?.[cat]?.[region]?.[platform] || [];
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          if (normalizedNames.includes(normalize(item.title || ''))) {
            result.rankings[`${region}-${platform}-${cat}`] = {
              rank: index + 1,  // 배열 인덱스 + 1 = 순위
              change: item.change || 0
            };
            // 아이콘이 없으면 수집
            if (!result.icon && item.icon) {
              result.icon = item.icon;
            }
            break;
          }
        }
      }
    }
  }

  // 스팀 데이터 수집 (동접 순위 + 판매 순위 각각)
  const mostPlayed = historyData.steam?.mostPlayed || [];
  const topSellers = historyData.steam?.topSellers || [];

  // mostPlayed에서 동접 순위 찾기
  for (const item of mostPlayed) {
    if (normalizedNames.includes(normalize(item.name || ''))) {
      result.steam = {
        currentPlayers: item.ccu || item.currentPlayers,
        rank: item.rank,
        img: item.img
      };
      if (!result.icon && item.img) {
        result.icon = item.img;
      }
      break;
    }
  }

  // topSellers에서 판매 순위 + 가격/할인 찾기
  for (const item of topSellers) {
    if (normalizedNames.includes(normalize(item.name || ''))) {
      if (!result.steam) {
        result.steam = { img: item.img };
      }
      result.steam.salesRank = item.rank;
      result.steam.price = item.price || '';
      result.steam.discount = item.discount || '';
      if (!result.icon && item.img) {
        result.icon = item.img;
      }
      break;
    }
  }

  // 뉴스 수집
  const newsSources = historyData.news || {};
  for (const [source, items] of Object.entries(newsSources)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const title = (item.title || '').toLowerCase();
      if (normalizedNames.some(n => title.includes(n))) {
        result.news.push({
          title: item.title,
          link: item.link,
          thumbnail: item.thumbnail,
          source: source,
          date: item.date
        });
      }
    }
  }

  // 커뮤니티 수집
  const communityData = historyData.community || {};
  for (const [source, items] of Object.entries(communityData)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const title = (item.title || '').toLowerCase();
      if (normalizedNames.some(n => title.includes(n))) {
        result.community.push({
          title: item.title,
          link: item.link,
          source: source,
          comments: item.comments,
          views: item.views
        });
      }
    }
  }

  // 유튜브 수집
  const youtubeItems = Array.isArray(historyData.youtube) ? historyData.youtube : [];
  for (const item of youtubeItems) {
    const title = (item.title || '').toLowerCase();
    if (normalizedNames.some(n => title.includes(n))) {
      result.youtube.push({
        title: item.title,
        link: item.link,
        thumbnail: item.thumbnail,
        channel: item.channel
      });
    }
  }

  return result;
}

// ============ 메인 실행 ============
console.log('🎮 게임 페이지 생성 시작...\n');

// 출력 디렉토리 생성
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 캐시 로드
const cache = loadCache();
const isFirstBuild = cache.processedHistoryFiles.length === 0;
console.log(`📦 캐시: ${isFirstBuild ? '없음 (전체 빌드)' : `${Object.keys(cache.games).length}개 게임 캐시됨`}`);

// 전체 파일 목록 가져오기
const allHistoryFiles = getAllHistoryFiles();
const allReportFiles = getAllReportFiles();

// 새로운 파일만 찾기
const newHistoryFiles = getNewFiles(allHistoryFiles, cache.processedHistoryFiles);
const newReportFiles = getNewFiles(allReportFiles, cache.processedReportFiles);

console.log(`📈 히스토리: 전체 ${allHistoryFiles.length}개, 신규 ${newHistoryFiles.length}개`);
console.log(`📊 리포트: 전체 ${allReportFiles.length}개, 신규 ${newReportFiles.length}개`);

// 히스토리 로드 (최신 1개는 항상 로드)
const historyData = loadLatestHistory();
console.log(`📂 최신 히스토리 로드: ${historyData ? '성공' : '없음'}`);

// 신규 히스토리만 로드 (증분)
const newHistory = loadHistoryFiles(newHistoryFiles);

// 신규 리포트만 로드 (증분)
const newReports = loadReportFiles(newReportFiles);

// 주간 리포트 로드 (수량 적어서 전체 로드)
const weeklyReports = loadWeeklyReports();
console.log(`📊 주간 리포트 로드: ${weeklyReports.length}개`);

// 24시간 실시간 스냅샷 로드 (항상 최신)
const hourlySnapshots = loadHourlySnapshots();
const snapshotKeys = Object.keys(hourlySnapshots).filter(k => hourlySnapshots[k].length > 0);
console.log(`⏱️ 실시간 스냅샷 로드: ${snapshotKeys.length}개 지역`);

// 검색 인덱스 생성
const searchIndex = [];

// 순위에 있거나 데이터가 있는 게임만 페이지 생성
let generatedCount = 0;
let skippedCount = 0;
let cachedSkipCount = 0;

for (const [gameName, gameInfo] of Object.entries(gamesData.games)) {
  const slug = createSlug(gameName, gameInfo.appIds);

  // 캐시된 히스토리 데이터 가져오기
  const cachedGame = cache.games[slug] || { rankHistory: [], steamHistory: [], mentions: [] };

  // 신규 데이터로 게임 데이터 수집 (증분)
  const gameData = collectGameData(gameName, gameInfo, historyData, newReports, newHistory, weeklyReports, hourlySnapshots);

  // 캐시된 데이터와 신규 데이터 병합
  // rankHistory 병합 (날짜 기준 중복 제거)
  const existingDates = new Set(cachedGame.rankHistory.map(r => r.date));
  const newRankHistory = gameData.rankHistory.filter(r => !existingDates.has(r.date));
  const mergedRankHistory = [
    ...cachedGame.rankHistory,
    ...newRankHistory
  ].sort((a, b) => a.date.localeCompare(b.date));

  // steamHistory 병합 (날짜 기준 중복 제거)
  const existingSteamDates = new Set(cachedGame.steamHistory.map(s => s.date));
  const newSteamHistory = gameData.steamHistory.filter(s => !existingSteamDates.has(s.date));
  const mergedSteamHistory = [
    ...cachedGame.steamHistory,
    ...newSteamHistory
  ].sort((a, b) => a.date.localeCompare(b.date));

  // mentions 병합 (제목+날짜 기준 중복 제거)
  const existingMentionKeys = new Set(cachedGame.mentions.map(m => `${m.date}-${m.title}`));
  const newMentions = gameData.mentions.filter(m => !existingMentionKeys.has(`${m.date}-${m.title}`));
  const mergedMentions = [
    ...cachedGame.mentions,
    ...newMentions
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 신규 데이터 여부 확인
  const hasNewData = newRankHistory.length > 0 || newSteamHistory.length > 0 || newMentions.length > 0;

  // 병합된 데이터로 교체
  gameData.rankHistory = mergedRankHistory;
  gameData.steamHistory = mergedSteamHistory;
  gameData.mentions = mergedMentions;

  // 캐시 업데이트
  cache.games[slug] = {
    rankHistory: mergedRankHistory,
    steamHistory: mergedSteamHistory,
    mentions: mergedMentions
  };

  // 데이터가 있는 게임만 페이지 생성 (mentions도 포함)
  const hasData = Object.keys(gameData.rankings).length > 0 ||
    gameData.news.length > 0 ||
    gameData.community.length > 0 ||
    gameData.steam !== null ||
    gameData.youtube.length > 0 ||
    gameData.mentions.length > 0 ||
    mergedRankHistory.length > 0;

  if (!hasData) {
    skippedCount++;
    continue;
  }

  const gameDir = path.join(outputDir, slug);
  const pageExists = fs.existsSync(path.join(gameDir, 'index.html'));

  // 캐시에 있고 신규 데이터 없고 페이지 존재하면 스킵 (단, 실시간 데이터가 있으면 항상 재생성)
  const hasRealtimeData = Object.keys(gameData.realtimeRanks).length > 0;
  const hasCachedData = cachedGame.rankHistory.length > 0 || cachedGame.steamHistory.length > 0 || cachedGame.mentions.length > 0;
  if (hasCachedData && !hasNewData && !hasRealtimeData && pageExists) {
    // 검색 인덱스에만 추가
    searchIndex.push({
      name: gameName,
      slug: slug,
      aliases: gameInfo.aliases || [],
      platforms: gameInfo.platforms || [],
      developer: gameInfo.developer || '',
      hasRankings: Object.keys(gameData.rankings).length > 0,
      hasSteam: gameData.steam !== null
    });
    cachedSkipCount++;
    continue;
  }

  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  // slug를 gameData에 추가하여 템플릿에서 canonical URL 생성에 사용
  gameData.slug = slug;

  const html = generateGamePage(gameData);
  fs.writeFileSync(path.join(gameDir, 'index.html'), html, 'utf8');

  // 검색 인덱스에 추가
  searchIndex.push({
    name: gameName,
    slug: slug,
    aliases: gameInfo.aliases || [],
    platforms: gameInfo.platforms || [],
    developer: gameInfo.developer || '',
    hasRankings: Object.keys(gameData.rankings).length > 0,
    hasSteam: gameData.steam !== null
  });

  generatedCount++;
  if (generatedCount <= 10 || generatedCount % 100 === 0) {
    console.log(`✓ ${gameName} → /games/${slug}/`);
  }
}

// 처리된 파일 목록 캐시에 기록
cache.processedHistoryFiles = allHistoryFiles;
cache.processedReportFiles = allReportFiles;

// 캐시 저장
saveCache(cache);

// 검색 인덱스 저장
const searchIndexPath = path.join(outputDir, 'search-index.json');
fs.writeFileSync(searchIndexPath, JSON.stringify(searchIndex, null, 2), 'utf8');

console.log(`\n✅ 게임 페이지 생성 완료!`);
console.log(`생성: ${generatedCount}개`);
console.log(`스킵 (캐시 히트): ${cachedSkipCount}개`);
console.log(`스킵 (데이터 없음): ${skippedCount}개`);
console.log(`캐시된 게임: ${Object.keys(cache.games).length}개`);
console.log(`검색 인덱스: ${searchIndexPath}`);
