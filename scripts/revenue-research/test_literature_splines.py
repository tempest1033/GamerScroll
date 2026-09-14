"""Numerical behavior of the native penalized-spline experiment."""
from __future__ import annotations

import copy
import json
import math
import unittest

import numpy as np

import history_fit as fit
import literature_splines as splines
import service_model as service


def rows(curved=False):
    result = []
    for game, shift in [('a', -0.5), ('b', 0.0), ('c', 0.5)]:
        for i, x in enumerate(np.linspace(-2, 2, 24)):
            result.append({
                'family': game, 'month': f'2026-{i % 6 + 1:02d}', 'class': 'downloads',
                'x': float(x), 'features': {'log_index': float(x)}, 'weight': 1.0,
                'log_y': 2.0 + 1.4 * float(x) + shift + (0.8 * float(x) ** 2 if curved else 0.0)})
    return result


def candidate():
    return {'features': ['log_index'], 'lambda': 0.25, 'feature_lambda': 0.03,
            'half_life': math.inf, 'curvature_lambda': 0.1, 'spline_count': 6}


class LiteratureSplineTests(unittest.TestCase):
    def test_roughness_annihilates_constant_and_linear_functions(self):
        knots = [0.0] * 4 + [1 / 3, 2 / 3] + [1.0] * 4
        penalty = splines.roughness(knots)
        greville = np.asarray([sum(knots[i + 1:i + 4]) / 3 for i in range(6)])
        np.testing.assert_allclose(penalty @ np.ones(6), 0.0, atol=1e-10)
        np.testing.assert_allclose(penalty @ greville, 0.0, atol=1e-10)
        np.testing.assert_allclose(
            splines.spline_basis(knots)([0.0, 0.3, 1.0]) @ greville,
            [0.0, 0.3, 1.0], atol=1e-12)

    def test_curvature_columns_cannot_represent_the_training_affine_component(self):
        x = np.linspace(-2, 2, 30)
        weights = np.linspace(0.5, 1.0, 30)
        state = splines.build_state(x, weights, 0.03, 0.1)
        values = splines.encoded(x, state)
        np.testing.assert_allclose(weights @ values, 0.0, atol=1e-10)
        np.testing.assert_allclose((weights * x) @ values, 0.0, atol=1e-10)
        restored = json.loads(json.dumps(state))
        np.testing.assert_array_equal(values, splines.encoded(x, restored))

    def test_linear_response_keeps_the_existing_shrunk_fit(self):
        observations = rows()
        reference = service.fit_model(observations, candidate())
        augmented = splines.augment_fit(observations, candidate(), reference, np.ones(len(observations)))
        for family in ('a', 'unseen'):
            for x in (-1.5, 0.0, 1.5):
                probe = {'family': family, 'month': '2026-07', 'class': 'downloads',
                         'x': x, 'features': {'log_index': x}}
                self.assertAlmostEqual(splines.predict(probe, augmented),
                                       fit.predict(probe, reference), delta=1e-8)

    def test_curvature_learns_a_quadratic_without_mutating_observations(self):
        observations = rows(curved=True)
        original = copy.deepcopy(observations)
        reference = service.fit_model(observations, candidate())
        augmented = splines.augment_fit(observations, candidate(), reference, np.ones(len(observations)))
        errors_before, errors_after = [], []
        for x in (-1.5, -0.5, 0.5, 1.5):
            probe = {'family': 'unseen', 'month': '2026-07', 'class': 'downloads',
                     'x': x, 'features': {'log_index': x}}
            expected = 2.0 + 1.4 * x + 0.8 * x * x
            errors_before.append(abs(fit.predict(probe, reference) - expected))
            errors_after.append(abs(splines.predict(probe, augmented) - expected))
        self.assertLess(sum(errors_after), sum(errors_before) / 2)
        self.assertEqual(observations, original)

    def test_constant_input_has_no_artificial_curvature_and_extrapolation_is_linear(self):
        self.assertIsNone(splines.build_state(np.ones(10), np.ones(10), 0.03, 0.1))
        state = splines.build_state(np.linspace(-2, 2, 30), np.ones(30), 0.03, 0.1)
        outside = splines.encoded(np.asarray([3.0, 4.0, 5.0]), state)
        np.testing.assert_allclose(outside[2] - outside[1], outside[1] - outside[0], atol=1e-12)

    def test_anchored_curvature_keeps_the_parent_for_unseen_games(self):
        observations = rows(curved=True)
        config = {**candidate(), 'curvature_pooling': 'anchored_backbone_orthogonal',
                  'curvature_anchor_strength': 3.0}
        reference = service.fit_model(observations, config)
        augmented = splines.augment_fit(observations, config, reference, np.ones(len(observations)))
        before, after = [], []
        for x in (-1.5, -0.5, 0.5, 1.5):
            unseen = {'family': 'unseen', 'month': '2026-07', 'class': 'downloads',
                      'x': x, 'features': {'log_index': x}}
            self.assertAlmostEqual(splines.predict(unseen, augmented),
                                   fit.predict(unseen, reference), delta=1e-8)
            seen = {**unseen, 'family': 'b'}
            expected = 2.0 + 1.4 * x + 0.8 * x * x
            before.append(abs(fit.predict(seen, reference) - expected))
            after.append(abs(splines.predict(seen, augmented) - expected))
        self.assertLess(sum(after), sum(before) / 2)


if __name__ == '__main__':
    unittest.main()
