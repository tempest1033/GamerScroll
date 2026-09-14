"""Tests for scoring a pre-archive period against published Japanese figures."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from game_i_period_check import free_scale, kendall_tau, labels, store_keys  # noqa: E402

ALIASES = {'Uma Musume: Pretty Derby': {'ios': ['1325457827'], 'aos': ['jp.co.cygames.umamusume']}}


class StoreKeys(unittest.TestCase):
    def test_ledger_ids_are_used_when_no_alias_applies(self):
        row = {'game': 'eFootball', 'store_ids': {'ios': ['1117270703'], 'aos': ['jp.konami.pesam']}}
        self.assertEqual(store_keys(row, ALIASES), ['ios:1117270703', 'aos:jp.konami.pesam'])

    def test_alias_replaces_a_different_regional_release(self):
        # The ledger points at the global app; the Japanese figure is the Japanese one.
        row = {'game': 'Uma Musume: Pretty Derby', 'game_key': 'Uma Musume: Pretty Derby',
               'store_ids': {'ios': ['6480433538'], 'aos': ['com.cygames.umamusume']}}
        self.assertEqual(store_keys(row, ALIASES),
                         ['ios:1325457827', 'aos:jp.co.cygames.umamusume'])

    def test_alias_never_adds_to_the_ledger_ids(self):
        row = {'game': 'Uma Musume: Pretty Derby', 'game_key': 'Uma Musume: Pretty Derby',
               'store_ids': {'ios': ['6480433538'], 'aos': ['com.cygames.umamusume']}}
        self.assertNotIn('ios:6480433538', store_keys(row, ALIASES))

    def test_game_without_resolved_ids_yields_no_keys(self):
        self.assertEqual(store_keys({'game': 'Unknown Title', 'store_ids': {}}, ALIASES), [])


class FreeScale(unittest.TestCase):
    def test_a_perfectly_proportional_set_is_reproduced_exactly(self):
        scale = free_scale([(10.0, 50.0), (4.0, 20.0), (1.0, 5.0)])
        self.assertAlmostEqual(scale, 5.0)

    def test_the_scale_sits_between_the_extremes_of_a_noisy_set(self):
        scale = free_scale([(10.0, 40.0), (10.0, 60.0)])
        self.assertGreater(scale, 4.0)
        self.assertLess(scale, 6.0)


class Ordering(unittest.TestCase):
    def test_identical_order_scores_one(self):
        self.assertEqual(kendall_tau([3.0, 2.0, 1.0], [30.0, 20.0, 10.0]), 1.0)

    def test_reversed_order_scores_minus_one(self):
        self.assertEqual(kendall_tau([3.0, 2.0, 1.0], [10.0, 20.0, 30.0]), -1.0)

    def test_a_single_game_has_no_order_to_score(self):
        self.assertIsNone(kendall_tau([1.0], [1.0]))


class Labels(unittest.TestCase):
    def test_returned_rows_all_match_the_requested_scope(self):
        rows = labels('2025-01-01', '2025-12-31', 'J1')
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(row['geography'], 'JP')
            self.assertEqual(row['metric'], 'consumer_spend')
            self.assertEqual(row['period']['start'], '2025-01-01')
            self.assertEqual(row['period']['end'], '2025-12-31')
            self.assertEqual(sorted(row['stores']), ['app_store', 'google_play'])

    def test_an_unresolved_period_end_is_not_returned(self):
        # The year-to-date rows state no cutoff, so they cannot be scored as a period.
        self.assertEqual(labels('2026-01-01', None, 'J1'), [])


if __name__ == '__main__':
    unittest.main()
