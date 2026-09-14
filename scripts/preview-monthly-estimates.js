'use strict';

// Local-only preview; do not invoke the site build or write into docs/.
const fs = require('node:fs');
const path = require('node:path');
const { renderMonthlyEstimates } = require('../src/rank/monthly-estimates');
const html = renderMonthlyEstimates({ preview: true });
const directory = path.resolve(__dirname, '../.utmp/monthly-estimates');
fs.mkdirSync(directory, { recursive: true });
const output = path.join(directory, 'index.html');
fs.writeFileSync(output, `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width">
<title>월간 추정 · 내부 검증</title><style>body{font-family:system-ui;max-width:1100px;margin:32px auto;padding:16px}
table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}
strong{color:#a22}.rk-scroll{overflow:auto}</style></head><body>${html}</body></html>`, 'utf8');
console.log(JSON.stringify({ output, productionEnabled: false }));
