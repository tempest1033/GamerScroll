'use strict';

// Validate the anchor ledger and print a coverage summary (channel x month) plus
// what is still blocking rows from calibration use. Exit 1 on schema errors.
const S = require('./lib/anchor-schema');
const rows = S.readLedger();
const sources = S.readSources();
const errors = rows.flatMap(r => S.validate(r, sources).map(e => `${r.id}: ${e}`));
const ids = new Set();
for (const r of rows) { if (ids.has(r.id)) errors.push(`duplicate id ${r.id}`); ids.add(r.id); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const usable = rows.filter(r => r.fit.usable);
const table = {};
for (const r of usable) { const k = `${r.geography}/${r.stores.map(s => s === 'app_store' ? 'ios' : s === 'google_play' ? 'aos' : s).join('+')}`; const m = r.period.start.slice(0, 7); (table[k] ||= {})[m] = ((table[k] || {})[m] || 0) + 1; }
const blockers = {};
for (const r of rows.filter(r => !r.fit.usable)) for (const reason of r.fit.reasons) blockers[reason] = (blockers[reason] || 0) + 1;
const providers = rows.reduce((a, r) => { a[r.provider] = (a[r.provider] || 0) + 1; return a; }, {});
console.log(`rows=${rows.length} usable=${usable.length} sources=${Object.keys(sources).length}`);
console.log('\nusable anchors by channel x month');
for (const [k, months] of Object.entries(table).sort()) console.log(`  ${k.padEnd(14)} ${Object.entries(months).sort().map(([m, n]) => `${m}:${n}`).join('  ')}`);
console.log('\nblockers (row counts)');
for (const [k, n] of Object.entries(blockers).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log('\nproviders'); for (const [k, n] of Object.entries(providers).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);

const unmapped = usable.filter(r => r.mapping_status === 'unmapped');
console.log(`\nusable rows still needing identities.json mapping: ${unmapped.length}`);
for (const g of [...new Set(unmapped.map(r => r.game_key))].sort()) console.log(`  - ${g}`);
