"""Does the model put the labelled games in the published order?

Amount error and ordering fail differently: a model can be 20% off on every
game and still rank them perfectly, or land close on amounts while swapping
neighbours. This reports ordering on its own, and separately for pairs whose
published amounts are far enough apart that the order is meaningful at all.
Research only.
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from coverage_share import ROOT
import fit_rank_curve as fit

CLEAR_GAP = 0.10


def pair_scores(published: list[float], predicted: list[float], clear_gap: float = CLEAR_GAP) -> dict:
    """Concordant pairs overall, and among pairs the published amounts separate clearly."""
    total = clear_total = 0
    agree = clear_agree = 0
    inversions = []
    for left in range(len(published)):
        for right in range(left + 1, len(published)):
            if published[left] == published[right]:
                continue
            total += 1
            same = ((published[left] > published[right]) == (predicted[left] > predicted[right]))
            agree += int(same)
            separated = abs(published[left] / published[right] - 1.0) >= clear_gap
            if separated:
                clear_total += 1
                clear_agree += int(same)
                if not same:
                    inversions.append((left, right))
    return {'pairs': total, 'agreement': agree / total if total else None,
            'clear_pairs': clear_total,
            'clear_agreement': clear_agree / clear_total if clear_total else None,
            'clear_inversions': inversions}


def top_overlap(published_order: list[str], predicted_order: list[str], size: int) -> float | None:
    if len(published_order) < size:
        return None
    return len(set(published_order[:size]) & set(predicted_order[:size])) / size


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--panel', default='reports/rank-models/august-label-panel-2026-09-11.json')
    parser.add_argument('--model', default='reports/rank-models/model-card-2026-09-11.json')
    parser.add_argument('--clear-gap', type=float, default=CLEAR_GAP)
    parser.add_argument('--output', default='reports/rank-models/ordering-check-2026-09-11.json')
    args = parser.parse_args()
    panel = json.loads((ROOT / args.panel).read_text(encoding='utf-8'))
    card = json.loads((ROOT / args.model).read_text(encoding='utf-8'))
    design = fit.build_design(panel)
    records = fit.label_records(panel)
    masks = fit.scope_masks(design, records)
    params = dict(card['selected_model']['params'])
    coverage, _ = fit.coverage_vector(design, ROOT / card['coverage_report'])
    params['coverage'] = coverage if card['selected_model']['coverage_correction'] else None
    indices = {geography: fit.model_index(design, params, mask) for geography, mask in masks.items()}
    by_class: dict[str, list[dict]] = {}
    for record in records:
        index = indices[record['geography']][record['game_index']]
        if index <= 0 or record['qualifier'] is not None:
            continue      # a floor or ceiling has no single published amount to order by
        by_class.setdefault(record['klass'], []).append(
            {'game': record['game'], 'published': record['amount'], 'index': float(index)})
    classes = []
    for klass, rows in sorted(by_class.items()):
        if len(rows) < 3:
            continue
        published = [row['published'] for row in rows]
        predicted = [row['index'] for row in rows]
        scores = pair_scores(published, predicted, args.clear_gap)
        published_order = [row['game'] for row in sorted(rows, key=lambda row: -row['published'])]
        predicted_order = [row['game'] for row in sorted(rows, key=lambda row: -row['index'])]
        classes.append({
            'klass': klass, 'games': len(rows),
            'pairs': scores['pairs'], 'agreement': scores['agreement'],
            'clear_pairs': scores['clear_pairs'], 'clear_agreement': scores['clear_agreement'],
            'inverted_pairs': [{'higher_published': rows[left]['game'], 'lower_published': rows[right]['game'],
                                'published_ratio': rows[left]['published'] / rows[right]['published'],
                                'index_ratio': rows[left]['index'] / rows[right]['index']}
                               for left, right in scores['clear_inversions']],
            'top5_overlap': top_overlap(published_order, predicted_order, 5),
            'published_order': published_order, 'model_order': predicted_order,
        })
    weighted = [row for row in classes if row['clear_agreement'] is not None]
    report = {
        'schema_version': 1, 'production_enabled': False,
        'model_variant': card['selected_model']['variant'], 'params': card['selected_model']['params'],
        'clear_gap': args.clear_gap,
        'meaning': ('Ordering is scored inside each label class, because a class scale cannot change an '
                    'order. Clear pairs are those whose published amounts differ by at least the gap, '
                    'where an inversion is a real disagreement rather than a near tie.'),
        'limits': ['Ordering says nothing about amount accuracy, and vice versa.',
                   'Classes with fewer than three usable labels are skipped.',
                   'Published amounts are provider estimates, not audited revenue.'],
        'classes': classes,
        'overall_clear_agreement': (sum(row['clear_agreement'] * row['clear_pairs'] for row in weighted)
                                    / sum(row['clear_pairs'] for row in weighted)) if weighted else None,
    }
    (ROOT / args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': args.output,
                      'overall_clear_agreement': report['overall_clear_agreement'],
                      'classes': [{key: (round(value, 4) if isinstance(value, float) else value)
                                   for key, value in row.items()
                                   if key in ('klass', 'games', 'pairs', 'agreement', 'clear_pairs',
                                              'clear_agreement', 'top5_overlap')}
                                  for row in classes]}, indent=2))


if __name__ == '__main__':
    main()
