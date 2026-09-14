"""Behavior tests for repeated-state collapsing."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import snapshot_weighting


def day(lists):
    return {'date': '2026-09-11',
            'lists': {key: {'times': [f'{index:02d}:00' for index in range(len(ranks))],
                            'ranks': ranks}
                      for key, ranks in lists.items()}}


class CollapseTests(unittest.TestCase):
    def test_consecutive_identical_states_collapse_to_one(self):
        collapsed, stats = snapshot_weighting.collapse_repeats(
            day({'ios_us_grossing': [['1', '2'], ['1', '2'], ['2', '1']]}))
        self.assertEqual(stats['snapshots'], 3)
        self.assertEqual(stats['states'], 2)
        self.assertEqual(collapsed['lists']['ios_us_grossing']['ranks'], [['1', '2'], ['2', '1']])

    def test_a_state_that_returns_later_is_kept_again(self):
        collapsed, stats = snapshot_weighting.collapse_repeats(
            day({'ios_us_grossing': [['1'], ['2'], ['1']]}))
        self.assertEqual(stats['states'], 3)
        self.assertEqual(collapsed['lists']['ios_us_grossing']['times'], ['00:00', '01:00', '02:00'])

    def test_a_chart_that_never_repeats_is_untouched(self):
        original = day({'aos_jp_grossing': [['1'], ['2'], ['3']]})
        collapsed, stats = snapshot_weighting.collapse_repeats(original)
        self.assertEqual(stats['snapshots'], stats['states'])
        self.assertEqual(collapsed['lists'], original['lists'])


class CompareTests(unittest.TestCase):
    def test_identical_scores_report_no_movement(self):
        totals = {'family_totals': {'A': 100.0, 'B': 50.0}}
        result = snapshot_weighting.compare(totals, {'family_totals': {'A': 100.0, 'B': 50.0}})
        self.assertEqual(result['median_index_move_pct'], 0.0)
        self.assertEqual(result['top10_positions_unchanged'], 2)

    def test_the_largest_mover_is_named(self):
        result = snapshot_weighting.compare({'family_totals': {'A': 100.0, 'B': 50.0}},
                                            {'family_totals': {'A': 101.0, 'B': 60.0}})
        self.assertEqual(result['largest_mover'], 'B')
        self.assertAlmostEqual(result['max_index_move_pct'], 20.0)

    def test_reordering_is_counted(self):
        result = snapshot_weighting.compare({'family_totals': {'A': 100.0, 'B': 90.0}},
                                            {'family_totals': {'A': 80.0, 'B': 90.0}})
        self.assertEqual(result['top10_positions_unchanged'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=1)
