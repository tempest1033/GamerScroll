import copy
import math
import unittest

import service_model as model
from target_prequential_calibration import correction, prediction_only, recalibrate


class PrequentialCalibrationTests(unittest.TestCase):
    def setUp(self):
        self.family = next(name for name in ('Alpha', 'Beta', 'Gamma', 'Delta')
                           if not model.reserved_game(name))
        self.prediction = {'family': self.family, 'month': '2026-06', 'class': 'gross',
                           'cohort': 'seen', 'status': 'estimated', 'estimate': 100.0}
        self.history = [
            {'family': self.family, 'month': '2026-04', 'class': 'gross', 'cohort': 'seen',
             'available_on': '2026-05-10', 'log_error': 0.2},
            {'family': self.family, 'month': '2026-05', 'class': 'gross', 'cohort': 'seen',
             'available_on': '2026-06-10', 'log_error': 0.4},
        ]

    def test_closed_form_shrinkage_and_signed_multiplicative_correction(self):
        # Two local errors average 0.3; n/(n+2) shrinkage gives 0.15.
        value, count = correction(self.prediction, self.history, '2026-07-01', 'family_only_shrunk')
        self.assertAlmostEqual(value, 0.15)
        self.assertEqual(count, 2)
        calibrated, _ = recalibrate(self.prediction, self.history, '2026-07-01', 'family_only_shrunk')
        self.assertAlmostEqual(calibrated['estimate'], 100 * math.exp(-0.15))
        self.assertEqual(self.prediction['estimate'], 100.0)
        self.assertAlmostEqual(correction(self.prediction, self.history, '2026-07-01', 'cohort_median')[0], 0.06)
        self.assertAlmostEqual(correction(self.prediction, self.history, '2026-07-01', 'family_shrunk')[0], 0.18)

    def test_late_revisions_unknown_dates_current_month_and_reserved_outcomes_cannot_calibrate(self):
        reserved = next(f'held-{i}' for i in range(100) if model.reserved_game(f'held-{i}'))
        excluded = []
        for changes in (
            {'available_on': '2026-07-02'}, {'available_on': None}, {'month': '2026-06'},
            {'family': reserved}, {'class': 'net'}, {'cohort': 'unseen'},
        ):
            excluded.append({**self.history[0], **changes, 'log_error': 99.0})
        for method in ('cohort_median', 'family_shrunk', 'family_only_shrunk'):
            self.assertEqual(correction(self.prediction, self.history + excluded, '2026-07-01', method),
                             correction(self.prediction, self.history, '2026-07-01', method))
        early, count = correction(self.prediction, self.history, '2026-06-01', 'family_only_shrunk')
        self.assertAlmostEqual(early, 0.2 / 3)
        self.assertEqual(count, 1)

    def test_missing_history_is_identity_and_missing_prediction_stays_unavailable(self):
        current = copy.deepcopy(self.prediction)
        for method in ('cohort_median', 'family_shrunk', 'family_only_shrunk'):
            self.assertEqual(recalibrate(current, [], '2026-07-01', method)[0], current)
        unavailable = {'family': self.family, 'month': '2026-06', 'class': 'gross',
                       'status': 'unavailable', 'reason': 'insufficient_chart_observation'}
        self.assertEqual(recalibrate(unavailable, self.history, '2026-07-01', 'family_shrunk')[0], unavailable)

    def test_saved_targets_and_old_intervals_are_not_prediction_inputs(self):
        saved = {**self.prediction, 'status': 'available', 'prior_months': 3, 'out_of_domain': [],
                 'rank_saturated': False, 'first_observed_month': '2026-01', 'actual': 1e9,
                 'log_error': 999, 'lower': 3.0, 'upper': 200.0, 'source_id': 'future'}
        stripped = prediction_only(saved)
        self.assertEqual(stripped['status'], 'estimated')
        self.assertFalse({'actual', 'log_error', 'lower', 'upper', 'source_id'} & stripped.keys())
        self.assertEqual(stripped['estimate'], 100.0)


if __name__ == '__main__':
    unittest.main()
