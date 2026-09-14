"""Collect Sensor Tower's monthly worldwide mobile-game spending totals.

Every month Sensor Tower's blog posts "Top 10 Worldwide Mobile Games By
Revenue and Downloads in <Month> <Year>" and states, in prose, the two-store
worldwide total for that month ("reached $6.57 billion in August, down 1%
month-over-month"). Per-game amounts are only in an image, so the post
contributes one number per month: the market total, on Sensor Tower's basis
(App Store + Google Play, third-party Android excluded). That basis differs
from AppMagic's, so the rows carry provider "Sensor Tower" and the fit treats
them as their own market series; the value of the series is that it is one
consistent source across many months, which is what a seasonal month
adjustment needs.

The slug is predictable, so months are fetched directly and cached with
their hash; a month whose post is missing or whose sentence does not parse is
reported, not guessed. Research only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'reports/rank-models/sensortower-monthly-posts'
UA = 'Mozilla/5.0 (GamerScroll research harvester)'
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
          'august', 'september', 'october', 'november', 'december']
SLUG = 'https://sensortower.com/blog/top-10-worldwide-mobile-games-by-revenue-and-downloads-in-{month}-{year}'
MONTH_NAME = r'(January|February|March|April|May|June|July|August|September|October|November|December)'
# Two phrasings over the years: "...spending ... reached $6.57 billion in August, down 1%..."
# and "In August 2025, global consumer spending ... reached approximately $7.15 billion, representing a 1% ...".
TOTAL_AFTER = re.compile(r'(?:consumer spending|spending|revenue)[^.$]{0,160}?\$\s?([0-9]+(?:\.[0-9]+)?)\s?(billion|million)'
                         r'[^.]{0,40}?\bin\s+' + MONTH_NAME + r'(?:\s+(\d{4}))?', re.I)
TOTAL_BEFORE = re.compile(r'\bIn\s+' + MONTH_NAME + r'(?:\s+(\d{4}))?,\s+global (?:consumer )?spending on mobile games[^.$]{0,160}?'
                          r'\$\s?([0-9]+(?:\.[0-9]+)?)\s?(billion|million)', re.I)
CHANGE = re.compile(r'(?:(up|down)\s+\*{0,2}([0-9]+(?:\.[0-9]+)?)%\*{0,2}\s+month-over-month'
                    r'|representing an? ([0-9]+(?:\.[0-9]+)?)% month-over-month (growth|decline|decrease|drop))', re.I)


def find_total(text: str, month_name: str, year: int):
    """(amount, unit, match) for the month's own total, whichever phrasing the post used."""
    for match in TOTAL_AFTER.finditer(text):
        if match.group(3).lower() == month_name and (not match.group(4) or int(match.group(4)) == year):
            return match.group(1), match.group(2), match
    for match in TOTAL_BEFORE.finditer(text):
        if match.group(1).lower() == month_name and (not match.group(2) or int(match.group(2)) == year):
            return match.group(3), match.group(4), match
    return None


def fetch(url: str) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.status, response.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as error:
        return error.code, ''
    except Exception:
        return 0, ''


def cached(url: str, key: str, refresh: bool) -> tuple[int, str, Path | None]:
    """Preserve UTF-8 page-text bytes across fresh fetches and cache hits."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f'{key}.html'
    if path.exists() and not refresh:
        return 200, path.read_bytes().decode('utf-8'), path
    status, text = fetch(url)
    if status == 200 and text:
        path.write_bytes(text.encode('utf-8'))
        return status, text, path
    return status, text, None


def strip(html_text: str) -> str:
    text = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', html_text)
    text = re.sub(r'(?s)<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', text)


def months_between(first: str, last: str) -> list[str]:
    year, month = int(first[:4]), int(first[5:7])
    out = []
    while f'{year}-{month:02d}' <= last:
        out.append(f'{year}-{month:02d}')
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--first', default='2024-01')
    parser.add_argument('--last', default=time.strftime('%Y-%m'))
    parser.add_argument('--added-on', default=time.strftime('%Y-%m-%d'))
    parser.add_argument('--manual', default='docs/research/anchors/manual/2026-09-12-sensortower-monthly-totals.json')
    parser.add_argument('--report', default='reports/rank-models/sensortower-totals-2026-09-12.json')
    parser.add_argument('--refresh', action='store_true')
    arguments = parser.parse_args()

    rows, sources, articles = [], {}, []
    for number, key in enumerate(months_between(arguments.first, arguments.last), start=1):
        year, month = int(key[:4]), int(key[5:7])
        url = SLUG.format(month=MONTHS[month - 1], year=year)
        status, html_text, path = cached(url, key, arguments.refresh)
        if status != 200 or not html_text:
            articles.append({'month': key, 'url': url, 'status': status})
            continue
        text = strip(html_text)
        located = find_total(text, MONTHS[month - 1], year)
        if not located:
            articles.append({'month': key, 'url': url, 'status': status, 'error': 'total sentence not found'})
            continue
        value, unit, found = located
        amount = float(value) * (1000 if unit.lower() == 'billion' else 1)
        change = CHANGE.search(text[found.end():found.end() + 120])
        if change and not change.group(1):  # "representing a 1% month-over-month growth" phrasing
            change = type('Change', (), {'group': lambda self, i, c=change: (
                ('up' if c.group(4).lower() == 'growth' else 'down') if i == 1 else c.group(3))})()
        sentence = text[max(0, found.start() - 40):found.end() + 80].strip()
        source_id = f'ST{number:03d}'
        sources[source_id] = {
            'url': url, 'provider': 'Sensor Tower', 'publisher': 'Sensor Tower blog',
            'evidence_role': 'benchmark', 'review_status': 'clear',
            'evidence': 'Monthly top-10 post; the worldwide App Store + Google Play total is stated in prose. '
                        'Third-party Android markets excluded, as the post says.',
            'cached': str(path.relative_to(ROOT)) if path else None,
            'sha256': hashlib.sha256(html_text.encode('utf-8')).hexdigest(),
        }
        end = 31 if month in (1, 3, 5, 7, 8, 10, 12) else 30 if month != 2 else (29 if year % 4 == 0 else 28)
        rows.append({'game': '(market)', 'geography': 'WW', 'stores': ['app_store', 'google_play'],
                     'period': {'kind': 'month', 'start': f'{key}-01', 'end': f'{key}-{end:02d}'},
                     'amount': amount, 'currency': 'USD', 'metric': 'market_total', 'fee_basis': 'gross',
                     'qualifier': None, 'provider': 'Sensor Tower', 'source_id': source_id,
                     'evidence_role': 'benchmark', 'review_status': 'clear',
                     'notes': f'harvested sentence: {sentence}'
                              + (f' | month-over-month {change.group(1)} {change.group(2)}%' if change else '')})
        articles.append({'month': key, 'url': url, 'status': status, 'amount_usd_m': amount,
                         'mom': f'{change.group(1)} {change.group(2)}%' if change else None})
    manual = {'added_on': arguments.added_on,
              'note': 'Sensor Tower monthly worldwide mobile-game consumer spending (App Store + Google Play), '
                      'one row per monthly top-10 blog post. Sensor Tower basis; not interchangeable with the '
                      'AppMagic monthly totals, which are a separate series.',
              'sources': sources, 'rows': rows}
    (ROOT / arguments.manual).write_text(json.dumps(manual, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / arguments.report).write_text(json.dumps({'schema_version': 1, 'production_enabled': False,
                                                     'articles': articles, 'rows': len(rows)},
                                                    ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'months_tried': len(articles), 'rows': len(rows),
                      'missing': [a['month'] for a in articles if 'amount_usd_m' not in a]}))
    for a in articles:
        if 'amount_usd_m' in a:
            print(f"  {a['month']} {a['amount_usd_m']:>7.0f}  {a['mom'] or ''}")


if __name__ == '__main__':
    main()
