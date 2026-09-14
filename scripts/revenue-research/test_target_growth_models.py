import unittest

from target_growth_models import eligible_constraints, slope_update


class GrowthConstraintTests(unittest.TestCase):
    def test_slope_update_matches_independent_ridge_solution(self):
        self.assertAlmostEqual(slope_update([(1., .5)], .25), .4)
        self.assertEqual(slope_update([(0., .5)], .25), 0.)

    def test_growth_waits_for_publication_and_matching_training_anchor(self):
        evidence = {'published_on': '2026-08-13', 'rows': [
            {'family': 'game', 'class': 'gross', 'from_month': '2026-06', 'to_month': '2026-07'}]}
        rows = [{'family': 'game', 'class': 'gross', 'month': '2026-07'}]
        self.assertEqual(eligible_constraints(evidence, rows, '2026-08', '2026-08-01'), [])
        self.assertEqual(eligible_constraints(evidence, rows, '2026-07', '2026-09-01'), [])
        self.assertEqual(eligible_constraints(evidence, [], '2026-08', '2026-09-01'), [])
        self.assertEqual(eligible_constraints(evidence, rows, '2026-08', '2026-09-01'), evidence['rows'])

    def test_gross_growth_cannot_use_a_net_anchor(self):
        evidence = {'published_on': '2026-08-13', 'rows': [
            {'family': 'game', 'class': 'gross', 'from_month': '2026-06', 'to_month': '2026-07'}]}
        rows = [{'family': 'game', 'class': 'net', 'month': '2026-07'}]
        self.assertEqual(eligible_constraints(evidence, rows, '2026-08', '2026-09-01'), [])


if __name__ == '__main__':
    unittest.main()
