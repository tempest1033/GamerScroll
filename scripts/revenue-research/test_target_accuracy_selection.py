"""Selection respects prior outcomes and the requested quantile objective."""
import unittest

from target_accuracy_selection import choose
from service_model import reserved_game


class TargetSelectionTests(unittest.TestCase):
    def test_target_objective_rejects_large_tail_despite_smaller_median(self):
        names = [f'family-{i}' for i in range(50) if not reserved_game(f'family-{i}')][:10]
        options = [{'id': 'low-median', 'half_life': float('inf')},
                   {'id': 'balanced', 'half_life': float('inf')}]
        labels = []
        predictions = {item['id']: {} for item in options}
        for month in ('2026-03', '2026-04'):
            for i, family in enumerate(names):
                label = {'family': family, 'month': month, 'class': 'downloads',
                         'amount_usd_m': 1.0, 'available_on': '2026-05-01',
                         'source_id': 'test'}
                labels.append(label)
                key = (family, month, 'downloads')
                for item in options:
                    error = (0.01 if i < 8 else 0.50) if item['id'] == 'low-median' else 0.04
                    predictions[item['id']][key] = {
                        'family': family, 'month': month, 'class': 'downloads',
                        'status': 'estimated', 'estimate': 1e6 * (1 + error), 'cohort': 'seen',
                    }
        chosen, _ = choose(options, predictions, labels, 'downloads', '2026-05', mode='target_max')
        self.assertEqual(chosen['id'], 'balanced')
        # A future outcome with the opposite preference cannot change this selection.
        future = {**labels[0], 'month': '2026-06', 'amount_usd_m': 1e9}
        labels.append(future)
        for item in options:
            predictions[item['id']][(future['family'], '2026-06', 'downloads')] = {
                **predictions[item['id']][(future['family'], '2026-03', 'downloads')],
                'month': '2026-06', 'estimate': 1e15 if item['id'] == 'low-median' else 1.0,
            }
        chosen, _ = choose(options, predictions, labels, 'downloads', '2026-05', mode='target_max')
        self.assertEqual(chosen['id'], 'balanced')


if __name__ == '__main__':
    unittest.main()
