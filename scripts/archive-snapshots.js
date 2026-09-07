#!/usr/bin/env node
'use strict';

/**
 * 시간별 순위 스냅샷 CSV 를 날짜별 압축 아카이브(snapshots/archive/*.json.br)로 영구 보관한다.
 *
 * CSV 는 건드리지 않는다 — 삭제는 기존 45일 prune 이 그대로 담당하고,
 * 이 스크립트는 prune 보다 먼저 실행되어 지워지기 전에 아카이브를 만든다.
 *
 * Usage:
 *   node scripts/archive-snapshots.js [--keep-days 2] [--force] [--dry-run] [--verify]
 *
 *   --keep-days N  오늘(KST) 기준 N일 이내는 아직 수집 중이므로 건너뛴다 (기본 2)
 *   --force        이미 아카이브된 날짜도 다시 만든다
 *   --dry-run      대상 날짜와 예상 크기만 출력
 *   --verify       모든 아카이브를 읽어 CSV 가 남아 있는 날짜는 행 단위로 대조
 */

const fs = require('fs');
const path = require('path');
const { listCsvDays, listArchivedDays, packDay, readDay, expandDay, buildDay, parseCsv, DEFAULT_CSV_DIR } =
  require('./lib/snapshot-archive');

function parseArgs(argv) {
  const o = { keepDays: 2, force: false, dryRun: false, verify: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep-days') o.keepDays = Number(argv[++i]) || 0;
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--verify') o.verify = true;
  }
  return o;
}

function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kb(n) { return `${(n / 1024).toFixed(1)}KB`; }

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.verify) {
    let ok = 0, bad = 0;
    for (const date of listArchivedDays()) {
      const archive = readDay(date);
      const restored = expandDay(archive);
      const built = buildDay(date);
      if (!built) { ok++; continue; } // CSV 는 이미 prune 됨 — 읽기만 확인
      const expect = new Set();
      for (const f of built.files) {
        const key = f.slice(11, -4);
        for (const r of parseCsv(fs.readFileSync(path.join(DEFAULT_CSV_DIR, f), 'utf8'))) {
          expect.add(`${key}|${r.time}|${r.rank}|${r.appId}|${r.title}`);
        }
      }
      const got = new Set(restored.map((r) => `${r.key}|${r.time}|${r.rank}|${r.appId}|${r.title}`));
      const same = expect.size === got.size && [...expect].every((k) => got.has(k));
      if (same) ok++; else { bad++; console.log(`  ✗ ${date}: csv=${expect.size} archive=${got.size}`); }
    }
    console.log(`verify: ${ok} ok, ${bad} mismatch`);
    process.exit(bad ? 1 : 0);
  }

  const cutoff = new Date(Date.parse(kstToday()) - opts.keepDays * 86400000).toISOString().slice(0, 10);
  const archived = new Set(listArchivedDays());
  const targets = listCsvDays().filter((d) => d < cutoff && (opts.force || !archived.has(d)));

  if (targets.length === 0) {
    console.log(`archive-snapshots: 대상 없음 (cutoff < ${cutoff})`);
    return;
  }

  let totalCsv = 0, totalBr = 0;
  for (const date of targets) {
    if (opts.dryRun) {
      const built = buildDay(date);
      console.log(`  [dry] ${date}: files=${built.files.length} rows=${built.rowCount} apps=${built.archive.ids.length}`);
      continue;
    }
    const r = packDay(date, { force: opts.force });
    if (r.skipped) { console.log(`  - ${date}: skip (${r.reason})`); continue; }
    totalCsv += r.csvBytes; totalBr += r.bytes;
    console.log(`  ✓ ${date}: ${r.files} files, ${r.rows} rows, ${r.apps} apps → ${kb(r.bytes)} (csv ${kb(r.csvBytes)}, ×${(r.csvBytes / r.bytes).toFixed(0)})`);
  }
  if (!opts.dryRun) {
    console.log(`archive-snapshots: ${targets.length}일 보관, csv ${kb(totalCsv)} → ${kb(totalBr)}`);
  }
}

main();
