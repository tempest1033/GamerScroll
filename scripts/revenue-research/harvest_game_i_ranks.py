"""Harvest archived Japanese daily top-grossing charts from a public rank site.

The stores only serve today's chart, so our own archive starts on 2026-08-02 and
no crawler can reach further back. This site publishes a dated page per day and
store for Japan, which is the one free path found to ranks that predate our
archive. Each page is the overall top-200 across every app category, so the
games-only rank our model consumes is derived by ranking the game rows in the
order the page already gives.

Pages are cached verbatim with their SHA-256 so any number can be traced back to
the bytes it came from. Nothing here touches the anchor ledger or production
collection. Research only.
"""
from __future__ import annotations

import argparse
import hashlib
import html as html_module
import json
import re
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'reports/rank-models/game-i-cache'
OUTPUT = ROOT / 'reports/rank-models/game-i-jp'
UA = 'Mozilla/5.0 (GamerScroll research harvester)'

# The site keys its two Japanese daily charts by these query names.
STORE_PAGES = {'ios': 'appstore-daily-topgrossing', 'aos': 'googleplay-daily-topgrossing'}
BASE = 'https://game-i.daa.jp/?{page}&ymd={day}'

ITEM = re.compile(r'(?s)<article class="gi-ranking-item">(.*?)</article>')
RANK = re.compile(r'<div class="gi-rank[^"]*">\s*<strong>(\d+)</strong>')
APP_ID = re.compile(r'\?APP/(\d+)')
TITLE = re.compile(r'<div class="gi-title">(.*?)</div>')
COMPANY = re.compile(r'<div class="gi-company">(.*?)</div>')
CATEGORY = re.compile(r'<div class="gi-meta">(.*?)</div>')
GAME_CATEGORIES = {'games', 'game', 'ゲーム'}

HEADER = 'overall_rank,game_rank,id,category,title'


def fetch(url: str, timeout: int = 30) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as error:
        return error.code, ''
    except Exception:  # network failures stay visible as status 0
        return 0, ''


def cached_fetch(url: str, cache_path: Path, refresh: bool = False) -> tuple[int, str, str]:
    """Return (status, html, sha256), reading the cache unless refresh is set."""
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.exists() and not refresh:
        text = cache_path.read_text(encoding='utf-8')
        return 200, text, hashlib.sha256(text.encode('utf-8')).hexdigest()
    status, text = fetch(url)
    if status == 200 and text:
        cache_path.write_text(text, encoding='utf-8')
        return status, text, hashlib.sha256(text.encode('utf-8')).hexdigest()
    return status, text, ''


def clean(text: str) -> str:
    return html_module.unescape(re.sub(r'(?s)<[^>]+>', '', text)).strip()


def parse_ranking(page: str) -> list[dict]:
    """Every ranked row on one dated page, in page order.

    A row without a rank number, an app id or a title is dropped rather than
    guessed at: a half-read row would enter the panel as a wrong rank, which is
    indistinguishable from a real chart move once it is in the archive.
    """
    rows = []
    for block in ITEM.findall(page):
        rank = RANK.search(block)
        app = APP_ID.search(block)
        title = TITLE.search(block)
        if not (rank and app and title):
            continue
        category = CATEGORY.search(block)
        company = COMPANY.search(block)
        rows.append({
            'overall_rank': int(rank.group(1)),
            'id': app.group(1),
            'title': clean(title.group(1)),
            'company': clean(company.group(1)) if company else '',
            'category': clean(category.group(1)) if category else '',
        })
    return rows


def add_game_ranks(rows: list[dict]) -> list[dict]:
    """Rank the game rows among themselves, keeping the page's own order.

    Category charts on both stores are the overall ordering restricted to one
    category, so the games-only rank of a game inside an overall top-200 page is
    its position among the games above it.
    """
    game_rank = 0
    for row in rows:
        if row['category'].strip().lower() in GAME_CATEGORIES:
            game_rank += 1
            row['game_rank'] = game_rank
        else:
            row['game_rank'] = None
    return rows


def rank_gaps(rows: list[dict]) -> int:
    """Overall ranks the page does not show, below its own deepest row.

    The Google Play page skips a handful of positions, so a derived games rank
    can be too small by at most the number of skipped rows above it. Counting the
    gaps keeps that bound visible instead of presenting a guess as a clean chart.
    """
    ranks = [row['overall_rank'] for row in rows]
    if ranks != sorted(set(ranks)):
        return -1  # unusable: ranks repeat or run backwards
    return max(ranks) - len(ranks) if ranks else -1


def write_day(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [HEADER]
    for row in rows:
        title = row['title'].replace('"', "'")
        lines.append(f'{row["overall_rank"]},{row["game_rank"] or ""},{row["id"]},'
                     f'"{row["category"]}","{title}"')
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def days(start: str, end: str) -> list[str]:
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if last < first:
        raise ValueError('end is before start')
    return [(first + timedelta(days=offset)).isoformat()
            for offset in range((last - first).days + 1)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    parser.add_argument('--stores', default='ios,aos')
    parser.add_argument('--output', default=str(OUTPUT))
    parser.add_argument('--cache', default=str(CACHE))
    parser.add_argument('--manifest', default='')
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--sleep', type=float, default=1.0)
    parser.add_argument('--min-rows', type=int, default=100)
    parser.add_argument('--max-gaps', type=int, default=25)
    arguments = parser.parse_args()

    output_dir, cache_dir = Path(arguments.output), Path(arguments.cache)
    stores = [store.strip() for store in arguments.stores.split(',') if store.strip()]
    for store in stores:
        if store not in STORE_PAGES:
            raise SystemExit(f'Unknown store: {store}')

    manifest = {'generated_on': date.today().isoformat(), 'source': 'game-i.daa.jp',
                'country': 'jp', 'chart': 'daily_top_grossing_overall', 'pages': [],
                'failures': []}
    for day in days(arguments.start, arguments.end):
        for store in stores:
            url = BASE.format(page=STORE_PAGES[store], day=day)
            cache_path = cache_dir / f'{store}_{day}.html'
            fresh = not cache_path.exists() or arguments.refresh
            status, page, digest = cached_fetch(url, cache_path, arguments.refresh)
            if status != 200 or not page:
                manifest['failures'].append({'day': day, 'store': store, 'status': status})
                continue
            rows = add_game_ranks(parse_ranking(page))
            games = sum(1 for row in rows if row['game_rank'])
            gaps = rank_gaps(rows)
            record = {'day': day, 'store': store, 'url': url, 'sha256': digest,
                      'bytes': len(page.encode('utf-8')), 'rows': len(rows),
                      'games': games, 'rank_gaps': gaps}
            if len(rows) < arguments.min_rows or gaps < 0 or gaps > arguments.max_gaps:
                record['rejected'] = True
                manifest['failures'].append(record)
            else:
                write_day(rows, output_dir / f'{day}_{store}_jp_overall.csv')
                manifest['pages'].append(record)
            if fresh and arguments.sleep:
                time.sleep(arguments.sleep)

    manifest['page_count'] = len(manifest['pages'])
    manifest['failure_count'] = len(manifest['failures'])
    path = Path(arguments.manifest) if arguments.manifest else output_dir / 'manifest.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'pages={manifest["page_count"]} failures={manifest["failure_count"]} -> {path}')


if __name__ == '__main__':
    main()
