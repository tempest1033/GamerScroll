"""Independent paired-resampling invariants."""
from __future__ import annotations

import math
import unittest

from literature_uncertainty import paired_sensitivity


class LiteratureUncertaintyTests(unittest.TestCase):
    def rows(self, error_pct):
        return [{
            'family': f'game-{i % 3}', 'month': f'2026-{i // 3 + 1:02d}',
            'class': 'downloads', 'actual': 100.0,
            'estimate': 100.0 + error_pct, 'error_pct': error_pct,
            'log_error': math.log1p(error_pct / 100)}
            for i in range(9)]

    def test_constant_improvement_is_preserved_by_every_cluster_draw(self):
        result = paired_sensitivity(self.rows(10.0), self.rows(5.0), draws=30)
        for mode in result['resampling'].values():
            for metric in ('median_error_pct', 'p90_error_pct', 'max_error_pct'):
                self.assertEqual(mode['differences'][metric]['p025'], -5.0)
                self.assertEqual(mode['differences'][metric]['p975'], -5.0)
                self.assertEqual(mode['differences'][metric]['fraction_below_zero'], 1.0)

    def test_identical_forecasts_remain_identical_and_different_targets_are_rejected(self):
        rows = self.rows(10.0)
        result = paired_sensitivity(rows, rows, draws=30)
        for mode in result['resampling'].values():
            for difference in mode['differences'].values():
                self.assertEqual(difference['p025'], 0.0)
                self.assertEqual(difference['p975'], 0.0)
        different = [{**row, 'actual': 101.0} for row in rows]
        with self.assertRaisesRegex(ValueError, 'targets differ'):
            paired_sensitivity(rows, different, draws=30)


if __name__ == '__main__':
    unittest.main()
