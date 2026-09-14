"""Tests for the shrunk per-game fit and its rolling validation."""
from __future__ import annotations

import math
import statistics
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from history_fit import (FEATURE_NAMES, collect_labels, cross_class_check, eligible, features_for,  # noqa: E402
                         fit_shrunk, market_calendar, predict, rolling)


def label(game, month, klass, amount, role='benchmark', **extra):
    row = {'game': game, 'game_key': game, 'period': {'kind': 'month', 'start': f'{month}-01', 'end': f'{month}-28'},
           'geography': 'WW', 'currency': 'USD', 'stores': ['app_store', 'google_play'],
           'metric': 'consumer_spend', 'review_status': 'clear', 'evidence_role': role,
           'qualifier': None, 'fee_basis': klass, 'amount_usd_m': amount, 'source_id': 'T'}
    row.update(extra)
    return row


def design_row(game, month, klass, x, log_y):
    return {'family': game, 'month': month, 'class': klass, 'x': x, 'log_y': log_y, 'amount_usd_m': math.exp(log_y)}


class Eligibility(unittest.TestCase):
    def test_gross_and_net_benchmarks_are_both_eligible_but_kept_apart(self):
        rows = [label('A', '2026-01', 'gross', 100), label('A', '2026-01', 'net', 70)]
        labels, conflicts = collect_labels(rows, {'A'})
        self.assertEqual([(l['class'], l['amount_usd_m']) for l in labels], [('gross', 100), ('net', 70)])
        self.assertEqual(conflicts, [])

    def test_a_row_with_its_own_label_class_is_kept_apart_from_the_fee_classes(self):
        rows = [label('A', '2026-01', 'net', 70), label('A', '2026-01', 'net', 50, label_class='eog_st', role='candidate')]
        labels, conflicts = collect_labels(rows, {'A'})
        self.assertEqual({(l['class'], l['amount_usd_m']) for l in labels}, {('net', 70), ('eog_st', 50)})
        self.assertEqual(conflicts, [])

    def test_reference_pending_and_qualified_rows_are_excluded(self):
        self.assertFalse(eligible(label('A', '2026-01', 'gross', 100, role='reference')))
        self.assertFalse(eligible(label('A', '2026-01', 'gross', 100, review_status='pending')))
        self.assertFalse(eligible(label('A', '2026-01', 'gross', 100, qualifier='more_than')))
        self.assertTrue(eligible(label('A', '2026-01', 'net', 100)))

    def test_hedged_rows_are_usable_but_an_exact_figure_wins(self):
        self.assertTrue(eligible(label('A', '2026-01', 'gross', 100, qualifier='approximately')))
        rows = [label('A', '2026-01', 'gross', 100, qualifier='nearly'),
                label('B', '2026-01', 'gross', 90, qualifier='approximately'), label('B', '2026-01', 'gross', 80)]
        labels, conflicts = collect_labels(rows, {'A', 'B'})
        by_game = {l['family']: (l['amount_usd_m'], l['hedged']) for l in labels}
        self.assertEqual(by_game['A'], (99.0, True))  # "nearly 100" is read as 99
        self.assertEqual(by_game['B'], (80, False))
        self.assertEqual(conflicts, [])

    def test_a_disagreeing_net_gross_pair_loses_its_net_label_only(self):
        rows = []
        for i, month in enumerate(['2026-01', '2026-02', '2026-03', '2026-04']):
            rows += [label('A', month, 'gross', 100 + i), label('A', month, 'net', 70 + 0.7 * i)]
        rows += [label('B', '2026-04', 'gross', 100), label('B', '2026-04', 'net', 50)]  # a mismatch
        labels, _ = collect_labels(rows, {'A', 'B'})
        kept, report = cross_class_check(labels)
        self.assertEqual([(l['family'], l['month']) for l in report['excluded']], [('B', '2026-04')])
        self.assertIn(('B', 'gross'), {(l['family'], l['class']) for l in kept})
        self.assertNotIn(('B', 'net'), {(l['family'], l['class']) for l in kept})

    def test_a_week_is_a_label_of_its_own_period_but_a_day_is_not(self):
        week = label('A', '2026-09', 'gross', 30, period={'kind': 'week', 'label': 'first week of September 2026'})
        dated = label('A', '2026-09', 'gross', 31, period={'kind': 'range', 'start': '2026-09-08', 'end': '2026-09-14'})
        day = label('A', '2026-09', 'gross', 5, period={'kind': 'day', 'start': '2026-09-05', 'end': '2026-09-05'})
        self.assertFalse(eligible(day))
        labels, _ = collect_labels([week, dated, label('A', '2026-09', 'gross', 120)], {'A'})
        self.assertEqual([(l['period_key'], l['month'], l['period_start'], l['period_end']) for l in labels],
                         [('2026-09', '2026-09', '2026-09-01', '2026-09-30'),
                          ('2026-09-01..2026-09-07', '2026-09', '2026-09-01', '2026-09-07'),
                          ('2026-09-08..2026-09-14', '2026-09', '2026-09-08', '2026-09-14')])

    def test_benchmark_beats_candidate_and_disagreement_is_reported(self):
        rows = [label('A', '2026-01', 'gross', 100, role='candidate'), label('A', '2026-01', 'gross', 80),
                label('B', '2026-01', 'gross', 50, source_id='S1'), label('B', '2026-01', 'gross', 60, source_id='S2')]
        labels, conflicts = collect_labels(rows, {'A', 'B'})
        by_game = {l['family']: l['amount_usd_m'] for l in labels}
        self.assertEqual(by_game['A'], 80)
        self.assertEqual(by_game['B'], 55)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]['family'], 'B')


class Fit(unittest.TestCase):
    def synthetic(self):
        true_scale = {'gross': math.log(5.0), 'net': math.log(3.5)}
        true_b = {'A': 0.4, 'B': -0.3, 'C': 0.0}
        rows = []
        for month in ('2026-01', '2026-02', '2026-03', '2026-04'):
            for game, b in true_b.items():
                for klass, log_s in true_scale.items():
                    x = math.log(10 + hash((game, month)) % 7)
                    rows.append(design_row(game, month, klass, x, x + log_s + b))
        return rows, true_scale, true_b

    def test_scales_and_game_terms_are_recovered_with_light_shrinkage(self):
        # Scale and game terms are identified only up to a shared constant; the
        # penalty resolves it by centring the game terms, so compare relative
        # terms and the total per-label prediction.
        rows, true_scale, true_b = self.synthetic()
        model = fit_shrunk(rows, lam=0.01)
        centre = statistics.fmean(true_b.values())
        for klass, value in true_scale.items():
            self.assertAlmostEqual(model['log_scale'][klass], value + centre, places=2)
        for game, value in true_b.items():
            self.assertAlmostEqual(model['b'][game], value - centre, places=2)
        for row in rows:
            self.assertAlmostEqual(predict(row, model), row['log_y'], places=2)

    def test_heavy_shrinkage_pulls_game_terms_towards_zero(self):
        rows, _, _ = self.synthetic()
        light = fit_shrunk(rows, lam=0.01)
        heavy = fit_shrunk(rows, lam=100.0)
        self.assertLess(abs(heavy['b']['A']), abs(light['b']['A']) / 5)
        self.assertEqual(fit_shrunk(rows, lam=math.inf)['b']['A'], 0.0)

    def test_an_unseen_game_is_priced_by_the_shared_part_only(self):
        rows, _, _ = self.synthetic()
        model = fit_shrunk(rows, lam=1.0)
        row = design_row('Z', '2026-05', 'gross', 2.0, 0.0)
        self.assertAlmostEqual(predict(row, model), 2.0 + model['log_scale']['gross'])
        self.assertIsNone(predict(design_row('Z', '2026-05', 'other', 2.0, 0.0), model))

    def test_rolling_predicts_each_month_from_earlier_months_only(self):
        rows, _, _ = self.synthetic()
        rows.append(design_row('NEW', '2026-04', 'gross', 1.0, 1.0 + math.log(5.0)))
        results = rolling(rows, lam=0.01)
        months = sorted({r['month'] for r in results})
        # February is not scored: one training month holds only three labels per class
        self.assertEqual(months, ['2026-03', '2026-04'])
        new = next(r for r in results if r['family'] == 'NEW')
        self.assertEqual((new['training_months'], new['prior_labels']), (3, 0))
        seen = [r for r in results if r['family'] == 'A' and r['month'] == '2026-04']
        self.assertTrue(all(r['prior_labels'] == 6 for r in seen))
        self.assertTrue(all(abs(r['error_pct']) < 1 for r in seen))


class ClassScaleSupport(unittest.TestCase):
    def test_a_class_with_too_few_training_labels_is_not_scored(self):
        rows = [design_row('A', f'2026-0{m}', 'net', 1.0, 1.0 + math.log(5.0)) for m in range(1, 7)]
        rows += [design_row('B', f'2026-0{m}', 'net', 2.0, 2.0 + math.log(5.0)) for m in range(1, 7)]
        rows.append(design_row('A', '2026-02', 'gross', 1.0, 1.0 + math.log(7.0)))  # one gross label early on
        rows.append(design_row('A', '2026-03', 'gross', 1.0, 1.0 + math.log(7.0)))
        results = rolling(rows, lam=1.0)
        self.assertTrue(all(r['class'] == 'net' for r in results))  # gross never had 5 training labels
        # net reaches five training labels only from the fourth month: 3 months x 2 games
        self.assertEqual(len(results), 6)


class Robustness(unittest.TestCase):
    def test_huber_limits_the_pull_of_one_wild_label(self):
        rows = [design_row('A', f'2026-0{m}', 'gross', 1.0, 1.0 + math.log(5.0)) for m in range(1, 7)]
        rows.append(design_row('A', '2026-07', 'gross', 1.0, 1.0 + math.log(5.0) + 2.0))  # one x7 month
        squared = fit_shrunk(rows, lam=math.inf)
        huber = fit_shrunk(rows, lam=math.inf, huber_delta=0.3)
        self.assertGreater(squared['log_scale']['gross'] - math.log(5.0), 0.25)
        self.assertLess(huber['log_scale']['gross'] - math.log(5.0), 0.12)
        self.assertEqual(huber['downweighted_labels'], 1)


class Covariates(unittest.TestCase):
    def test_market_calendar_prefers_month_rows_and_spreads_quarters_by_days(self):
        rows = [
            {'metric': 'market_total', 'geography': 'WW', 'stores': ['app_store', 'google_play'],
             'review_status': 'clear', 'fee_basis': 'gross', 'amount_usd_m': 6100,
             'period': {'kind': 'month', 'start': '2026-02-01', 'end': '2026-02-28'}},
            {'metric': 'market_total', 'geography': 'WW', 'stores': ['app_store', 'google_play'],
             'review_status': 'clear', 'fee_basis': 'gross', 'amount_usd_m': 19800,
             'period': {'kind': 'quarter', 'start': '2026-01-01', 'end': '2026-03-31'}},
            {'metric': 'market_total', 'geography': 'CN', 'stores': ['app_store'],
             'review_status': 'clear', 'fee_basis': 'gross', 'amount_usd_m': 1000,
             'period': {'kind': 'month', 'start': '2026-02-01', 'end': '2026-02-28'}},
        ]
        calendar = market_calendar(rows)
        self.assertEqual(calendar['2026-02'], 6100)
        self.assertAlmostEqual(calendar['2026-01'], 19800 * 31 / 90)
        self.assertAlmostEqual(calendar['2026-03'], 19800 * 31 / 90)
        self.assertNotIn('2026-04', calendar)

    def test_features_are_zero_when_free_chart_or_market_total_is_absent(self):
        month = {'month': '2026-04', 'mean_daily': {'A': 10.0}, 'mean_daily_free': {'A': 5.0}}
        with_free = features_for(month, 'A', 10.0, {'2026-04': 6600.0}, math.log(6600.0))
        self.assertEqual(sorted(with_free), sorted(FEATURE_NAMES))
        self.assertAlmostEqual(with_free['free_ratio'], math.log1p(0.5))
        self.assertAlmostEqual(with_free['log_market'], 0.0)
        bare = features_for({'month': '2026-05', 'mean_daily': {'A': 10.0}}, 'A', 10.0, {'2026-04': 6600.0}, 0.0)
        self.assertEqual([bare[name] for name in FEATURE_NAMES[1:] if name != 'trend'], [0.0] * (len(FEATURE_NAMES) - 2))
        self.assertAlmostEqual(bare['trend'], 5 / 12)

    def test_month_shape_covariates_read_the_peak_day_and_the_ios_share(self):
        month = {'month': '2026-04', 'mean_daily': {'A': 10.0}, 'max_daily': {'A': 25.0}, 'ios_share': {'A': 0.8}}
        shaped = features_for(month, 'A', 10.0, {}, 0.0)
        self.assertAlmostEqual(shaped['volatility'], math.log(2.5))
        self.assertAlmostEqual(shaped['ios_share'], 0.3)

    def test_only_the_requested_covariates_enter_the_fit(self):
        rows = []
        for m in range(1, 7):
            for game, size in (('A', 1.0), ('B', 3.0)):
                rows.append({**design_row(game, f'2026-0{m}', 'gross', size, size + 0.5 * (m % 2)),
                             'features': {'log_index': size, 'free_ratio': 0.0, 'log_market': 0.0,
                                          'volatility': float(m % 2), 'ios_share': 0.0}})
        base = fit_shrunk(rows, lam=math.inf, feature_lam=1.0, feature_names=['log_index'])
        self.assertEqual(sorted(base['beta']), ['log_index'])
        shaped = fit_shrunk(rows, lam=math.inf, feature_lam=1.0, feature_names=['log_index', 'volatility'])
        self.assertEqual(sorted(shaped['beta']), ['log_index', 'volatility'])
        self.assertGreater(shaped['beta']['volatility'], 0.3)


class ClassWeights(unittest.TestCase):
    def test_a_zero_weight_drops_the_class_and_a_small_weight_limits_its_pull(self):
        rows = [design_row('A', f'2026-{m:02d}', 'gross', 1.0, 1.0 + math.log(5.0)) for m in range(1, 5)]
        rows += [design_row('A', f'2026-{m:02d}', 'extra', 1.0, 1.0 + math.log(50.0)) for m in range(1, 5)]
        rows.append(design_row('B', '2026-01', 'extra', 1.0, 1.0 + math.log(500.0)))  # B only in the extra class
        dropped = fit_shrunk(rows, lam=1.0, class_weights={'extra': 0.0})
        self.assertNotIn('extra', dropped['log_scale'])
        self.assertEqual(dropped['labels_per_game'], {'A': 4})
        full = fit_shrunk(rows, lam=1.0, class_weights={'extra': 1.0})
        light = fit_shrunk(rows, lam=1.0, class_weights={'extra': 0.1})
        self.assertIn('extra', full['log_scale'])
        self.assertEqual(full['labels_per_game'], {'A': 8, 'B': 1})
        # B's own term is learnt from the extra class either way, less when that class weighs little.
        self.assertGreater(full['b']['B'], light['b']['B'])
        self.assertGreater(light['b']['B'], 0.0)


class Recency(unittest.TestCase):
    def test_a_short_half_life_prices_by_the_recent_months(self):
        # A game earned x5 per index for six months, then x10 for the last three.
        rows = [design_row('A', f'2026-{m:02d}', 'gross', 1.0, 1.0 + math.log(5.0)) for m in range(1, 7)]
        rows += [design_row('A', f'2026-{m:02d}', 'gross', 1.0, 1.0 + math.log(10.0)) for m in range(7, 10)]
        equal = fit_shrunk(rows, lam=math.inf)
        recent = fit_shrunk(rows, lam=math.inf, half_life=1.0)
        self.assertLess(abs(equal['log_scale']['gross'] - math.log(5.0)), abs(equal['log_scale']['gross'] - math.log(10.0)))
        self.assertLess(abs(recent['log_scale']['gross'] - math.log(10.0)), 0.1)
        self.assertEqual(recent['downweighted_labels'], 0)


if __name__ == '__main__':
    unittest.main()
