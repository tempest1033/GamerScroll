"""Country weights for the download model: how many game installs each of the
128 archived countries accounts for, in the same table shape the revenue
model uses (`marketProxyUsd` holds annual game downloads here).

Downloads follow people online, not income, so the proxy is population x
internet share with no income term. The few countries with published shares
of worldwide game downloads (Sensor Tower, 2025) are pinned to those shares
and the proxy distributes the remainder. Store shares are download shares
(Android-heavy everywhere outside a few iOS-strong markets); China is iOS
only, as in the revenue table, because Chinese Android stores are not
charted. Research only.
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MACRO = ROOT / 'data/rank-models/reference/worldbank-2020-2024.json'
REVENUE_TABLE = ROOT / 'data/rank-models/global-chart-2026-v0.3.json'

# Share of worldwide game downloads (two stores, China iOS only), published.
PINNED_SHARES = {
    'IN': 0.164,  # Sensor Tower, November 2025: India 594m of 3.62bn monthly game downloads
    'US': 0.079,  # same source
    'BR': 0.065,  # same source
    'ID': 0.066,  # Sensor Tower: Indonesia 3.34bn game downloads in 2025 of 50.4bn worldwide
    'CN': 0.050,  # China iOS only; Sensor Tower State of Mobile 2025 order of magnitude
}
PINNED_SOURCES = {
    'IN': 'https://sensortower.com/blog/top-10-worldwide-mobile-games-by-revenue-and-downloads-in-november-2025',
    'US': 'https://sensortower.com/blog/top-10-worldwide-mobile-games-by-revenue-and-downloads-in-november-2025',
    'BR': 'https://sensortower.com/blog/top-10-worldwide-mobile-games-by-revenue-and-downloads-in-november-2025',
    'ID': 'https://gamedevreports.substack.com/p/sensor-tower-india-mobile-games-market',
    'CN': 'assumption: China iOS games downloads about 5% of the two-store worldwide total',
}
WORLD_GAME_DOWNLOADS = 50.4e9  # Sensor Tower, 2025 (excluding Chinese Android stores)
# iOS share of downloads by country: high in a few markets, Android-dominated elsewhere.
IOS_DOWNLOAD_SHARE = {'US': 0.45, 'JP': 0.55, 'KR': 0.28, 'TW': 0.40, 'CN': 1.0, 'GB': 0.50, 'CA': 0.50,
                      'AU': 0.50, 'HK': 0.50, 'FR': 0.40, 'DE': 0.35, 'SA': 0.35, 'AE': 0.40, 'SG': 0.45,
                      'SE': 0.45, 'NO': 0.50, 'DK': 0.50, 'CH': 0.50, 'NL': 0.40, 'IE': 0.45, 'NZ': 0.45}
HIGH_INCOME_IOS = 0.30
DEFAULT_IOS = 0.10
HIGH_INCOME_USD = 30000
# Countries the World Bank series does not carry; the revenue table inherited them by other means.
EXTRA_ASSUMPTIONS = {'TW': {'population': 23_400_000, 'internetPercent': 92, 'gdpPerCapitaUsd': 33_000}}


def latest(macro: dict, country: str, indicator: str) -> float | None:
    rows = [r for ind in macro['indicators'] if ind['id'] == indicator for r in ind['rows']
            if r['country'] == country and r['value'] is not None and 2020 <= r['year'] <= 2024]
    return max(rows, key=lambda r: r['year'])['value'] if rows else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='data/rank-models/global-downloads-2026-v0.1.json')
    args = parser.parse_args()
    macro = json.loads(MACRO.read_text(encoding='utf-8'))
    revenue = json.loads(REVENUE_TABLE.read_text(encoding='utf-8'))
    assumptions = json.loads((ROOT / 'data/rank-models/global-chart-2025-v0.2-assumptions.json').read_text(encoding='utf-8'))
    missing = {**assumptions.get('missingIndicatorAssumptions', {}), **EXTRA_ASSUMPTIONS}
    rows = []
    for entry in revenue['countries']:
        code = entry['country']
        population = latest(macro, code, 'SP.POP.TOTL') or missing.get(code, {}).get('population')
        internet = latest(macro, code, 'IT.NET.USER.ZS') or missing.get(code, {}).get('internetPercent')
        income = latest(macro, code, 'NY.GDP.PCAP.CD') or missing.get(code, {}).get('gdpPerCapitaUsd')
        if not population or not internet:
            raise SystemExit(f'No population/internet observation or assumption for {code}')
        proxy = population * internet / 100.0
        ios = IOS_DOWNLOAD_SHARE.get(code, HIGH_INCOME_IOS if (income or 0) >= HIGH_INCOME_USD else DEFAULT_IOS)
        rows.append({'country': code, 'name': entry.get('name', code), 'proxy': proxy, 'ios': ios})
    free_total = sum(r['proxy'] for r in rows if r['country'] not in PINNED_SHARES)
    free_share = 1.0 - sum(PINNED_SHARES.values())
    countries = []
    for r in rows:
        share = PINNED_SHARES.get(r['country'], r['proxy'] / free_total * free_share)
        countries.append({
            'country': r['country'], 'name': r['name'],
            'marketProxyUsd': round(share * WORLD_GAME_DOWNLOADS),  # annual game downloads, not dollars
            'method': 'published_share' if r['country'] in PINNED_SHARES else 'internet_population_proxy',
            'source': PINNED_SOURCES.get(r['country']),
            'storeShares': {'ios': r['ios'], 'android': round(1 - r['ios'], 4),
                            'basis': 'download_share_assumption'},
            'marketWeight': share})
    countries.sort(key=lambda c: -c['marketWeight'])
    table = {
        'schemaVersion': 1, 'modelId': 'global-downloads-2026-v0.1', 'baseYear': 2025, 'status': 'research_assumption',
        'productionEnabled': False, 'builtOn': date.today().isoformat(),
        'label': 'Country weights for the download model (annual game downloads, two stores, China iOS only)',
        'meaning': ('marketProxyUsd holds annual game downloads so coverage_share.market_weights() can read '
                    'this table unchanged. Five pinned countries carry published shares; the rest split the '
                    'remainder by internet users. Store shares are download-share assumptions.'),
        'worldGameDownloads': WORLD_GAME_DOWNLOADS, 'pinnedShares': PINNED_SHARES,
        'proxy': 'population * internetPercent / 100 (no income term)',
        'countries': countries,
    }
    path = ROOT / args.output
    path.write_text(json.dumps(table, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    top = [(c['country'], round(c['marketWeight'], 3)) for c in countries[:12]]
    print(json.dumps({'output': args.output, 'countries': len(countries), 'top': top}, ensure_ascii=False))


if __name__ == '__main__':
    main()
