#!/usr/bin/env node
/**
 * 네이버 검색광고 키워드도구 — 월간 검색량 조회
 *
 * 용도: 기사 제목 후보의 키워드가 실제로 검색되는지 확인 (Title Query-Fit Check 보조)
 * 사용: node scripts/keyword-volume.mjs "데빌 메이 크라이 리메이크" "DMC1 리메이크" ...
 *   --related  연관 키워드 상위 15개도 함께 출력
 *
 * 인증: .env의 NAVER_SEARCHAD_ACCESS_LICENSE / NAVER_SEARCHAD_SECRET / NAVER_SEARCHAD_CUSTOMER_ID
 * API: GET https://api.searchad.naver.com/keywordstool (hintKeywords 최대 5개/호출)
 * 주의: hintKeywords는 공백 미허용 → 공백 제거 후 조회 (네이버 키워드도구 표준 동작)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env 로드 (dotenv 없이 최소 구현 — 값에 =가 있어도 안전)
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const API_KEY = process.env.NAVER_SEARCHAD_ACCESS_LICENSE;
const SECRET = process.env.NAVER_SEARCHAD_SECRET;
const CUSTOMER = process.env.NAVER_SEARCHAD_CUSTOMER_ID;
if (!API_KEY || !SECRET || !CUSTOMER) {
  console.error('❌ .env에 NAVER_SEARCHAD_* 3개 값이 필요합니다.');
  process.exit(1);
}

const args = process.argv.slice(2);
const showRelated = args.includes('--related');
const keywords = args.filter(a => !a.startsWith('--'));
if (keywords.length === 0) {
  console.error('사용법: node scripts/keyword-volume.mjs "키워드1" "키워드2" ... [--related]');
  process.exit(1);
}
if (keywords.length > 5) {
  console.error('❌ 한 번에 최대 5개 키워드까지 조회할 수 있습니다.');
  process.exit(1);
}

function sign(timestamp, method, apiPath) {
  return crypto.createHmac('sha256', SECRET)
    .update(`${timestamp}.${method}.${apiPath}`)
    .digest('base64');
}

function fmt(v) {
  // API는 10 미만을 "< 10" 문자열로 반환
  if (typeof v === 'string') return v;
  return v.toLocaleString('ko-KR');
}

async function main() {
  // 원본 키워드 → 공백 제거 hint 매핑 (결과 매칭용)
  const hints = keywords.map(k => k.replace(/\s+/g, '').toUpperCase());
  const apiPath = '/keywordstool';
  const ts = String(Date.now());
  const qs = new URLSearchParams({ hintKeywords: hints.join(','), showDetail: '1' });
  const res = await fetch(`https://api.searchad.naver.com${apiPath}?${qs}`, {
    headers: {
      'X-Timestamp': ts,
      'X-API-KEY': API_KEY,
      'X-Customer': CUSTOMER,
      'X-Signature': sign(ts, 'GET', apiPath)
    }
  });
  if (!res.ok) {
    console.error(`❌ API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const data = await res.json();
  const list = data.keywordList || [];

  console.log('━━ 월간 검색량 (PC + 모바일, 최근 30일) ━━\n');
  for (let i = 0; i < keywords.length; i++) {
    const hit = list.find(k => k.relKeyword === hints[i]);
    if (!hit) {
      console.log(`  ${keywords[i]}  →  데이터 없음 (검색량 극소)`);
      continue;
    }
    const pc = hit.monthlyPcQcCnt, mo = hit.monthlyMobileQcCnt;
    const total = (typeof pc === 'number' && typeof mo === 'number') ? fmt(pc + mo) : `${fmt(pc)}+${fmt(mo)}`;
    console.log(`  ${keywords[i]}  →  합계 ${total}  (PC ${fmt(pc)} / 모바일 ${fmt(mo)}, 경쟁도 ${hit.compIdx || '-'})`);
  }

  if (showRelated) {
    console.log('\n━━ 연관 키워드 상위 15 ━━\n');
    const related = list
      .filter(k => !hints.includes(k.relKeyword))
      .map(k => ({
        kw: k.relKeyword,
        total: (typeof k.monthlyPcQcCnt === 'number' ? k.monthlyPcQcCnt : 0) +
               (typeof k.monthlyMobileQcCnt === 'number' ? k.monthlyMobileQcCnt : 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
    for (const r of related) console.log(`  ${r.kw}  →  ${r.total.toLocaleString('ko-KR')}`);
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
