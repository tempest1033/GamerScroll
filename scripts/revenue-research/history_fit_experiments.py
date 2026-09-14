"""Quick rolling-validation experiments on top of history_fit at its chosen point.

Each variant reuses the design rows of the chosen curve and changes one thing
in the fit, so a candidate model idea is scored in seconds against the same
labels before it is threaded through the full grid. Prints one line per
variant; the baseline reproduces history_fit's rolling numbers.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path

from coverage_share import ROOT
import history_fit as hf


def load_rows(report_path: str) -> tuple[list[dict], dict]:
    report = json.loads((ROOT / report_path).read_text(encoding='utf-8'))
    chosen = report['chosen']
    params = chosen['params']
    _, family_names = hf.identity_families()
    names = set(family_names)
    all_rows = hf.ledger_rows()
    labels, _ = hf.collect_labels(all_rows, names)
    labels, _ = hf.cross_class_check(labels)
    market = hf.market_calendar(all_rows)
    groups = hf.family_groups(names, Path(hf.DICTIONARY))
    coverage_report = json.loads((ROOT / 'reports/rank-models/coverage-share-4day-2026-09-12b.json').read_text(encoding='utf-8'))
    coverage, measured, fallback_games = {}, [], []
    for family in names:
        try:
            coverage[family] = hf.coverage_for(coverage_report, family)
            measured.append(coverage[family])
        except KeyError:
            fallback_games.append(family)
    for family in fallback_games:
        coverage[family] = statistics.median(measured)
    payloads = hf.load_payloads(report['window']['first_day'], report['window']['last_day'])
    tables, table_names = hf.rank_tables(payloads)
    index = hf.monthly_index_fast(payloads, tables, table_names, params, hf.label_periods(labels))
    rows = hf.design(labels, index, coverage, 14, market, groups)
    return rows, chosen


def with_prev_gap(rows: list[dict]) -> list[dict]:
    """Add the previous month's centred log residual of the same game and class."""
    gap = {(r['family'], r['class'], r['month']): r['log_y'] - r['x'] for r in rows if r['period_key'] == r['month']}
    centre = {klass: statistics.median(v for (_, k, _), v in gap.items() if k == klass)
              for klass in {k for _, k, _ in gap}}
    out = []
    for r in rows:
        year, month = int(r['month'][:4]), int(r['month'][5:7])
        prev = f'{year - 1}-12' if month == 1 else f'{year}-{month - 1:02d}'
        value = gap.get((r['family'], r['class'], prev))
        features = {**r['features'], 'prev_gap': (value - centre[r['class']]) if value is not None else 0.0}
        out.append({**r, 'features': features})
    return out


def with_size_square(rows: list[dict]) -> list[dict]:
    centre = statistics.fmean(r['features']['log_index'] for r in rows)
    return [{**r, 'features': {**r['features'], 'size_sq': (r['features']['log_index'] - centre) ** 2}} for r in rows]


def month_as_group(rows: list[dict]) -> list[dict]:
    return [{**r, 'group': 'm:' + r['month']} for r in rows]


def with_provider_classes(rows: list[dict]) -> tuple[list[dict], dict]:
    """Split each fee class by the provider behind the label (AppMagic, Sensor Tower, ...)."""
    _, family_names = hf.identity_families()
    names = set(family_names)
    providers: dict[tuple, set] = {}
    for row in hf.ledger_rows():
        if not hf.eligible(row):
            continue
        family = hf.family_for(row, names)
        if family is None:
            continue
        key = (family, hf.period_key(row['period']), row.get('label_class') or row['fee_basis'])
        providers.setdefault(key, set()).add(row.get('provider') or 'unknown')
    counts: dict[str, int] = {}
    out = []
    for r in rows:
        found = providers.get((r['family'], r['period_key'], r['class']), set())
        provider = next(iter(found)) if len(found) == 1 else 'mixed'
        klass = f"{r['class']}@{provider}" if r['class'] in ('gross', 'net') else r['class']
        counts[klass] = counts.get(klass, 0) + 1
        out.append({**r, 'class': klass})
    return out, counts


def ensemble(result_sets: list[list[dict]]) -> list[dict]:
    pooled: dict[tuple, list[dict]] = {}
    for results in result_sets:
        for r in results:
            pooled.setdefault((r['month'], r['family'], r['class']), []).append(r)
    out = []
    for members in pooled.values():
        if len(members) < len(result_sets):
            continue
        log_pred = statistics.fmean(math.log(m['predicted_usd_m']) for m in members)
        out.append({**members[0], 'predicted_usd_m': math.exp(log_pred),
                    'error_pct': hf.pct_error(log_pred, math.log(members[0]['published_usd_m']))})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', default='reports/rank-models/history-fit-v20-labels-2026-09-12.json')
    parser.add_argument('--score-classes', default='gross,net')
    args = parser.parse_args()
    score = set(args.score_classes.split(','))
    rows, chosen = load_rows(args.report)
    opts = chosen
    base = dict(lam=opts['lambda'], feature_lam=opts['feature_lambda'],
                huber_delta=math.inf if opts['huber_delta'] in ('inf', None) else opts['huber_delta'],
                group_lam=math.inf if opts['group_lambda'] in ('inf', None) else opts['group_lambda'],
                feature_names=opts['features'], half_life=opts['half_life'], class_weights=opts['class_weights'])
    hf.FEATURE_NAMES.extend(name for name in ('prev_gap', 'size_sq') if name not in hf.FEATURE_NAMES)
    variants = [('baseline', rows, base)]
    for lam in (0.25, 1.0, 4.0):
        variants.append((f'month effects ridge {lam}', month_as_group(rows), {**base, 'group_lam': lam}))
    variants.append(('prev-month gap feature', with_prev_gap(rows), {**base, 'feature_names': base['feature_names'] + ['prev_gap']}))
    variants.append(('size squared feature', with_size_square(rows), {**base, 'feature_names': base['feature_names'] + ['size_sq']}))
    variants.append(('month effects 1 + prev gap', month_as_group(with_prev_gap(rows)),
                     {**base, 'group_lam': 1.0, 'feature_names': base['feature_names'] + ['prev_gap']}))
    for half in (1.5, 2.0):
        variants.append((f'half-life {half}', rows, {**base, 'half_life': half}))
    for lam in (0.25, 2.0):
        variants.append((f'game ridge {lam}', rows, {**base, 'lam': lam}))
    for weight in (0.5, 0.25, 0.0):
        variants.append((f'hedged label weight {weight}',
                         [{**r, 'weight': weight if r.get('hedged') else 1.0} for r in rows], base))
    for extra in (['top_share'], ['log_chart_mass'], ['top_share', 'log_chart_mass'], ['top_share', 'ios_share']):
        variants.append(('feature +' + '+'.join(extra), rows, {**base, 'feature_names': base['feature_names'] + extra}))
    for ridge in (0.1, 0.01):
        for extra in (['top_share'], ['log_chart_mass']):
            variants.append((f'feature +{extra[0]} ridge {ridge}', rows,
                             {**base, 'feature_lam': ridge, 'feature_names': base['feature_names'] + extra}))
    for delta in (0.2, 0.4, 0.5):
        variants.append((f'huber delta {delta}', rows, {**base, 'huber_delta': delta}))
    for lam in (0.35, 0.7):
        variants.append((f'game ridge {lam}', rows, {**base, 'lam': lam}))
    median_amount = statistics.median(r['amount_usd_m'] for r in rows)
    for power in (0.25, 0.5):
        variants.append((f'label size weight ^{power}',
                         [{**r, 'weight': (r['amount_usd_m'] / median_amount) ** power} for r in rows], base))
    provider_rows, provider_counts = with_provider_classes(rows)
    print('provider classes', provider_counts)
    provider_weights = {**base['class_weights'], **{k: (0.0 if k.endswith('@mixed') else 1.0) for k in provider_counts}}
    variants.append(('class split by provider', provider_rows, {**base, 'class_weights': provider_weights}))
    hedged_down = [{**r, 'class_weight_override': 0.5} for r in rows]
    print(f'rows={len(rows)} params={chosen["params"]} options={ {k: opts[k] for k in ("lambda", "huber_delta", "half_life", "features")} }')
    kept: dict[str, list[dict]] = {}
    for name, variant_rows, kwargs in variants:
        results = hf.rolling(variant_rows, **kwargs)
        results = [r for r in results if r['class'].split('@')[0] in score]
        kept[name] = results
        report(name, results)
    report('ensemble base+prev gap+month 4', ensemble([kept['baseline'], kept['prev-month gap feature'],
                                                       kept['month effects ridge 4.0']]))


def report(name: str, results: list[dict]) -> None:
    s = hf.summarise(results)
    recent = hf.summarise([r for r in results if r['month'] >= '2026-05'])
    unseen = hf.summarise([r for r in results if r['prior_labels'] == 0])
    print(f"{name:32s} n={s['labels']:3d} median={s['median_abs_error_pct']:.2f} mae={s['mae_log']:.4f} "
          f"rmse={s['rmse_log']:.4f} recent_median={recent['median_abs_error_pct']:.2f} "
          f"unseen_median={unseen['median_abs_error_pct']:.2f}")


if __name__ == '__main__':
    main()
