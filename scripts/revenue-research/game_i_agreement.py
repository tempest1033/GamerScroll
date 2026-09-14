"""Check the archived Japanese rank site against our own collected charts.

The site is the only free path to Japanese ranks from before our archive starts,
so it is worth using only if it reproduces the days we collected ourselves. Both
sources are compared on the overlap window: our five-market archive holds a
games-only chart per snapshot, the site publishes one overall top-200 per day
from which a games-only order is derived.

Agreement is reported as order correlation and rank distance on the games both
sources show, plus what each source has that the other misses, because a source
that agrees on order but stops much earlier would still distort absence.
Research only.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / 'snapshots/rankings'
HARVEST = ROOT / 'reports/rank-models/game-i-jp'
ARCHIVE_HEADER = 'time,rank,id,title'


def normalise(title: str) -> str:
    """Fold a store title to a comparison key.

    The two sources print the same Japanese titles with different width, spacing
    and trademark marks, so matching raw strings would silently report a game as
    missing from one side.
    """
    # Trademark marks are stripped before the width fold, because NFKC turns them
    # into letters: normalising first would leave "eFootball™" as "efootballtm".
    folded = unicodedata.normalize('NFKC', re.sub(r'[™®©]', '', title)).lower()
    folded = re.sub(r'[\s\-_:：・,，.。!！?？\'"“”‘’()（）\[\]【】~〜/|]+', '', folded)
    return folded


def match_by_prefix(name: str, candidates: dict[str, int]) -> int | None:
    """Match one Google Play title against the site's titles by shared prefix.

    The two sources carry different marketing suffixes for the same game, such as
    an anniversary tag or a bracketed English name, so an exact key comparison
    reports live games as missing. Only an unambiguous single candidate counts;
    several matches would risk pairing two different games.
    """
    if len(name) < 4:
        return None
    hits = [rank for candidate, rank in candidates.items()
            if len(candidate) >= 4 and (candidate.startswith(name) or name.startswith(candidate))]
    return hits[0] if len(hits) == 1 else None


def archive_day(day: str, store: str, country: str = 'jp') -> list[tuple[str, str]]:
    """One day's consensus games chart from our archive, as (id, title).

    Ranks are averaged across the day's snapshots so a single intraday reshuffle
    cannot decide the comparison; the site publishes one ordering per day.
    """
    path = ARCHIVE / f'{day}_{store}_{country}_grossing.csv'
    if not path.exists():
        return []
    lines = path.read_text(encoding='utf-8').lstrip('\ufeff').splitlines()
    if lines[0] != ARCHIVE_HEADER:
        raise ValueError(f'Unexpected archive header: {path.name}')
    ranks: dict[str, list[int]] = {}
    titles: dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            continue
        _, rank, app, title = line.split(',', 3)
        ranks.setdefault(app, []).append(int(rank))
        titles[app] = title.strip().strip('"')
    order = sorted(ranks, key=lambda app: statistics.fmean(ranks[app]))
    return [(app, titles[app]) for app in order]


def harvested_day(day: str, store: str, directory: Path = HARVEST) -> list[tuple[str, str]]:
    """One day's derived games chart from the site, as (id, title)."""
    path = directory / f'{day}_{store}_jp_overall.csv'
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding='utf-8').splitlines()[1:]:
        if not line:
            continue
        overall, game_rank, app, rest = line.split(',', 3)
        if not game_rank:
            continue
        category, title = rest.split(',', 1)
        rows.append((int(game_rank), app, title.strip().strip('"')))
    rows.sort()
    return [(app, title) for _, app, title in rows]


def kendall_tau(left: list[int], right: list[int]) -> float | None:
    """Order agreement between two rankings of the same items."""
    pairs = len(left)
    if pairs < 2:
        return None
    concordant = discordant = 0
    for first in range(pairs):
        for second in range(first + 1, pairs):
            a = left[first] - left[second]
            b = right[first] - right[second]
            if a == 0 or b == 0:
                continue
            if (a > 0) == (b > 0):
                concordant += 1
            else:
                discordant += 1
    total = concordant + discordant
    return (concordant - discordant) / total if total else None


def compare_day(day: str, store: str, depth: int) -> dict | None:
    ours = archive_day(day, store)
    theirs = harvested_day(day, store)
    if not ours or not theirs:
        return None

    by_id = store == 'ios'
    key = (lambda app, title: app) if by_id else (lambda app, title: normalise(title))
    our_rank = {key(app, title): index + 1 for index, (app, title) in enumerate(ours)}
    their_rank = {key(app, title): index + 1 for index, (app, title) in enumerate(theirs)}

    pairs = []
    for name, rank in our_rank.items():
        if rank > depth:
            continue
        found = their_rank.get(name)
        if found is None and not by_id:
            found = match_by_prefix(name, their_rank)
        if found is not None:
            pairs.append((rank, found))
    if len(pairs) < 2:
        return None
    shared = pairs
    left = [rank for rank, _ in pairs]
    right = [rank for _, rank in pairs]
    differences = [abs(a - b) for a, b in zip(left, right)]
    our_top = [name for name, rank in our_rank.items() if rank <= depth]
    shared = pairs
    return {
        'day': day,
        'store': store,
        'our_depth': len(ours),
        'their_depth': len(theirs),
        'compared': len(shared),
        'our_top_missing_from_theirs': len(our_top) - len(shared),
        'exact_rank_match': sum(1 for difference in differences if difference == 0) / len(shared),
        'median_rank_difference': statistics.median(differences),
        'max_rank_difference': max(differences),
        'kendall_tau': kendall_tau(left, right),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    parser.add_argument('--depth', type=int, default=50,
                        help='compare our top N games per day')
    parser.add_argument('--harvest', default=str(HARVEST))
    parser.add_argument('--output', default='reports/rank-models/game-i-agreement.json')
    arguments = parser.parse_args()

    from datetime import date, timedelta
    first, last = date.fromisoformat(arguments.start), date.fromisoformat(arguments.end)
    days = [(first + timedelta(days=offset)).isoformat()
            for offset in range((last - first).days + 1)]

    rows = []
    for day in days:
        for store in ('ios', 'aos'):
            comparison = compare_day(day, store, arguments.depth)
            if comparison:
                rows.append(comparison)

    report = {'depth': arguments.depth, 'days': len(days), 'comparisons': len(rows),
              'rows': rows}
    for store in ('ios', 'aos'):
        subset = [row for row in rows if row['store'] == store]
        if not subset:
            continue
        taus = [row['kendall_tau'] for row in subset if row['kendall_tau'] is not None]
        report[store] = {
            'days': len(subset),
            'median_kendall_tau': statistics.median(taus) if taus else None,
            'min_kendall_tau': min(taus) if taus else None,
            'median_exact_rank_match': statistics.median(row['exact_rank_match'] for row in subset),
            'median_rank_difference': statistics.median(row['median_rank_difference'] for row in subset),
            'worst_rank_difference': max(row['max_rank_difference'] for row in subset),
            'median_their_depth': statistics.median(row['their_depth'] for row in subset),
            'median_missing_from_theirs': statistics.median(
                row['our_top_missing_from_theirs'] for row in subset),
        }
    path = ROOT / arguments.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for store in ('ios', 'aos'):
        if store in report:
            summary = report[store]
            print(f'{store}: days={summary["days"]} tau={summary["median_kendall_tau"]} '
                  f'exact={summary["median_exact_rank_match"]:.2f} '
                  f'median_diff={summary["median_rank_difference"]} '
                  f'missing={summary["median_missing_from_theirs"]}')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
