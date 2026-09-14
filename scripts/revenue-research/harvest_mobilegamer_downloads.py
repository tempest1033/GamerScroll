"""Harvest MobileGamer.biz's monthly top-download write-ups into a manual anchor file.

Sibling of `harvest_mobilegamer_charts.py` for the install charts: each month
MobileGamer publishes "[Month]'s top mobile game downloads" with AppMagic's
worldwide App Store + Google Play estimates (China's Android stores excluded,
which the article states in a fixed sentence). Only the ranked list
("11. Fortnite (Epic Games): 10.3m") is harvested: it is exact and enters as a
benchmark / clear row with `metric: downloads`, amount in millions of installs.
The top-ten prose is hedged and compares months, so it stays a hand step (see
`manual/2026-09-12-mobilegamer-downloads.json`, which also holds the prose
figures entered by hand; a list row republished there with the same amount
becomes a ledger duplicate, not a second observation).

Pages are cached verbatim with SHA-256; the article month comes from the slug
and the year from the publication date. Research only: nothing here writes to
the ledger, `build-anchor-ledger.js` does that from the manual file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from datetime import date

from harvest_mobilegamer_charts import PUBLISHED, canonical_name, page_revision_fields
from harvest_monthly_charts import MONTH_INDEX, ROOT, cached_fetch, month_end, strip_html

BASIS_SENTENCE = re.compile(r"estimates do not include numbers from China.s fractured Android market", re.I)
LIST_ROW = re.compile(r'^(\d{1,2})\.\s+(.+?)\s+\(([^()]+)\):\s+([0-9]+(?:\.[0-9]+)?)\s?(m|million|k|bn|billion)\b', re.I)
SLUG_MONTH = re.compile(r'^([a-z]+)s-top-mobile-game-downloads')
UNIT = {'m': 1.0, 'million': 1.0, 'k': 0.001, 'bn': 1000.0, 'billion': 1000.0}
SEARCH_PAGES = [f'https://mobilegamer.biz/?s=top+mobile+game+downloads&paged={n}' for n in range(1, 5)]
ARTICLE_LINK = re.compile(r'href="(https://mobilegamer\.biz/([a-z]+s-top-mobile-game-downloads[a-z0-9-]*)/)"')
NOTE = ('MobileGamer.biz monthly AppMagic download charts (App Store + Google Play worldwide, Chinese Android '
        'stores excluded). Ranked-list rows 11-20 are exact install counts in millions; the top ten is prose '
        'and stays hand-entered. metric downloads, currency COUNT.')
# List names that differ from the identity family the AppMagic listing actually
# is. MobileGamer writes "Mobile Legends: Bang Bang (Moonton)" for the edition
# GamingonPhone's AppMagic chart names "Mobile Legends: Bang Bang US" at the
# identical figure (March 2026, 9.75m), and January's list already said US.
DOWNLOAD_NAME_FIXES = {
    'mobile legends: bang bang': 'Mobile Legends: Bang Bang US',
    'arrows go': 'Amaze GO', 'amaze go': 'Amaze GO', 'ea fc mobile': 'EA SPORTS FC Mobile',
    'ea sports fc mobile': 'EA SPORTS FC Mobile', 'bus traffic driver': 'Bus Traffic Fever',
}


def download_name(name: str) -> str:
    return DOWNLOAD_NAME_FIXES.get(name.strip().lower(), canonical_name(name))


def article_month(slug: str, published: str) -> tuple[str, str] | None:
    """Period the article covers: slug month, in the year that precedes publication."""
    match = SLUG_MONTH.match(slug)
    if not match or match.group(1) not in MONTH_INDEX:
        return None
    month = MONTH_INDEX[match.group(1)]
    published_on = date.fromisoformat(published)
    year = published_on.year if month < published_on.month else published_on.year - 1
    return f'{year}-{month:02d}-01', month_end(year, month)


def list_rows(text: str) -> list[dict]:
    rows = []
    for line in text.split('\n'):
        match = LIST_ROW.match(line.strip())
        if not match:
            continue
        rows.append({'rank': int(match.group(1)), 'game': download_name(match.group(2)),
                     'publisher': match.group(3).strip(),
                     'amount_m': float(match.group(4)) * UNIT[match.group(5).lower()],
                     'sentence': line.strip()})
    return rows


def anchor_row(row: dict, period: tuple[str, str], source_id: str) -> dict:
    return {
        'game': row['game'], 'geography': 'WW', 'stores': ['app_store', 'google_play'],
        'period': {'kind': 'month', 'start': period[0], 'end': period[1]},
        'amount': row['amount_m'], 'currency': 'COUNT', 'unit_multiplier': 1000000, 'metric': 'downloads',
        'fee_basis': 'unspecified', 'qualifier': None, 'provider': 'AppMagic', 'source_id': source_id,
        'evidence_role': 'benchmark', 'review_status': 'clear',
        'notes': f'harvested list row: {row["sentence"]}',
    }


def harvest(urls: list[str], source_prefix: str) -> tuple[dict, list[dict], list[dict]]:
    sources, rows, articles = {}, [], []
    for number, url in enumerate(urls, start=1):
        slug = url.rstrip('/').split('/')[-1]
        status, html_text, path = cached_fetch(url)
        if status != 200 or not html_text:
            articles.append({'url': url, 'status': status, 'error': 'not fetched'})
            continue
        published = PUBLISHED.search(html_text)
        if not published:
            articles.append({'url': url, 'status': status, 'error': 'no publication date'})
            continue
        period = article_month(slug, published.group(1))
        if period is None:
            articles.append({'url': url, 'status': status, 'error': 'month not in slug'})
            continue
        text = strip_html(html_text)
        if not BASIS_SENTENCE.search(text):
            articles.append({'url': url, 'status': status, 'error': 'basis sentence absent; not imported'})
            continue
        source_id = f'{source_prefix}{number:02d}'
        exact = list_rows(text)
        sha = hashlib.sha256(html_text.encode('utf-8')).hexdigest()
        sources[source_id] = {
            'url': url, 'provider': 'AppMagic', 'publisher': 'MobileGamer.biz',
            'published_on': published.group(1), 'evidence_role': 'benchmark', 'review_status': 'clear',
            'basis_evidence': "Article states AppMagic's estimates do not include China's Android market; "
                              'App Store and Google Play worldwide installs.',
            'cached': str(path.relative_to(ROOT)) if path else None, 'sha256': sha,
            **page_revision_fields(html_text),
        }
        rows.extend(anchor_row(row, period, source_id) for row in exact)
        articles.append({'url': url, 'status': status, 'published_on': published.group(1),
                         'period': period[0][:7], 'list_rows': len(exact), 'sha256': sha})
        time.sleep(0.3)
    return sources, rows, articles


def discover(since: str) -> list[str]:
    """Monthly download write-ups covering `since` (YYYY-MM) or later, from the site search."""
    from harvest_monthly_charts import fetch
    candidates: dict[str, None] = {}
    for page in SEARCH_PAGES:
        status, html_text = fetch(page)
        if status != 200 or not html_text:
            continue
        for url, _ in ARTICLE_LINK.findall(html_text):
            candidates[url] = None
        time.sleep(0.2)
    kept = []
    for url in candidates:
        status, html_text, _ = cached_fetch(url)
        published = PUBLISHED.search(html_text) if status == 200 and html_text else None
        if not published:
            continue
        period = article_month(url.rstrip('/').split('/')[-1], published.group(1))
        if period and period[0][:7] >= since:
            kept.append((period[0], url))
    return [url for _, url in sorted(kept)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--urls', nargs='*', default=[])
    parser.add_argument('--discover-since', default='',
                        help='YYYY-MM; find every monthly download write-up from that month on via site search')
    parser.add_argument('--source-prefix', default='MDL')
    parser.add_argument('--manual', default='docs/research/anchors/manual/2026-09-13-mobilegamer-downloads-list.json')
    parser.add_argument('--report', default='reports/rank-models/mobilegamer-downloads-harvest-2026-09-13.json')
    parser.add_argument('--added-on', default=date.today().isoformat())
    arguments = parser.parse_args()

    urls = list(arguments.urls)
    if arguments.discover_since:
        urls += [url for url in discover(arguments.discover_since) if url not in urls]
    if not urls:
        raise SystemExit('No article urls: pass --urls or --discover-since YYYY-MM')
    sources, rows, articles = harvest(urls, arguments.source_prefix)
    manual = {'added_on': arguments.added_on, 'note': NOTE, 'sources': sources, 'rows': rows}
    manual_path = ROOT / arguments.manual
    manual_path.parent.mkdir(parents=True, exist_ok=True)
    manual_path.write_text(json.dumps(manual, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report_path = ROOT / arguments.report
    report_path.write_text(json.dumps({'articles': articles, 'rows': len(rows), 'manual': arguments.manual},
                                      ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for article in articles:
        print(json.dumps(article, ensure_ascii=False))
    print(f'rows={len(rows)} -> {manual_path}')


if __name__ == '__main__':
    main()
