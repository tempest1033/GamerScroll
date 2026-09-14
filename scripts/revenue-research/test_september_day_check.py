"""Behaviour checks for scoring exact-day labels with a frozen model.

The rules worth protecting are what counts as an error and what does not: a
published bound is satisfied rather than scored, and a second game must be
measured on its own labels instead of borrowing the first game's.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import september_day_check as check

SCALE = 1e-8
COVERAGE = {'days': [{'date': '2026-09-11',
                      'per_game': [{'game': 'Test Game', 'five_market_share': 0.5}]}]}


def label(date: str, amount: float, qualifier: str | None = None) -> dict:
    return {'date': date, 'amount_usd_million': amount, 'provider': 'AppMagic',
            'anchor_id': f'v2:test:{date}', 'qualifier': qualifier, 'family': 'Test Game'}


def run_block(labels, index_by_date, fit_days=31):
    model = {'params': {'alpha_ios': 1.0, 'alpha_aos': 1.0, 'censored': 1.0}, 'scales': {}}
    with mock.patch.object(check, 'read_archive_day', lambda date: {'date': date, 'lists': {}}), \
         mock.patch.object(check, 'score_day',
                           lambda day, params: {'family_totals': {'Test Game': index_by_date[day['date']]}}):
        return check.daily_block('Test Game', labels, model, COVERAGE, SCALE, fit_days)


class DailyBlock(unittest.TestCase):
    def test_point_labels_are_scored_as_errors(self):
        block = run_block([label('2026-09-04', 4.0)], {'2026-09-04': 2.48e8})
        self.assertEqual(len(block['days']), 1)
        self.assertEqual(block['bounds'], [])
        expected = 2.48e8 / 0.5 * SCALE / 31
        self.assertAlmostEqual(block['days'][0]['predicted_usd_million'], expected, places=9)

    def test_a_ceiling_bound_is_satisfied_by_a_lower_prediction(self):
        block = run_block([label('2026-09-05', 10.1, 'nearly')], {'2026-09-05': 1e8})
        self.assertEqual(block['days'], [])
        self.assertEqual(len(block['bounds']), 1)
        self.assertTrue(block['bounds'][0]['satisfied'])

    def test_a_floor_bound_needs_a_prediction_at_least_as_large(self):
        low = run_block([label('2026-09-05', 10.0, 'more_than')], {'2026-09-05': 1e8})
        high = run_block([label('2026-09-05', 0.01, 'more_than')], {'2026-09-05': 1e8})
        self.assertFalse(low['bounds'][0]['satisfied'])
        self.assertTrue(high['bounds'][0]['satisfied'])

    def test_bounds_stay_out_of_the_error_median(self):
        both = run_block([label('2026-09-04', 4.0), label('2026-09-05', 99.0, 'nearly')],
                         {'2026-09-04': 2.48e8, '2026-09-05': 1e8})
        only_point = run_block([label('2026-09-04', 4.0)], {'2026-09-04': 2.48e8})
        self.assertEqual(both['median_abs_error_pct'], only_point['median_abs_error_pct'])

    def test_direction_agreement_counts_consecutive_point_days(self):
        block = run_block([label('2026-09-04', 4.0), label('2026-09-05', 8.0),
                           label('2026-09-06', 2.0)],
                          {'2026-09-04': 1e8, '2026-09-05': 2e8, '2026-09-06': 3e8})
        self.assertEqual(block['direction_comparisons'], 2)
        self.assertEqual(block['directions_matching'], 1)

    def test_the_window_length_divides_the_monthly_scale(self):
        month = run_block([label('2026-09-04', 4.0)], {'2026-09-04': 2.48e8}, fit_days=31)
        shorter = run_block([label('2026-09-04', 4.0)], {'2026-09-04': 2.48e8}, fit_days=1)
        self.assertAlmostEqual(shorter['days'][0]['predicted_usd_million'],
                               month['days'][0]['predicted_usd_million'] * 31, places=9)


class DailyLabels(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'anchors.jsonl'

    def write(self, rows):
        self.path.write_text('\n'.join(json.dumps(row) for row in rows) + '\n', encoding='utf-8')

    def row(self, **overrides):
        base = {'game': 'Test Game', 'geography': 'WW', 'stores': ['app_store', 'google_play'],
                'period': {'kind': 'day', 'start': '2026-09-04', 'end': '2026-09-04'},
                'metric': 'consumer_spend', 'fee_basis': 'gross', 'amount_usd_m': 4.0,
                'provider': 'AppMagic', 'id': 'v2:test:1', 'qualifier': None}
        return {**base, **overrides}

    def test_a_qualified_row_is_returned_with_its_qualifier(self):
        self.write([self.row(qualifier='nearly')])
        rows = check.daily_labels(self.path, 'Test Game')
        self.assertEqual([row['qualifier'] for row in rows], ['nearly'])

    def test_net_and_country_rows_are_left_out(self):
        self.write([self.row(fee_basis='net', id='v2:test:2'),
                    self.row(geography='JP', id='v2:test:3'),
                    self.row(id='v2:test:4')])
        rows = check.daily_labels(self.path, 'Test Game')
        self.assertEqual([row['anchor_id'] for row in rows], ['v2:test:4'])

    def test_another_games_rows_are_left_out(self):
        self.write([self.row(game='Other Game', id='v2:test:5'), self.row(id='v2:test:6')])
        rows = check.daily_labels(self.path, 'Test Game')
        self.assertEqual([row['anchor_id'] for row in rows], ['v2:test:6'])


if __name__ == '__main__':
    unittest.main()
