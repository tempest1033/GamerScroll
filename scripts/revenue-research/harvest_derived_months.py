"""Find month amounts the chart write-ups state only in passing.

The monthly harvesters keep sentences with one game and one amount for the
article's own month. The same articles also carry earlier months in two
forms this script collects for hand review:

- explicit: "$48m earned in November, having generated just $17.5m in October"
  gives October as well as November when each amount is followed by a month;
- derived: "$246.2m, a rise of 118.6% from December" gives December as
  246.2 / 2.186, exact up to the rounding of the published percentage.

Nothing here enters the ledger by itself: the output is a review file whose
rows must be read against the quoted sentence and copied into a manual anchor
file by hand. Research only.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from harvest_monthly_charts import AMOUNT, CACHE, MONTHS, ROOT, amount_millions, find_games, load_game_names, sentences, strip_html

MANUAL = ROOT / 'docs/research/anchors/manual'
MONTH_WORD = '|'.join(month.capitalize() for month in MONTHS)
EXPLICIT = re.compile(rf'(?:in|for|during|back in|of)\s+({MONTH_WORD})(?:\s+(\d{{4}}))?\b')
LEADING = re.compile(rf'({MONTH_WORD})(?:\s+(\d{{4}}))?(?:\u2019s|\'s)\s+(?:total|figure|revenue|earnings|IAP revenue)\s+of\s+(?:just under |just over |around |about |~)?$')
DERIVED = re.compile(r'(?:an?\s+)?(rise|increase|jump|growth|leap|gain|decline|drop|fall|decrease|dip)\s+of\s+'
                     rf'([0-9]+(?:\.[0-9]+)?)\s?%\s+(?:from|on|versus|compared (?:to|with)|over)\s+({MONTH_WORD})(?:\s+(\d{{4}}))?', re.I)


def source_map() -> dict[str, dict]:
    """slug -> {source_id, url, fee_basis, article_month, provider} from every manual file."""
    out = {}
    for path in sorted(MANUAL.glob('*.json')):
        manual = json.loads(path.read_text(encoding='utf-8'))
        months = {}
        for row in manual.get('rows', []):
            start = ((row.get('period') or {}).get('start') or '')[:7]
            if start and row.get('source_id'):
                months.setdefault(row['source_id'], []).append(start)
        for sid, source in (manual.get('sources') or {}).items():
            url = source.get('url') or ''
            if 'mobile-game-charts' not in url and 'top-grossing-mobile-games' not in url:
                continue
            slug = url.rstrip('/').split('/')[-1]
            basis = 'net' if 'mobilegamer' in url else 'gross'
            article_month = max(set(months.get(sid, [])), key=months.get(sid, []).count) if months.get(sid) else None
            out.setdefault(slug, {'source_id': sid, 'url': url, 'fee_basis': basis, 'article_month': article_month,
                                  'provider': source.get('provider', 'AppMagic'), 'published_on': source.get('published_on')})
    return out


def month_key(name: str, year: str | None, article_month: str | None) -> str | None:
    number = MONTHS.index(name.lower()) + 1
    if year:
        return f'{year}-{number:02d}'
    if not article_month:
        return None
    article_year, article_number = int(article_month[:4]), int(article_month[5:7])
    year_guess = article_year if number <= article_number else article_year - 1
    return f'{year_guess}-{number:02d}'


def candidates(text: str, names: dict[str, str], info: dict) -> list[dict]:
    rows = []
    for sentence in sentences(text):
        amounts = list(AMOUNT.finditer(sentence))
        if not amounts:
            continue
        games = find_games(sentence, names)
        if len(games) != 1:
            continue
        for match in amounts:
            value = amount_millions(match.group(1), match.group(2))
            after = sentence[match.end():match.end() + 60]
            explicit = EXPLICIT.match(after.lstrip(' ,'))
            before = LEADING.search(sentence[max(0, match.start() - 60):match.start()])
            derived = DERIVED.match(after.lstrip(' ,'))
            if explicit or before:
                found = explicit or before
                month = month_key(found.group(1), found.group(2), info['article_month'])
                if month:
                    rows.append({'kind': 'explicit', 'game': games[0], 'amount_usd_m': value, 'month': month,
                                 'sentence': sentence})
            if derived:
                direction = derived.group(1).lower()
                pct = float(derived.group(2)) / 100
                base = value / (1 + pct) if direction in {'rise', 'increase', 'jump', 'growth', 'leap', 'gain'} else value / (1 - pct)
                month = month_key(derived.group(3), derived.group(4), info['article_month'])
                if month:
                    rows.append({'kind': 'derived', 'game': games[0], 'amount_usd_m': round(base, 2), 'month': month,
                                 'from_amount': value, 'change_pct': float(derived.group(2)), 'direction': direction,
                                 'sentence': sentence})
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dictionary',
                        default='reports/rank-models/sustained-rank-observations-2026-09-11/session-F5mbni/collector-output/apps.json')
    parser.add_argument('--output', default='reports/rank-models/derived-months-review-2026-09-12.json')
    arguments = parser.parse_args()
    names = load_game_names(ROOT / arguments.dictionary)
    identities = json.loads((ROOT / 'docs/research/anchors/identities.json').read_text(encoding='utf-8'))
    for name in identities['games']:
        names.setdefault(name.lower(), name)
    for alias, canonical in identities['aliases'].items():
        names.setdefault(alias.lower(), canonical)
    sources = source_map()
    rows = []
    for slug, info in sources.items():
        path = CACHE / f'{slug}.html'
        if not path.exists():
            continue
        for row in candidates(strip_html(path.read_text(encoding='utf-8')), names, info):
            rows.append({**row, **{k: info[k] for k in ('source_id', 'url', 'fee_basis', 'article_month')}})
    seen = set()
    unique = []
    for row in rows:
        key = (row['game'], row['month'], row['fee_basis'], row['amount_usd_m'])
        if key not in seen:
            seen.add(key)
            unique.append(row)
    output = ROOT / arguments.output
    output.write_text(json.dumps({'schema_version': 1, 'production_enabled': False, 'articles': len(sources),
                                  'rows': unique}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'articles={len(sources)} candidates={len(unique)} -> {arguments.output}')
    for row in sorted(unique, key=lambda r: (r['month'], r['game'])):
        print(f"{row['month']} {row['fee_basis']:<5} {row['kind']:<8} {row['game'][:26]:<26} {row['amount_usd_m']:>7} "
              f"[{row['source_id']}] {row['sentence'][:120]}")


if __name__ == '__main__':
    main()
