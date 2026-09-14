"""Harvest MobileGamer.biz monthly top-grossing write-ups into a manual anchor file.

MobileGamer publishes AppMagic's monthly worldwide chart with a fixed basis
sentence: the IAP estimates exclude ad revenue, web-shop spend, Apple and
Google's 30% cut and China's Android ecosystem. That makes every amount here
`fee_basis: net`, a different evidence class from PocketGamer's gross figures,
and the fit must price it with its own scale.

Two kinds of rows come out of each article:

- The ranked list ("11. Clash Royale (Supercell): $51.2m") is exact and enters
  as benchmark / clear.
- Prose about the top ten is hedged ("just under $79m", "~$118.5m") and full
  of comparisons to other months, and the generic sentence extractor misread
  a third of it on the first pass (a "$50m drop" as a total, February's figure
  as June's). Prose is therefore off by default; `--include-prose` keeps it as
  reference / pending with the qualifier the sentence used, never as a
  benchmark.

List names are normalised to the identity table's spelling ("LastWar" ->
"Last War: Survival") so the same game does not split across rows.

Pages are cached verbatim with SHA-256 so every amount traces to bytes. The
article's month comes from its slug and the year from the publication date, so
"decembers-top-grossing-mobile-games-2" published in January 2026 is December
2025. Nothing here writes to the ledger; `build-anchor-ledger.js` does that from
the manual file. Research only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from datetime import date
from pathlib import Path

from harvest_monthly_charts import (MONTH_INDEX, MONTHS, ROOT, cached_fetch, extract,
                                    load_game_names, load_publisher_names, month_end,
                                    strip_html)

BASIS_SENTENCE = re.compile(
    r"IAP estimates do not include ad revenue, web shop spend, Apple and Google.s 30% cut", re.I)
PUBLISHED = re.compile(r'article:published_time"\s+content="(\d{4}-\d{2}-\d{2})')
MODIFIED = re.compile(r'article:modified_time"\s+content="(\d{4}-\d{2}-\d{2})')
LIST_ROW = re.compile(r'^(\d{1,2})\.\s+(.+?)\s+\(([^()]+)\):\s+\$([0-9]+(?:\.[0-9]+)?)\s?(m|million|bn|billion)\b', re.I)
SLUG_MONTH = re.compile(r'^([a-z]+)s-top-grossing-mobile-games')
HEDGE = {'approximately': re.compile(r'(~|about|around|approximately|roughly|-ish)', re.I),
         'nearly': re.compile(r'\b(nearly|almost|just under|just shy of|under)\b', re.I),
         'more_than': re.compile(r'\b(over|more than|passing|passed|north of|\+)\b', re.I)}


def article_month(slug: str, published: str) -> tuple[str, str] | None:
    """Period the article covers: slug month, the year it precedes publication."""
    match = SLUG_MONTH.match(slug)
    if not match or match.group(1) not in MONTH_INDEX:
        return None
    month = MONTH_INDEX[match.group(1)]
    published_on = date.fromisoformat(published)
    year = published_on.year if month < published_on.month else published_on.year - 1
    return f'{year}-{month:02d}-01', month_end(year, month)


NAME_FIXES = {
    'lastwar': 'Last War: Survival', 'lastwar: survival': 'Last War: Survival', 'last war': 'Last War: Survival',
    'pokémon go': 'Pokemon GO', 'pokemon go': 'Pokemon GO',
    'pokémon tcg pocket': 'Pokemon TCG Pocket',
    'efootball™': 'eFootball',
    'tft golden spatula': 'Golden Spatula', 'tft: golden spatula': 'Golden Spatula',
    'monopoly go': 'MONOPOLY GO!', 'honkai star rail': 'Honkai: Star Rail',
}


def canonical_name(name: str) -> str:
    return NAME_FIXES.get(name.strip().lower(), name.strip())


def list_rows(text: str) -> list[dict]:
    rows = []
    for line in text.split('\n'):
        match = LIST_ROW.match(line.strip())
        if not match:
            continue
        value = float(match.group(4)) * (1000 if match.group(5).lower() in {'bn', 'billion'} else 1)
        rows.append({'rank': int(match.group(1)), 'game': canonical_name(match.group(2)),
                     'publisher': match.group(3).strip(), 'amount_usd_m': value,
                     'sentence': line.strip()})
    return rows


def qualifier_for(sentence: str, amount_start: int) -> str | None:
    window = sentence[max(0, amount_start - 24):amount_start + 1]
    for name, pattern in HEDGE.items():
        if pattern.search(window):
            return name
    return None


def prose_rows(url: str, html_text: str, period: tuple[str, str], names: dict, publishers: dict,
               listed: set[str]) -> list[dict]:
    """Top-ten prose amounts, with the qualifier the sentence attaches to them."""
    rows = []
    for row in extract(url, html_text, names, period, publishers):
        if row['period_start'] != period[0] or not row['keep']:
            continue
        if row['game'].lower() in listed:
            continue
        sentence = row['sentence']
        position = sentence.find(f"${row['amount_usd_m']:g}")
        rows.append({**row, 'game': canonical_name(row['game']),
                     'qualifier': qualifier_for(sentence, position if position >= 0 else 0)})
    return rows


def anchor_row(game: str, amount: float, period: tuple[str, str], source_id: str, sentence: str,
               qualifier: str | None, exact: bool) -> dict:
    return {
        'game': game, 'geography': 'WW', 'stores': ['app_store', 'google_play'],
        'period': {'kind': 'month', 'start': period[0], 'end': period[1]},
        'amount': amount, 'currency': 'USD', 'metric': 'consumer_spend', 'fee_basis': 'net',
        'qualifier': qualifier, 'provider': 'AppMagic', 'source_id': source_id,
        'evidence_role': 'benchmark' if exact and not qualifier else 'reference',
        'review_status': 'clear' if exact and not qualifier else 'pending',
        'notes': f'harvested sentence: {sentence}',
    }


def page_revision_fields(html_text: str) -> dict:
    modified = MODIFIED.search(html_text)
    return {'page_modified_on': date.fromisoformat(modified.group(1)).isoformat()} if modified else {}


def harvest(urls: list[str], names: dict, publishers: dict, source_prefix: str,
            include_prose: bool = False) -> tuple[dict, list[dict], list[dict]]:
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
        basis = bool(BASIS_SENTENCE.search(strip_html(html_text)))
        if not basis:
            articles.append({'url': url, 'status': status, 'error': 'basis sentence absent; not imported'})
            continue
        source_id = f'{source_prefix}{number:02d}'
        text = strip_html(html_text)
        exact = list_rows(text)
        listed = {row['game'].lower() for row in exact}
        prose = prose_rows(url, html_text, period, names, publishers, listed) if include_prose else []
        sha = hashlib.sha256(html_text.encode('utf-8')).hexdigest()
        sources[source_id] = {
            'url': url, 'provider': 'AppMagic', 'publisher': 'MobileGamer.biz',
            'published_on': published.group(1), 'evidence_role': 'benchmark', 'review_status': 'clear',
            'basis_evidence': 'Article states the IAP estimates exclude ad revenue, web shop spend, '
                              "Apple and Google's 30% cut and China's Android ecosystem: net of platform fees.",
            'cached': str(path.relative_to(ROOT)) if path else None, 'sha256': sha,
            **page_revision_fields(html_text),
        }
        for row in exact:
            rows.append(anchor_row(row['game'], row['amount_usd_m'], period, source_id, row['sentence'], None, True))
        for row in prose:  # prose never becomes a benchmark; see the module note
            rows.append(anchor_row(row['game'], row['amount_usd_m'], period, source_id, row['sentence'],
                                   row['qualifier'] or 'approximately', False))
        articles.append({'url': url, 'status': status, 'published_on': published.group(1),
                         'period': period[0][:7], 'list_rows': len(exact), 'prose_rows': len(prose), 'sha256': sha})
        time.sleep(0.3)
    return sources, rows, articles


SEARCH_PAGES = [f'https://mobilegamer.biz/?s=top+grossing+mobile+games&paged={n}' for n in range(1, 5)]
ARTICLE_LINK = re.compile(r'href="(https://mobilegamer\.biz/([a-z]+s-top-grossing-mobile-games[a-z0-9-]*)/)"')


def discover(since: str) -> list[str]:
    """Monthly write-ups covering `since` (YYYY-MM) or later, from the site search.

    Older years reuse the same slug with a numeric suffix, so each candidate is
    fetched (cached) and kept only when its slug month and publication date
    place it inside the wanted range.
    """
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
                        help='YYYY-MM; find every monthly write-up from that month on via site search')
    parser.add_argument('--dictionary',
                        default='reports/rank-models/sustained-rank-observations-2026-09-11/session-F5mbni/collector-output/apps.json')
    parser.add_argument('--source-prefix', default='M')
    parser.add_argument('--manual', default='docs/research/anchors/manual/2026-09-12-mobilegamer-net-months.json')
    parser.add_argument('--report', default='reports/rank-models/mobilegamer-harvest-2026-09-12.json')
    parser.add_argument('--added-on', default=date.today().isoformat())
    parser.add_argument('--include-prose', action='store_true',
                        help='also keep top-ten prose amounts as reference/pending rows')
    arguments = parser.parse_args()

    urls = list(arguments.urls)
    if arguments.discover_since:  # discovered urls arrive in period order; keep it so source ids stay stable
        urls += [url for url in discover(arguments.discover_since) if url not in urls]
    if not urls:
        raise SystemExit('No article urls: pass --urls or --discover-since YYYY-MM')
    names = load_game_names(ROOT / arguments.dictionary)
    publishers = load_publisher_names(ROOT / arguments.dictionary)
    sources, rows, articles = harvest(urls, names, publishers, arguments.source_prefix,
                                      include_prose=arguments.include_prose)
    manual = {
        'added_on': arguments.added_on,
        'note': 'MobileGamer.biz monthly AppMagic charts. Every amount is net of the 30% platform cut and '
                'excludes ads, web shops and China Android, so fee_basis is net and these rows must be '
                'priced by their own scale class, never mixed with gross rows. Ranked-list rows are exact; '
                'prose rows keep the qualifier the sentence used.',
        'sources': sources, 'rows': rows,
    }
    manual_path = ROOT / arguments.manual
    manual_path.parent.mkdir(parents=True, exist_ok=True)
    manual_path.write_text(json.dumps(manual, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report_path = ROOT / arguments.report
    report_path.write_text(json.dumps({'articles': articles, 'rows': len(rows), 'manual': arguments.manual},
                                      ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for article in articles:
        print(json.dumps(article, ensure_ascii=False))
    exact = sum(1 for row in rows if row['review_status'] == 'clear')
    print(f'rows={len(rows)} clear={exact} pending={len(rows) - exact} -> {manual_path}')


if __name__ == '__main__':
    main()
