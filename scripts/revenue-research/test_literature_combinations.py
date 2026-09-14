"""Independent numerical and cohort expectations for forecast combinations."""
from __future__ import annotations

import math
import unittest

from literature_combinations import combine, select_alternative
import service_readiness as replay


def forecast(amount=100.0):
    return {'family': 'game', 'month': '2026-06', 'class': 'downloads',
            'status': 'estimated', 'estimate': amount, 'prior_months': 4, 'cohort': 'seen',
            'rank_saturated': False, 'out_of_domain': [], 'first_observed_month': '2025-12'}


class LiteratureCombinationTests(unittest.TestCase):
    def test_half_blend_and_conservative_domain_have_independent_expected_values(self):
        second = {**forecast(400.0), 'prior_months': 2, 'out_of_domain': ['free_ratio']}
        result = combine(forecast(), second)
        self.assertAlmostEqual(result['estimate'], 200.0)
        self.assertEqual(result['prior_months'], 2)
        self.assertEqual(result['out_of_domain'], ['free_ratio'])

    def test_an_unavailable_component_is_not_replaced_with_baseline(self):
        second = {**forecast(), 'status': 'unavailable', 'reason': 'insufficient_training'}
        result = combine(forecast(), second)
        self.assertEqual(result['status'], 'unavailable')
        self.assertNotIn('estimate', result)
        with self.assertRaisesRegex(ValueError, 'different targets'):
            combine(forecast(), {**forecast(), 'month': '2026-07'})

    def test_cohort_selection_does_not_confuse_opposite_group_benefits(self):
        labels, baseline, alternatives = [], {}, {}
        for cohort in ('seen', 'unseen'):
            for month in ('2026-01', '2026-02'):
                for i in range(6):
                    name = f'{cohort}-game-{i}'
                    # Stable reserved families are not allowed into this test's
                    # intended 12-row development population.
                    while replay.reserved_game(name):
                        name += 'x'
                    label = {'family': name, 'month': month, 'class': 'downloads',
                             'amount_usd_m': 1.0, 'available_on': month + '-28', 'source_id': 'test'}
                    key = replay.key(label)
                    labels.append(label)
                    base_error = 0.2 if cohort == 'seen' else 0.1
                    alternative_error = 0.1 if cohort == 'seen' else 0.4
                    base = {**forecast(), 'family': name, 'month': month, 'cohort': cohort,
                            'estimate': 1e6 * math.exp(base_error)}
                    baseline[key] = base
                    alternatives[key] = {**base, 'estimate': 1e6 * math.exp(alternative_error)}
        global_choice, _ = select_alternative(
            baseline, {'alternative': alternatives}, labels, 'downloads', '2026-03', None)
        seen_choice, _ = select_alternative(
            baseline, {'alternative': alternatives}, labels, 'downloads', '2026-03', 'seen')
        unseen_choice, _ = select_alternative(
            baseline, {'alternative': alternatives}, labels, 'downloads', '2026-03', 'unseen')
        self.assertIsNone(global_choice)
        self.assertEqual(seen_choice, 'alternative')
        self.assertIsNone(unseen_choice)


if __name__ == '__main__':
    unittest.main()
