'use strict';

/**
 * 시간별 순위 스냅샷(snapshots/rankings/*.csv) 영구 보관용 압축 아카이브.
 *
 * 하루치 CSV(스토어×국가×차트, 하루 여러 시각)를 하나의 파일로 묶는다.
 *   snapshots/archive/YYYY-MM-DD.json.br
 *
 * 포맷 (v1):
 *   {
 *     v: 1, date, ids: [appId, ...], titles: [title, ...],
 *     lists: { "ios_kr_grossing": { times: ["01:30", ...], ranks: [[idx, idx, ...], ...] } }
 *   }
 *   ranks[t][r-1] = ids/titles 배열 인덱스(사전 항목은 (appId, title) 쌍). 배열 위치가 곧 순위라
 *   순위 숫자는 저장하지 않는다. 비어 있는 순위 칸은 -1.
 *
 * brotli(품질 11, 창 24)로 압축하면 원본 CSV 대비 약 1/50~1/90 이 된다.
 * readDay() 는 CSV 를 읽었을 때와 같은 행 모양({ key, time, rank, appId, title })으로 되돌린다.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CSV_DIR = path.join(ROOT, 'snapshots', 'rankings');
const DEFAULT_ARCHIVE_DIR = path.join(ROOT, 'snapshots', 'archive');

const FILE_RE = /^(\d{4}-\d{2}-\d{2})_([a-z]+)_([a-z]+)_([a-z]+)\.csv$/;
// time,rank,id,title  (title 은 따옴표로 감싸일 수 있고 쉼표를 포함할 수 있다)
const LINE_RE = /^(\d{2}:\d{2}),(\d+),([^,]*),(.*)$/;

function unquote(s) {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function parseCsv(content) {
  const rows = [];
  for (const line of content.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('time,')) continue;
    const m = l.match(LINE_RE);
    if (!m) continue;
    rows.push({ time: m[1], rank: parseInt(m[2], 10), appId: m[3].trim(), title: unquote(m[4]) });
  }
  return rows;
}

function csvFilesForDay(date, csvDir) {
  if (!fs.existsSync(csvDir)) return [];
  return fs.readdirSync(csvDir)
    .filter((f) => f.startsWith(`${date}_`) && FILE_RE.test(f))
    .sort();
}

function listCsvDays(csvDir = DEFAULT_CSV_DIR) {
  if (!fs.existsSync(csvDir)) return [];
  const days = new Set();
  for (const f of fs.readdirSync(csvDir)) {
    const m = f.match(FILE_RE);
    if (m) days.add(m[1]);
  }
  return [...days].sort();
}

function archivePath(date, archiveDir = DEFAULT_ARCHIVE_DIR) {
  return path.join(archiveDir, `${date}.json.br`);
}

function listArchivedDays(archiveDir = DEFAULT_ARCHIVE_DIR) {
  if (!fs.existsSync(archiveDir)) return [];
  return fs.readdirSync(archiveDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.br$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

/** 하루치 CSV → 아카이브 객체 (압축 전). rowCount 는 검증용. */
function buildDay(date, csvDir = DEFAULT_CSV_DIR) {
  const files = csvFilesForDay(date, csvDir);
  if (files.length === 0) return null;

  const idIndex = new Map();   // appId → idx
  const ids = [];
  const titles = [];
  const lists = {};
  let rowCount = 0;

  // 사전 항목은 (appId, title) 쌍이다. 같은 앱이 국가별로 다른 현지화 제목을 가지므로
  // ID만으로 묶으면 복원 시 제목이 달라진다. 중복은 brotli 가 흡수한다.
  const indexOf = (appId, title) => {
    const key = `${appId}\0${title}`;
    let idx = idIndex.get(key);
    if (idx === undefined) {
      idx = ids.length;
      idIndex.set(key, idx);
      ids.push(appId || '');
      titles.push(title);
    }
    return idx;
  };

  for (const f of files) {
    const m = f.match(FILE_RE);
    const key = `${m[2]}_${m[3]}_${m[4]}`;
    const rows = parseCsv(fs.readFileSync(path.join(csvDir, f), 'utf8'));
    const byTime = new Map();
    for (const r of rows) {
      if (!byTime.has(r.time)) byTime.set(r.time, []);
      byTime.get(r.time)[r.rank - 1] = indexOf(r.appId, r.title);
      rowCount++;
    }
    const times = [...byTime.keys()].sort();
    const ranks = times.map((t) => {
      const arr = byTime.get(t);
      // 중간에 빈 순위가 있으면 -1
      for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = -1;
      return arr;
    });
    lists[key] = { times, ranks };
  }

  return { archive: { v: 1, date, ids, titles, lists }, rowCount, files };
}

function compress(obj) {
  return zlib.brotliCompressSync(Buffer.from(JSON.stringify(obj), 'utf8'), {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
    }
  });
}

function decompress(buf) {
  return JSON.parse(zlib.brotliDecompressSync(buf).toString('utf8'));
}

/** 아카이브 객체 → CSV 행 모양 [{ key, time, rank, appId, title }] */
function expandDay(archive) {
  const rows = [];
  for (const [key, list] of Object.entries(archive.lists || {})) {
    list.times.forEach((time, t) => {
      const arr = list.ranks[t] || [];
      for (let i = 0; i < arr.length; i++) {
        const idx = arr[i];
        if (idx < 0) continue;
        rows.push({ key, time, rank: i + 1, appId: archive.ids[idx], title: archive.titles[idx] });
      }
    });
  }
  return rows;
}

/** 아카이브 파일 읽기. 없으면 null. */
function readDay(date, archiveDir = DEFAULT_ARCHIVE_DIR) {
  const file = archivePath(date, archiveDir);
  if (!fs.existsSync(file)) return null;
  return decompress(fs.readFileSync(file));
}

/**
 * 하루치를 압축 저장하고, 다시 읽어 CSV 와 행 단위로 일치하는지 검증한다.
 * 검증 실패 시 파일을 남기지 않고 throw.
 */
function packDay(date, { csvDir = DEFAULT_CSV_DIR, archiveDir = DEFAULT_ARCHIVE_DIR, force = false } = {}) {
  const out = archivePath(date, archiveDir);
  if (!force && fs.existsSync(out)) return { date, skipped: true, reason: 'exists' };

  const built = buildDay(date, csvDir);
  if (!built) return { date, skipped: true, reason: 'no-csv' };

  const buf = compress(built.archive);

  // 검증: 원본 CSV 행 집합 == 복원 행 집합
  const restored = expandDay(decompress(buf));
  const expect = new Set();
  let csvBytes = 0;
  for (const f of built.files) {
    const m = f.match(FILE_RE);
    const key = `${m[2]}_${m[3]}_${m[4]}`;
    const content = fs.readFileSync(path.join(csvDir, f), 'utf8');
    csvBytes += Buffer.byteLength(content);
    for (const r of parseCsv(content)) expect.add(`${key}|${r.time}|${r.rank}|${r.appId}|${r.title}`);
  }
  const got = new Set(restored.map((r) => `${r.key}|${r.time}|${r.rank}|${r.appId}|${r.title}`));
  if (expect.size !== got.size || [...expect].some((k) => !got.has(k))) {
    throw new Error(`archive verify failed for ${date}: csv=${expect.size} restored=${got.size}`);
  }

  fs.mkdirSync(archiveDir, { recursive: true });
  const tmp = `${out}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, out);

  return {
    date,
    skipped: false,
    files: built.files.length,
    rows: built.rowCount,
    apps: built.archive.ids.length,
    csvBytes,
    bytes: buf.length
  };
}

module.exports = {
  DEFAULT_CSV_DIR,
  DEFAULT_ARCHIVE_DIR,
  compress,
  decompress,
  parseCsv,
  listCsvDays,
  listArchivedDays,
  archivePath,
  buildDay,
  expandDay,
  readDay,
  packDay
};
