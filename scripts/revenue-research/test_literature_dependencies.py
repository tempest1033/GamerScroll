"""Behavioral smoke checks for the isolated optional literature runtime."""
from __future__ import annotations

import unittest

import numpy as np


class LiteratureDependencyTests(unittest.TestCase):
    def test_pygam_predicts_a_linear_response(self):
        from pygam import LinearGAM, l

        x = np.linspace(-2.0, 2.0, 40).reshape(-1, 1)
        y = 3.0 + 2.0 * x[:, 0]
        fitted = LinearGAM(l(0, lam=0.0)).fit(x, y)
        np.testing.assert_allclose(fitted.predict([[0.0], [1.0]]), [3.0, 5.0], atol=1e-5)

    def test_gpboost_predicts_seen_and_unseen_groups(self):
        import gpboost as gpb

        x = np.tile(np.linspace(-2.0, 2.0, 20), 3).reshape(-1, 1)
        groups = np.repeat(['a', 'b', 'c'], 20)
        y = 2.0 * x[:, 0] + np.repeat([-1.0, 0.0, 1.0], 20)
        gp = gpb.GPModel(group_data=groups, num_parallel_threads=1)
        fitted = gpb.train(
            {'learning_rate': 0.1, 'num_leaves': 7, 'min_data_in_leaf': 3,
             'verbose': -1, 'num_threads': 1, 'seed': 0},
            gpb.Dataset(x, label=y), num_boost_round=40, gp_model=gp)
        prediction = fitted.predict(
            data=np.zeros((2, 1)), group_data_pred=np.array(['a', 'unseen']),
            predict_var=False, pred_latent=False)
        values = np.asarray(prediction['response_mean'])
        self.assertTrue(np.isfinite(values).all())
        self.assertLess(values[0], values[1] - 0.5)
        self.assertLess(abs(values[1]), 0.4)

    def test_mapie_constructs_a_finite_regression_interval(self):
        from mapie.regression import SplitConformalRegressor
        from sklearn.linear_model import LinearRegression

        x = np.arange(80, dtype=float).reshape(-1, 1)
        noise = np.tile([-1.0, 0.0, 1.0, 0.0], 20)
        y = 2.0 * x[:, 0] + noise
        fitted = SplitConformalRegressor(
            estimator=LinearRegression(), confidence_level=0.9, prefit=False)
        fitted.fit(x[:40], y[:40])
        fitted.conformalize(x[40:70], y[40:70])
        point, bounds = fitted.predict_interval(x[70:])
        self.assertEqual(bounds.shape, (10, 2, 1))
        self.assertTrue(np.isfinite(bounds).all())
        self.assertTrue((bounds[:, 0, 0] <= point).all())
        self.assertTrue((point <= bounds[:, 1, 0]).all())
        self.assertGreaterEqual(np.mean((bounds[:, 0, 0] <= y[70:]) &
                                       (y[70:] <= bounds[:, 1, 0])), 0.8)


if __name__ == '__main__':
    unittest.main()
