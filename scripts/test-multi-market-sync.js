'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const S = require('./sync-and-enrich');

// 1. 5개 시장 감지 + 중복 제거(다국가 차트 수집, KR 우선)
const row = (appId, title) => ({ appId, title, developer: 'dev', icon: 'i' });
const day = {
  rankings: {
    grossing: { kr: { ios: [row('1', '한글게임')] }, us: { ios: [row('2', 'Us Game'), row('1', 'Kr Game EN')], android: [row('com.a.b', 'Droid')] }, jp: { ios: [row('3', 'ジェーピー')] }, cn: { ios: [row('4', '国服游戏')] }, tw: { android: [row('com.tw.x', '台服遊戲')] } },
    free: { jp: { ios: [row('2', 'Us Game JA')] } }
  }
};
const rows = S.rowsFromHistory(day);
assert.deepEqual([...new Set(rows.map(r => r.region))].sort(), ['cn', 'jp', 'kr', 'tw', 'us']);
const uniq = S.dedupeRows(rows);
assert.equal(uniq.length, 6);
const one = uniq.find(g => g.appId === '1' || g.appId === 1);
assert.equal(one.region, 'kr');
assert.deepEqual(Object.keys(one.charts).sort(), ['kr', 'us']);

// 2. 신규 등록: KR 없음 → US 제목이 키, 지역 appId 슬롯, 슬러그 유일
const gamesData = { games: { '기존 게임': { appIds: { ios: '10' }, aliases: ['Old Game'], developer: 'd', icon: '', slug: 'old-game', platforms: ['ios'] } } };
const idx = S.buildAppIdIndex(gamesData.games);
const ctx = S.getRegCtx(gamesData, idx);
let r = S.registerCandidate({ platform: 'ios', appId: '20', region: 'jp', charts: { jp: { title: 'ジェーピー', developer: 'x', icon: '' } }, us: { title: 'JP Game', developer: 'x', icon: '' } }, ctx);
assert.equal(r.status, 'new');
assert.equal(r.key, 'JP Game');
assert.deepEqual(gamesData.games['JP Game'].appIds, { ios_jp: '20' });
assert.deepEqual(gamesData.games['JP Game'].names, { en: 'JP Game', ja: 'ジェーピー' });
assert.equal(gamesData.games['JP Game'].slug, 'jp-game');
assert.equal(r.pending, null);
// 같은 appId는 재등록 안 함
assert.equal(S.registerCandidate({ platform: 'ios', appId: '20', region: 'jp', charts: {} }, ctx).status, 'existing');
// 이름 일치(alias) + 지역 슬롯 비어 있음 → 기존 게임에 ios_us 연결
r = S.registerCandidate({ platform: 'ios', appId: '30', region: 'us', charts: { us: { title: 'Old Game', developer: '', icon: '' } }, us: { title: 'Old Game' } }, ctx);
assert.equal(r.status, 'attached');
assert.equal(r.key, '기존 게임');
assert.deepEqual(gamesData.games['기존 게임'].appIds, { ios: '10', ios_us: '30' });
assert.equal(gamesData.games['기존 게임'].names.en, 'Old Game');
// 슬러그 중복·빈 슬러그 → 유일한 슬러그
ctx.slugs.add('slug-test');
r = S.registerCandidate({ platform: 'android', appId: 'com.dup.id', region: 'us', charts: { us: { title: 'Slug Test', developer: 'other', icon: '' } }, us: { title: 'Slug Test' } }, ctx);
assert.equal(r.status, 'new');
assert.equal(gamesData.games['Slug Test'].slug, 'slug-test-us');
r = S.registerCandidate({ platform: 'ios', appId: '40', region: 'cn', charts: { cn: { title: '全中文名', developer: '', icon: '' } } }, ctx);
assert.equal(r.status, 'new');
assert.equal(r.pending.status, 'lookup-failed');
assert.equal(gamesData.games['全中文名'].slug, '全中文名');
// 슬러그 규칙: names.en 우선, 원문은 한글/한자/가나 유지, 충돌은 -tw/-jp/-cn/-us → -2, 비면 app-<id>
assert.equal(S.slugifyTitle('Ragnarok X: Next Generation'), 'ragnarok-x-next-generation');
assert.equal(S.slugifyTitle('象棋 中国象棋'), '象棋-中国象棋');
assert.equal(S.slugifyTitle('造梦西游4'), '造梦西游4');
assert.equal(S.slugifyTitle('ウマ娘 プリティーダービー'), 'ウマ娘-プリティーダービー');
assert.equal(S.slugifyTitle('Café Merge!'), 'cafe-merge');
const used = new Set(['yarn-flow']);
assert.equal(S.uniqueSlug('x', { en: 'Yarn Flow' }, ['tw'], '1', used), 'yarn-flow-tw');
used.add('yarn-flow-tw');
assert.equal(S.uniqueSlug('x', { en: 'Yarn Flow' }, ['tw'], '1', used), 'yarn-flow-jp');
['yarn-flow-jp', 'yarn-flow-cn', 'yarn-flow-us'].forEach(s => used.add(s));
assert.equal(S.uniqueSlug('x', { en: 'Yarn Flow' }, ['tw'], '1', used), 'yarn-flow-2');
assert.equal(S.uniqueSlug('★☆', {}, [], 'com.A.b', new Set()), 'app-com-a-b');
assert.equal(S.uniqueSlug('鬼討ち剣士', {}, [], '1', new Set()), '鬼討ち剣士');
// 키 충돌(슬롯 사용 중) → 대괄호 id 대신 (CC) 접미
const g2 = { games: { 'Dup Game': { appIds: { ios_us: '1' }, aliases: [], developer: '', icon: '', slug: 'dup-game', platforms: ['ios'] } } };
const ctx2 = S.getRegCtx(g2, S.buildAppIdIndex(g2.games));
r = S.registerCandidate({ platform: 'ios', appId: '2', region: 'us', charts: { us: { title: 'Dup Game', developer: '', icon: '' } }, us: { title: 'Dup Game' } }, ctx2);
assert.equal(r.key, 'Dup Game (US)');
assert.ok(!Object.keys(g2.games).some(k => /\[/.test(k)));
assert.equal(g2.games['Dup Game (US)'].slug, 'dup-game-us');
const slugs = Object.values(gamesData.games).map(g => g.slug);
assert.equal(new Set(slugs).size, slugs.length);
// KR 판매 앱은 한국어 이름이 키, 기본 슬롯 사용
r = S.registerCandidate({ platform: 'android', appId: 'com.kr.app', region: 'jp', charts: { jp: { title: 'JA', developer: '', icon: '' } }, kr: { title: ' 한국 앱 ', developer: 'k', icon: '' } }, ctx);
assert.equal(r.key, '한국 앱');
assert.deepEqual(gamesData.games['한국 앱'].appIds, { android: 'com.kr.app' });
assert.deepEqual(gamesData.games['한국 앱'].names, { ko: '한국 앱', ja: 'JA' });

// 3. names 백필: 국가별 가장 최근 행
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-hist-'));
const write = (d, rankings) => fs.writeFileSync(path.join(dir, `${d}.json`), JSON.stringify({ rankings }));
write('2026-01-01', { grossing: { kr: { ios: [row('10', '옛 이름')] }, tw: { android: [row('com.tw', '舊名')] } } });
write('2026-01-02', { grossing: { kr: { ios: [row('10', '새 이름')] }, us: { ios: [row('11', 'Old Game US')] } } });
const bf = { games: { 'G': { appIds: { ios: '10', android: 'com.tw', ios_us: '11' }, aliases: [] }, 'H': { appIds: { steam: 5 } } } };
const changed = S.backfillNames(bf, S.loadLatestChartRows(dir));
assert.equal(changed, 2);
assert.deepEqual(bf.games.G.names, { ko: '새 이름', en: 'Old Game US', 'zh-tw': '舊名' });
assert.deepEqual(bf.games.H.names, {});
fs.rmSync(dir, { recursive: true, force: true });

console.log('multi-market sync tests passed');
