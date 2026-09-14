'use strict';

/**
 * 글로벌(전 국가) 순위 스냅샷 저장소.
 *
 *   snapshots/global/apps.json          앱 사전 — "ios:<adamId>" / "aos:<package>" → { t: 제목, d: 개발사, i: 아이콘 }
 *   snapshots/global/YYYY-MM-DD.json.br 하루치 순위 (KST 날짜, 회차별 누적)
 *
 * 하루 파일 포맷 (v1):
 *   { v: 1, date, ids: ["<storeId>", ...],
 *     lists: { "ios_kr_grossing": { times: ["01:00", ...], ranks: [[idx, ...], ...] } } }
 *   runs[time] 에 회차별 수집 상태를 추가 저장한다. 이전 파일에는 없을 수 있다.
 *   ranks[t][r-1] = ids 인덱스. 배열 위치가 곧 순위. 제목·개발사는 사전에서 찾는다.
 *   같은 시각(HH:MM)이 다시 들어오면 덮어쓴다.
 *
 * 압축은 snapshot-archive 와 같은 brotli 설정을 쓴다.
 */

const fs = require('fs');
const path = require('path');
const { compress, decompress } = require('./snapshot-archive');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_DIR = path.join(ROOT, 'snapshots', 'global');

function appsPath(dir = DEFAULT_DIR) { return path.join(dir, 'apps.json'); }
function dayPath(date, dir = DEFAULT_DIR) { return path.join(dir, `${date}.json.br`); }

function loadApps(dir = DEFAULT_DIR) {
  const file = appsPath(dir);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

/** 키 정렬 후 저장 — git diff 가 안정적이도록. */
function saveApps(apps, dir = DEFAULT_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const sorted = {};
  for (const k of Object.keys(apps).sort()) sorted[k] = apps[k];
  const tmp = `${appsPath(dir)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sorted), 'utf8');
  fs.renameSync(tmp, appsPath(dir));
}

function readDay(date, dir = DEFAULT_DIR) {
  const file = dayPath(date, dir);
  if (!fs.existsSync(file)) return null;
  return decompress(fs.readFileSync(file));
}

function listDays(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.br$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

/** 이전 회차의 상태와 마지막 성공 위치. 과거 순위를 새 회차로 복사하지 않는다. */
function readCollectionState(keys, dir = DEFAULT_DIR) {
  const state = Object.fromEntries(keys.map((key) => [key, { status: 'unknown', lastSuccess: null }]));
  const unresolved = new Set(keys);
  const unchecked = new Set(keys);
  for (const date of listDays(dir).reverse()) {
    const day = readDay(date, dir);
    const times = [...new Set([
      ...Object.keys(day.runs || {}),
      ...Object.values(day.lists).flatMap((list) => list.times)
    ])].sort().reverse();
    for (const time of times) {
      const report = day.runs?.[time];
      for (const key of new Set([...unchecked, ...unresolved])) {
        const list = day.lists[key];
        const at = list ? list.times.indexOf(time) : -1;
        const recorded = report?.charts[key];
        const count = at >= 0 ? list.ranks[at].length : 0;
        if (unchecked.has(key) && (!report || recorded)) {
          state[key].status = recorded?.status || (count ? 'ok' : 'unknown');
          unchecked.delete(key);
        }
        if (unresolved.has(key) && count && (!recorded || recorded.status === 'ok')) {
          state[key].lastSuccess = { date, time, count, observedAt: recorded?.observedAt || null };
          unresolved.delete(key);
        }
      }
      if (!unresolved.size && !unchecked.size) return state;
    }
  }
  return state;
}

/**
 * 한 회차의 순위를 하루 파일에 덧붙인다.
 * @param {string} date  KST YYYY-MM-DD
 * @param {string} time  KST HH:MM
 * @param {Object<string,string[]>} lists  "ios_kr_grossing" → storeId 배열(순위순)
 */
function appendRun(date, time, lists, dir = DEFAULT_DIR, report = null) {
  const day = readDay(date, dir) || { v: 1, date, ids: [], lists: {} };
  if (report) {
    // 같은 회차를 다시 저장할 때 실패한 차트에 이전 성공 데이터가 남지 않게 한다.
    for (const key of Object.keys(report.charts)) {
      const list = day.lists[key];
      const at = list ? list.times.indexOf(time) : -1;
      if (at >= 0) {
        list.times.splice(at, 1);
        list.ranks.splice(at, 1);
        if (!list.times.length) delete day.lists[key];
      }
    }
    day.runs ||= {};
    day.runs[time] = report;
  }
  const idIndex = new Map(day.ids.map((id, i) => [id, i]));
  const indexOf = (id) => {
    let i = idIndex.get(id);
    if (i === undefined) { i = day.ids.length; day.ids.push(id); idIndex.set(id, i); }
    return i;
  };

  let rows = 0;
  for (const [key, ids] of Object.entries(lists)) {
    if (!ids || ids.length === 0) continue;
    const list = day.lists[key] || (day.lists[key] = { times: [], ranks: [] });
    const ranks = ids.map((id) => indexOf(String(id)));
    rows += ranks.length;
    const at = list.times.indexOf(time);
    if (at >= 0) list.ranks[at] = ranks;
    else {
      // 시각순 삽입
      let pos = list.times.findIndex((t) => t > time);
      if (pos < 0) pos = list.times.length;
      list.times.splice(pos, 0, time);
      list.ranks.splice(pos, 0, ranks);
    }
  }

  fs.mkdirSync(dir, { recursive: true });
  const buf = compress(day);
  const out = dayPath(date, dir);
  fs.writeFileSync(`${out}.tmp`, buf);
  fs.renameSync(`${out}.tmp`, out);
  return { rows, lists: Object.keys(day.lists).length, ids: day.ids.length, bytes: buf.length };
}

/** 하루 파일 → 행 [{ key, time, rank, id }] */
function expandDay(day) {
  const rows = [];
  for (const [key, list] of Object.entries(day.lists || {})) {
    list.times.forEach((time, t) => {
      (list.ranks[t] || []).forEach((idx, i) => rows.push({ key, time, rank: i + 1, id: day.ids[idx] }));
    });
  }
  return rows;
}

module.exports = { DEFAULT_DIR, appsPath, dayPath, loadApps, saveApps, readDay, listDays, readCollectionState, appendRun, expandDay };
