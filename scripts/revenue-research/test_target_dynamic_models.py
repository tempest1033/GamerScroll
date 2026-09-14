import unittest

from target_dynamic_models import state_forecast


class DynamicForecastTests(unittest.TestCase):
    def test_kalman_update_matches_closed_form_and_ignores_target_month(self):
        history = [{'month': '2026-05', 'residual': 0.2, 'weight': 1.0},
                   {'month': '2026-06', 'residual': 99., 'weight': 1.0}]
        self.assertAlmostEqual(state_forecast(history, '2026-06', 'kalman_level', 1., 0.), 0.1)

    def test_ar_forecast_reverts_and_respects_calendar_gap(self):
        history = [{'month': '2026-05', 'residual': 0.8, 'weight': 1.0}]
        self.assertAlmostEqual(state_forecast(history, '2026-07', 'residual_ar1', 1., 0.5), 0.2)
        self.assertEqual(state_forecast([], '2026-07', 'residual_ar1', 1., 0.5), 0.)


if __name__ == '__main__':
    unittest.main()
