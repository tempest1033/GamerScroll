"""Turn high-confidence harvested amounts into a manual anchor-ledger file.

Only rows whose game name appears in the same sentence as the figure, with no
extraction flag, become ledger rows. Every row keeps the verbatim sentence and
the article URL, and they enter as reference/pending so the fit never consumes a
machine-extracted number. Research only.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / 'docs/research/anchors/anchors.jsonl'
CACHE = ROOT / 'reports/rank-models/monthly-chart-articles'

PUBLISHED = re.compile(r'(January|February|March|April|May|June|July|August|September|'
                       r'October|November|December)\s+(\d{1,2}),\s+(20\d{2})')
MONTH_INDEX = {name: number for number, name in enumerate(
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
     'September', 'October', 'November', 'December'], start=1)}


def slug(text: str) -> str:
    decomposed = unicodedata.normalize('NFKD', text.lower())
    ascii_text = ''.join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+', '-', ascii_text).strip('-')


def published_on(article_url: str) -> str | None:
    path = CACHE / f"{article_url.rstrip('/').split('/')[-1]}.html"
    if not path.exists():
        return None
    match = PUBLISHED.search(re.sub(r'(?s)<[^>]+>', ' ', path.read_text(encoding='utf-8')))
    if not match:
        return None
    return f'{match.group(3)}-{MONTH_INDEX[match.group(1)]:02d}-{int(match.group(2)):02d}'


HARVEST_MARKER = 'harvested sentence:'


def existing_keys() -> set[tuple[str, str, float]]:
    """Keys already in the ledger, ignoring rows this importer itself produced.

    Rows written by an earlier run carry the harvest marker. Skipping them keeps
    regeneration idempotent: without that, rebuilding the manual file would treat
    its own rows as duplicates and silently drop them from the ledger.
    """
    keys = set()
    for line in LEDGER.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        period = row.get('period') or {}
        amount = row.get('amount_usd_m')
        if amount is None or str(row.get('notes') or '').startswith(HARVEST_MARKER):
            continue
        keys.add((slug(row.get('game_key') or row.get('game') or ''),
                  period.get('start') or '', round(float(amount), 2)))
    return keys


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='reports/rank-models/monthly-chart-harvest-2026-09-11.json')
    parser.add_argument('--output', default='docs/research/anchors/manual/2026-09-11-monthly-chart-backfill.json')
    parser.add_argument('--added-on', default='2026-09-11')
    parser.add_argument('--first-source-number', type=int, default=1201)
    arguments = parser.parse_args()

    harvest = json.loads((ROOT / arguments.input).read_text(encoding='utf-8'))
    known = existing_keys()

    candidates = [row for row in harvest['rows']
                  if row['keep'] and row['attribution'] == 'in_sentence' and row['amount_usd_m'] >= 1]
    article_urls = sorted({row['source_url'] for row in candidates})
    source_ids = {url: f'X{arguments.first_source_number + index}'
                  for index, url in enumerate(article_urls)}

    sources = {}
    for url, source_id in source_ids.items():
        sources[source_id] = {
            'url': url,
            'provider': 'AppMagic',
            'publisher': 'PocketGamer.biz',
            'published_on': published_on(url) or '2026-09-11',
            'evidence_role': 'reference',
            'review_status': 'pending',
            'evidence': ('Monthly chart write-up. The article states its estimates are gross '
                         'revenue from player spending across the App Store and Google Play only, '
                         'excluding alternative marketplaces and direct-to-consumer platforms.'),
            'flags': [
                'Amounts were extracted from article prose by scripts/revenue-research/harvest_monthly_charts.py.',
                'Only sentences naming the game and one figure were imported; the verbatim sentence is kept in notes.',
                'Prose figures are rounded as published. Tax and refund basis are not stated.',
                'Same provider as the other PocketGamer rows, so these are not independent corroboration.',
            ],
        }

    rows, skipped = [], []
    for row in sorted(candidates, key=lambda item: (item['period_start'], item['game'])):
        key = (slug(row['game']), row['period_start'], round(row['amount_usd_m'], 2))
        if key in known:
            skipped.append({'game': row['game'], 'period_start': row['period_start'],
                            'amount_usd_m': row['amount_usd_m'], 'reason': 'already_in_ledger'})
            continue
        known.add(key)
        note = (f"{HARVEST_MARKER} {row['sentence']}"[:600]
                + f" | month basis: {row['month_basis']}")
        rows.append({
            'game': row['game'],
            'geography': 'WW',
            'stores': ['app_store', 'google_play'],
            'period': {'kind': 'month', 'start': row['period_start'], 'end': row['period_end']},
            'amount': row['amount_usd_m'],
            'currency': 'USD',
            'metric': 'consumer_spend',
            'fee_basis': 'gross',
            'provider': 'AppMagic',
            'source_id': source_ids[row['source_url']],
            'evidence_role': 'reference',
            'review_status': 'pending',
            'notes': note,
        })

    market_written = 0
    for row in sorted(harvest.get('market_total_rows', []), key=lambda item: item['period_start']):
        if not row['keep'] or row['source_url'] not in source_ids:
            continue
        key = (slug('Market'), row['period_start'], round(row['amount_usd_m'], 2))
        if key in known:
            skipped.append({'game': 'Market', 'period_start': row['period_start'],
                            'amount_usd_m': row['amount_usd_m'], 'reason': 'already_in_ledger'})
            continue
        known.add(key)
        rows.append({
            'game': 'Market',
            'geography': 'WW',
            'stores': ['app_store', 'google_play'],
            'period': {'kind': 'month', 'start': row['period_start'], 'end': row['period_end']},
            'amount': row['amount_usd_m'],
            'currency': 'USD',
            'metric': 'market_total',
            'fee_basis': 'gross',
            'provider': 'AppMagic',
            'source_id': source_ids[row['source_url']],
            'evidence_role': 'reference',
            'review_status': 'pending',
            'notes': f"{HARVEST_MARKER} {row['sentence']}"[:600],
        })
        market_written += 1

    payload = {
        'added_on': arguments.added_on,
        'note': ('Backfill of published monthly game amounts from the provider\'s monthly chart '
                 'write-ups, 2025-10 through 2026-08. Store ranks cannot be recovered for those '
                 'months, so these rows cannot join the fit panel yet; they exist so that the '
                 'monetary history is captured while it is still online, and they become usable '
                 'as the rank archive grows forward. Extracted mechanically and kept as '
                 'reference/pending, which keeps them out of fit eligibility.'),
        'sources': sources,
        'rows': rows,
    }
    output = ROOT / arguments.output
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'candidates': len(candidates), 'written': len(rows), 'market_totals': market_written,
                      'skipped_existing': len(skipped), 'sources': len(sources),
                      'months': sorted({row['period']['start'][:7] for row in rows}),
                      'output': arguments.output}))


if __name__ == '__main__':
    main()
