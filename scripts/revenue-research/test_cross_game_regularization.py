"""Closed-form expectations for changing only the cross-game ridge penalty."""
import math
import unittest

import history_fit as fit
from accuracy_five_hour_cross_game import CrossGameFit


def candidate(features):
    return {'features': features, 'lambda': math.inf, 'feature_lambda': 0.03,
            'half_life': math.inf, 'cross_index_lambda': 1.0}


class CrossGamePenalty(unittest.TestCase):
    def test_single_feature_matches_independent_ridge_solution(self):
        rows = [{'family': game, 'month': month, 'class': 'downloads', 'weight': 1.0,
                 'x': x, 'log_y': 3 * x, 'features': {'log_index': x}}
                for game, x in [('Low', -1.0), ('High', 1.0)]
                for month in ('2026-01', '2026-02')]
        fitted = CrossGameFit()(rows, candidate(['log_index']))
        # Four x^2 units, target residual 2*x, penalty one: beta = 8 / 5.
        self.assertAlmostEqual(fitted['beta']['log_index'], 1.6)
        self.assertAlmostEqual(fit.predict(rows[-1], fitted), 2.6)

    def test_temporal_penalty_is_not_increased_with_the_cross_game_penalty(self):
        rows = []
        for game, centre in [('Low', -2.0), ('High', 2.0)]:
            for month, within in [('2026-01', -1.0), ('2026-02', 1.0)]:
                x = centre + within
                rows.append({'family': game, 'month': month, 'class': 'downloads', 'weight': 1.0,
                             'x': x, 'log_y': x + 2 * x + 3 * within, 'features': {'log_index': x}})
        fitted = CrossGameFit()(rows, candidate(['log_index', 'log_index_within']))
        # Normal equations [[21,4],[4,4.03]] beta = [52,20].
        self.assertAlmostEqual(fitted['beta']['log_index'], 129.56 / 68.63)
        self.assertAlmostEqual(fitted['beta']['log_index_within'], 212 / 68.63)
        self.assertEqual(fitted['game_index_means'], {'Low': -2.0, 'High': 2.0})


if __name__ == '__main__':
    unittest.main()
