"""Behavioral contracts for experimental response adapters and comparisons."""
from __future__ import annotations

import copy
import math
import unittest

import numpy as np

import literature_models as literature
from literature_replay import check_baseline


def synthetic_rows():
    rows = []
    for game, shift in [('a', -1.0), ('b', 0.0), ('c', 1.0)]:
        for i, value in enumerate(np.linspace(-2.0, 2.0, 24)):
            rows.append({
                'family': game, 'month': f'2026-{i % 6 + 1:02d}', 'class': 'downloads',
                'x': float(value), 'log_y': float(2.0 + 1.4 * value + shift),
                'weight': 1.0, 'features': {'log_index': float(value)}})
    return rows


def candidate(method):
    return {
        'literature_method': method, 'lambda': 1.0, 'feature_lambda': 0.03,
        'half_life': math.inf, 'spline_count': 6, 'spline_lambda': 3.0, 'curvature_lambda': 0.1,
        'boosting_rounds': 40, 'learning_rate': 0.05, 'num_leaves': 7,
        'min_data_in_leaf': 5,
        'features': ['log_index', 'log_index_within'] if method in
        ('gpboost_slope', 'gpboost_lmm', 'gam_temporal')
        else ['log_index'],
        **({'random_slope_lambda': 0.25} if method == 'gam_temporal' else {}),
        **({'curvature_pooling': 'anchored_backbone_orthogonal',
            'curvature_anchor_strength': 3.0} if method == 'ridge_curvature_anchored' else {})}


class LiteratureModelTests(unittest.TestCase):
    def test_methods_learn_group_response_without_mutating_inputs(self):
        for method in literature.METHODS:
            with self.subTest(method=method):
                rows = synthetic_rows()
                original = copy.deepcopy(rows)
                fitted = literature.fit_model(rows, candidate(method))
                probe = {'family': 'unseen', 'month': '2026-07', 'class': 'downloads',
                         'x': 0.0, 'features': {'log_index': 0.0}}
                expected_probe = copy.deepcopy(probe)
                unseen = literature.predict(probe, fitted)
                seen = literature.predict({**probe, 'family': 'a'}, fitted)
                self.assertAlmostEqual(unseen, 2.0, delta=0.15)
                self.assertAlmostEqual(seen, 1.0, delta=0.15)
                self.assertEqual(rows, original)
                self.assertEqual(probe, expected_probe)

    def test_monotone_gam_preserves_rank_response_direction(self):
        fitted = literature.fit_model(synthetic_rows(), candidate('gam_monotone'))
        values = [literature.predict(
            {'family': 'unseen', 'month': '2026-07', 'class': 'downloads',
             'x': float(x), 'features': {'log_index': float(x)}}, fitted)
            for x in np.linspace(-2.0, 2.0, 31)]
        self.assertTrue(np.all(np.diff(values) >= -1e-8))
        self.assertGreater(values[-1] - values[0], 4.0)

    def test_gpboost_preserves_an_additive_target_translation(self):
        for method in ('gpboost_intercept', 'gpboost_slope', 'gpboost_lmm'):
            with self.subTest(method=method):
                rows = synthetic_rows()
                shifted = [{**row, 'log_y': row['log_y'] + 7.0} for row in rows]
                before = literature.fit_model(rows, candidate(method))
                after = literature.fit_model(shifted, candidate(method))
                for family in ('a', 'unseen'):
                    probe = {'family': family, 'month': '2026-07', 'class': 'downloads',
                             'x': 0.5, 'features': {'log_index': 0.5}}
                    self.assertAlmostEqual(
                        literature.predict(probe, after) - literature.predict(probe, before),
                        7.0, delta=1e-5)

    def test_temporal_gam_retains_different_game_responses(self):
        rows = synthetic_rows()
        slopes = {'a': 0.5, 'b': 1.5, 'c': 2.5}
        for row in rows:
            row['log_y'] += (slopes[row['family']] - 1.4) * row['features']['log_index']
        fitted = literature.fit_model(rows, candidate('gam_temporal'))
        for family, expected_difference in [('a', 1.0), ('c', 5.0)]:
            predictions = [literature.predict({
                'family': family, 'month': '2026-07', 'class': 'downloads',
                'x': value, 'features': {'log_index': value}}, fitted)
                for value in (-1.0, 1.0)]
            self.assertAlmostEqual(predictions[1] - predictions[0], expected_difference, delta=0.2)

    def test_evidence_and_recency_weights_are_multiplicative(self):
        rows = [{'month': '2026-01', 'weight': 0.5},
                {'month': '2026-04', 'weight': 1.0}]
        np.testing.assert_allclose(literature.observation_weights(rows, 3.0), [0.25, 1.0])
        np.testing.assert_allclose(literature.observation_weights(rows, math.inf), [0.5, 1.0])

    def test_replay_accepts_serialized_infinity_but_rejects_a_changed_selection(self):
        report = {'validation_rows': [], 'chosen': {'half_life': math.inf},
                  'selection': [{'month': '2026-01', 'candidate': 'a'}]}
        reference = {'validation_rows': [], 'chosen': {'half_life': 'inf'},
                     'selection': [{'month': '2026-01', 'candidate': 'a'}]}
        self.assertTrue(check_baseline(report, reference)['ok'])
        report['selection'][0]['candidate'] = 'b'
        with self.assertRaisesRegex(ValueError, 'selection differs'):
            check_baseline(report, reference)


if __name__ == '__main__':
    unittest.main()
