"""Observable estimator and training-only encoder checks on synthetic data."""
import copy
import math
import unittest

import numpy as np

import service_model as service
import target_diverse_models as diverse


def training():
    rows = []
    for month in range(1, 5):
        for game in range(6):
            index = 0.2 * game + 0.05 * month
            rows.append({
                'family': f'game-{game}', 'month': f'2026-{month:02d}', 'class': 'downloads',
                'x': index, 'log_y': index + 0.3 * game + 0.02 * month,
                'features': {'log_index': index}, 'weight': 1.0, 'group': None,
            })
    return rows


class DiverseModelTests(unittest.TestCase):
    def test_all_six_estimators_fit_weighted_nonlinear_response(self):
        x = np.linspace(-1, 1, 80).reshape(-1, 1)
        target = x[:, 0] ** 2
        for method in diverse.METHODS:
            with self.subTest(method=method):
                estimator = diverse.estimator(method, 1)
                estimator.fit(x, target, sample_weight=np.ones(len(x)))
                prediction = estimator.predict(x)
                self.assertTrue(np.isfinite(prediction).all())
                self.assertLess(np.mean((prediction - target) ** 2),
                                np.mean((target - target.mean()) ** 2))

    def test_adapter_uses_training_only_encoding_and_preserves_rows(self):
        rows = training()
        original = copy.deepcopy(rows)
        for representation in diverse.REPRESENTATIONS:
            candidate = {
                'features': ['log_index', 'log_index_within'], 'lambda': 0.25,
                'feature_lambda': 1.0, 'half_life': math.inf,
                'diverse_method': 'kernel_ridge', 'diverse_representation': representation,
            }
            fitted = diverse.fit_model(rows, candidate)
            observation = {
                'family': 'never-seen', 'month': '2026-05', 'class': 'downloads', 'x': 0.7,
                'features': {'log_index': 0.7}, 'group': None,
            }
            observation = service.within_game_observation(observation, fitted['game_index_means'])
            prior_mean = fitted['_diverse']['mean'].copy()
            first = diverse.predict(observation, fitted)
            diverse.predict({**observation, 'features': {'log_index': 1000., 'log_index_within': 0.}}, fitted)
            second = diverse.predict(observation, fitted)
            self.assertTrue(math.isfinite(first))
            self.assertEqual(first, second)
            np.testing.assert_array_equal(prior_mean, fitted['_diverse']['mean'])
        self.assertEqual(rows, original)


if __name__ == '__main__':
    unittest.main()
