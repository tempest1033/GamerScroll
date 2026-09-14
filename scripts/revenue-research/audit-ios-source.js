// Read-only source diagnostic. It never writes production rankings or metadata.
const fs = require('fs');
const path = require('path');
const { createAppleClient } = require('../lib/global-ranking-requests');
const { collectCountry } = require('../collect-global-rankings');

async function main() {
  const apple = createAppleClient();
  const rows = [];
  for (const country of ['US', 'JP', 'CN', 'KR', 'TW']) {
    const key = `ios_${country.toLowerCase()}_grossing`;
    const result = await collectCountry(null, apple, country, {}, new Set([key]));
    const ids = result.lists[key] || [];
    const batches = [], metadata = new Map();
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      const url = `https://itunes.apple.com/lookup?id=${batch.join(',')}&country=${country.toLowerCase()}&entity=software`;
      try {
        const data = await apple(url);
        const software = (data.results || []).filter(row => !row.wrapperType || row.wrapperType === 'software');
        for (const row of software) metadata.set(String(row.trackId), {
          title: row.trackName, primaryGenreId: row.primaryGenreId, bundleId: row.bundleId
        });
        batches.push({ requested: batch, returned: software.map(row => String(row.trackId)),
          resultCount: data.resultCount, observedAt: new Date().toISOString() });
      } catch (error) {
        batches.push({ requested: batch, error: error.message, observedAt: new Date().toISOString() });
      }
    }
    let compactedRank = 0;
    const positions = ids.map((id, i) => ({
      id, upstreamRank: i + 1, metadata: metadata.get(id) || null,
      legacyReturnedArrayRank: metadata.has(id) ? ++compactedRank : null
    }));
    const row = {
      country, chartStatus: result.charts[key], batches, positions,
      upstreamRows: ids.length, softwareRows: metadata.size,
      missingMetadata: positions.filter(row => row.metadata === null).map(row => ({
        id: row.id, upstreamRank: row.upstreamRank })),
      shiftedRows: positions.filter(row => row.legacyReturnedArrayRank !== null
        && row.upstreamRank !== row.legacyReturnedArrayRank).length,
      roblox: positions.find(row => row.id === '431946152') || null
    };
    rows.push(row);
    console.log(JSON.stringify({ country, upstreamRows: row.upstreamRows,
      softwareRows: row.softwareRows, missingMetadata: row.missingMetadata,
      shiftedRows: row.shiftedRows, roblox: row.roblox }));
  }
  const report = {
    schemaVersion: 1, productionEnabled: false, observedAt: new Date().toISOString(),
    countries: rows, limitations: [
      'This is a current API observation; it cannot reconstruct metadata failures in August.',
      'Legacy array positions are simulated from current results, not replacement production ranks.',
      'An absent current upstream ID is not proof of zero revenue or an old category change.',
      'Requests reuse the existing bounded and serialized Apple client.',
      'No chart data, application dictionary or production collection code is modified.'
    ]
  };
  fs.writeFileSync(path.resolve('reports/rank-models/ios-source-audit-2026-09-11.json'),
    JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
