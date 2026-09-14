"""Harvest eog.gg's monthly gacha revenue board into a manual anchor file.

The board (https://eog.gg/revenue/) lists 100 gacha games with fifteen months
of estimated worldwide mobile revenue, iOS and Android combined, net of the
store cut. It is a third-party estimate like the other providers, but its
method changed in July 2026: months to June 2026 are Sensor Tower alone with
no China-Android modelling, months from July 2026 blend Sensor Tower and
Appfigures and model China Android at 1.75x China iOS. The two methods are
therefore two evidence classes (`eog_st`, `eog_blend`): `history_fit` gives
each its own scale and never mixes them with the gross or net classes.

Amounts are published rounded: whole millions from $10M, one significant
figure below ($3M, $900K). Rows under the threshold are left out because the
rounding alone would be a 10-50% error. The raw HTML is cached with its hash
and the verbatim month and amount strings are kept in each row's notes.
Research only; nothing here touches production data.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'reports/rank-models/eog-revenue-pages'
IDENTITIES = ROOT / 'docs/research/anchors/identities.json'
URL = 'https://eog.gg/revenue/'
UA = 'Mozilla/5.0 (GamerScroll research harvester)'
SOURCE_ID = 'E01'
METHOD_BREAK = '2026-07'  # first month of the blended method
MONTHS = {name: number for number, name in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], start=1)}

NAME = re.compile(r'<span class="rev-game__name">\s*(?:<a[^>]*>\s*)?([^<]+)')  # some names wrap a guide link
PUBLISHER = re.compile(r'<span class="rev-game__pub">([^<]+)</span>')
REGION = re.compile(r'<span class="rev-rtag[^"]*">([^<]+)</span>')
MONTH_ROW = re.compile(r'<span class="rev-mb__m">([^<]+)</span><span class="rev-mb__v">([^<]+)</span>')
AMOUNT = re.compile(r'^\$([\d.]+)([MK])$')
MONTH_LABEL = re.compile(r"^([A-Z][a-z]{2}) '(\d{2})$")
UPDATED = re.compile(r'"dateModified":"(\d{4}-\d{2}-\d{2})"')


def fetch(url: str = URL, refresh: bool = False) -> tuple[str, Path]:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f'eog-revenue-{time.strftime("%Y-%m-%d")}.html'
    if path.exists() and not refresh:
        return path.read_text(encoding='utf-8'), path
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(request, timeout=30) as response:
        text = response.read().decode('utf-8', 'ignore')
    path.write_text(text, encoding='utf-8')
    return text, path


def month_key(label: str) -> str | None:
    match = MONTH_LABEL.match(label.strip())
    if not match or match.group(1) not in MONTHS:
        return None
    return f'20{match.group(2)}-{MONTHS[match.group(1)]:02d}'


def amount_usd_m(text: str) -> float | None:
    match = AMOUNT.match(text.strip())
    if not match:
        return None
    value = float(match.group(1))
    return value if match.group(2) == 'M' else value / 1000.0


def parse_entries(page: str) -> list[dict]:
    """One record per game: name, publisher, region tag and its month -> amount history."""
    entries = []
    chunks = page.split('<div class="rev-entry')[1:]
    for chunk in chunks:
        key = re.search(r'data-key="([^"]+)"', chunk)
        name = NAME.search(chunk)
        if not key or not name:
            continue
        publisher = PUBLISHER.search(chunk)
        region = REGION.search(chunk)
        history = []
        for label, value in MONTH_ROW.findall(chunk):
            month = month_key(html.unescape(label))
            amount = amount_usd_m(html.unescape(value))
            if month and amount is not None:
                history.append({'month': month, 'amount_usd_m': amount,
                                'published': f'{html.unescape(label)} {html.unescape(value)}'})
        entries.append({'key': key.group(1), 'name': html.unescape(name.group(1)).strip(),
                        'publisher': html.unescape(publisher.group(1)).strip() if publisher else None,
                        'region': html.unescape(region.group(1)).strip() if region else None,
                        'history': history})
    return entries


def identity_lookup() -> tuple[dict, dict]:
    payload = json.loads(IDENTITIES.read_text(encoding='utf-8'))
    return payload.get('games', {}), payload.get('aliases', {})


def label_class(month: str) -> str:
    return 'eog_blend' if month >= METHOD_BREAK else 'eog_st'


def anchor_rows(entries: list[dict], since: str, minimum: float) -> list[dict]:
    rows = []
    for entry in entries:
        for point in entry['history']:
            if point['month'] < since or point['amount_usd_m'] < minimum:
                continue
            year, month = int(point['month'][:4]), int(point['month'][5:7])
            end_day = 31 if month in (1, 3, 5, 7, 8, 10, 12) else 30 if month != 2 else (29 if year % 4 == 0 else 28)
            rows.append({
                'game': entry['name'], 'geography': 'WW', 'stores': ['app_store', 'google_play'],
                'period': {'kind': 'month', 'start': f'{point["month"]}-01', 'end': f'{point["month"]}-{end_day:02d}'},
                'amount': point['amount_usd_m'], 'currency': 'USD', 'metric': 'consumer_spend',
                'fee_basis': 'net', 'label_class': label_class(point['month']),
                'provider': 'eog.gg gacha revenue board', 'source_id': SOURCE_ID,
                'evidence_role': 'candidate', 'review_status': 'clear',
                'notes': f'board row "{point["published"]}"; publisher {entry["publisher"]}; region tag {entry["region"]}; '
                         f'{"blended Sensor Tower + Appfigures with CN-Android model" if label_class(point["month"]) == "eog_blend" else "Sensor Tower only, no CN-Android"}',
            })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--since', default='2025-11', help='first month to keep')
    parser.add_argument('--minimum', type=float, default=5.0, help='smallest amount (USD million) to keep')
    parser.add_argument('--added-on', default=time.strftime('%Y-%m-%d'))
    parser.add_argument('--manual', default='docs/research/anchors/manual/2026-09-12-eog-gacha-net-months.json')
    parser.add_argument('--report', default='reports/rank-models/eog-harvest-2026-09-12.json')
    parser.add_argument('--refresh', action='store_true')
    arguments = parser.parse_args()

    page, cached = fetch(refresh=arguments.refresh)
    digest = hashlib.sha256(page.encode('utf-8')).hexdigest()
    updated = UPDATED.search(page)
    entries = parse_entries(page)
    rows = anchor_rows(entries, arguments.since, arguments.minimum)
    games, aliases = identity_lookup()
    names = sorted({row['game'] for row in rows})
    mapped = [name for name in names if aliases.get(name, name) in games]
    unmapped = [name for name in names if aliases.get(name, name) not in games]

    manual = {
        'added_on': arguments.added_on,
        'note': 'eog.gg gacha revenue board, worldwide monthly mobile estimates net of the store cut. Two label '
                'classes by method: eog_st to 2026-06 (Sensor Tower only, no CN-Android), eog_blend from 2026-07 '
                '(Sensor Tower + Appfigures, CN-Android modelled at 1.75x CN-iOS). Amounts are published rounded '
                f'(whole millions from $10M, one significant figure below); rows under ${arguments.minimum:g}M are '
                'not imported. The August 2026 top rows also exist as N02 with an unspecified basis; these rows '
                'supersede them for fitting.',
        'sources': {SOURCE_ID: {
            'url': URL, 'provider': 'eog.gg gacha revenue board', 'publisher': 'Eden of Gaming',
            'published_on': updated.group(1) if updated else arguments.added_on,
            'evidence_role': 'candidate', 'review_status': 'clear',
            'evidence': 'Board states: estimated mobile revenue (iOS and Android) after platform fees, each game '
                        'combined across its regions; third-party estimates, not official figures.',
            'flags': ['Amounts were extracted from the board HTML by scripts/revenue-research/harvest_eog_revenue.py.',
                      'Method break at 2026-07; the two methods are separate label classes and are not comparable.',
                      'Published rounded; the verbatim month and amount are kept in each row\'s notes.',
                      f'Cached page {cached.relative_to(ROOT).as_posix()} sha256 {digest}.'],
        }},
        'rows': rows,
    }
    manual_path = ROOT / arguments.manual
    manual_path.parent.mkdir(parents=True, exist_ok=True)
    manual_path.write_text(json.dumps(manual, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    report = {'schema_version': 1, 'production_enabled': False, 'url': URL, 'sha256': digest,
              'cached': cached.relative_to(ROOT).as_posix(), 'board_updated': updated.group(1) if updated else None,
              'entries': len(entries), 'rows': len(rows), 'since': arguments.since, 'minimum_usd_m': arguments.minimum,
              'months': sorted({row['period']['start'][:7] for row in rows}),
              'by_class': {klass: sum(1 for row in rows if row['label_class'] == klass) for klass in ('eog_st', 'eog_blend')},
              'games_mapped': mapped, 'games_unmapped': unmapped,
              'entries_table': [{'name': e['name'], 'publisher': e['publisher'], 'region': e['region'],
                                 'months': len(e['history']),
                                 'latest': e['history'][0]['amount_usd_m'] if e['history'] else None} for e in entries]}
    report_path = ROOT / arguments.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'entries': len(entries), 'rows': len(rows), 'mapped': len(mapped), 'unmapped': len(unmapped),
                      'months': report['months'][0] + '..' + report['months'][-1] if rows else None,
                      'manual': arguments.manual, 'report': arguments.report}))
    print('unmapped:', unmapped)


if __name__ == '__main__':
    main()
