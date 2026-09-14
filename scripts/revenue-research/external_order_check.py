"""Check the model's August order against published orderings it never fitted.

Some providers publish a ranking without amounts. Those statements cannot enter
an amount ledger, but they are still a test: the model scores the same month and
should name the same games. Membership and, where the publisher states a
sequence, the order are reported separately. Research only.
"""
from __future__ import annotations

import argparse
import json

from coverage_share import ROOT
from reference_comparison import month_dates, month_index
from round_stability import kendall_tau
from score_day import load_model
from september_day_check import coverage_for

ORDERS = 'docs/research/revenue-model-2026-09-11-sustained/external-orders.json'


def model_order(index: dict, coverage: dict, size: int) -> list[str]:
    """Worldwide monthly order, coverage-corrected so it is comparable to a worldwide list."""
    scored = []
    for game, value in index.items():
        try:
            share = coverage_for(coverage, game)
        except KeyError:
            continue
        if share > 0:
            scored.append((game, value / share))
    scored.sort(key=lambda row: -row[1])
    return [game for game, _ in scored[:size]]


def compare(published: dict, predicted: list[str], known_games: set[str]) -> dict:
    stated = published['games']
    missing = [game for game in stated if game not in known_games]
    overlap = [game for game in stated if game in predicted]
    result = {'id': published['id'], 'provider': published['provider'], 'size': len(stated),
              'model_top': predicted, 'published': stated,
              'not_in_identity_map': missing,
              'membership_overlap': len(overlap) / len(stated) if stated else None,
              'ordered_claim': published['ordered']}
    if published['ordered']:
        shared = [game for game in stated if game in predicted]
        result['kendall_tau_on_shared'] = kendall_tau(shared, [game for game in predicted
                                                              if game in set(stated)])
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--orders', default=ORDERS)
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--coverage', default='reports/rank-models/coverage-share-3day-2026-09-11.json')
    parser.add_argument('--output', default='reports/rank-models/external-order-check-2026-09-11.json')
    args = parser.parse_args()
    published = json.loads((ROOT / args.orders).read_text(encoding='utf-8'))
    model = load_model(ROOT / args.model)
    coverage = json.loads((ROOT / args.coverage).read_text(encoding='utf-8'))
    period = published['orders'][0]['period']
    monthly = month_index(month_dates(period), model['params'])
    known = set(monthly['index'])
    size = max(len(row['games']) for row in published['orders'])
    predicted = model_order(monthly['index'], coverage, size)
    rows = [compare(row, predicted, known) for row in published['orders']]
    report = {
        'schema_version': 1, 'production_enabled': False, 'period': period,
        'model_variant': model['variant'], 'days_scored': len(monthly['days_used']),
        'model_top': predicted, 'orders': rows,
        'meaning': ('Membership asks whether the same games are named; order is only scored when the '
                    'publisher states a sequence. A game absent from the identity map cannot be '
                    'scored at all and is listed rather than silently dropped.'),
        'limits': ['One provider here also supplies the fitted labels, so its agreement is not independent.',
                   'Provider scopes differ - third-party Android markets, web shops and ad revenue are '
                   'treated differently - so disagreement is not necessarily a model error.'],
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output, 'model_top': predicted,
                      'orders': [{key: value for key, value in row.items() if key != 'model_top'}
                                 for row in rows]}, indent=2))


if __name__ == '__main__':
    main()
