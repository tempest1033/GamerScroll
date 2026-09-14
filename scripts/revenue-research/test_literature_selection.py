"""Behavioral expectations for choosing a baseline parent before a correction."""
from __future__ import annotations

import math
import unittest

import literature_models as literature
import literature_recency as recency
import service_model as service
import service_readiness as replay


def option(parent, curvature=False):
    result = {'parent_fixture': parent}
    if curvature:
        result.update(literature_method='ridge_curvature_anchored',
                      curvature_lambda=0.1, spline_count=6,
                      curvature_pooling='anchored_backbone_orthogonal',
                      curvature_anchor_strength=3.0)
    result['id'] = service.digest(result)[:16]
    return result


def evidence(options, errors):
    labels = []
    predictions = {item['id']: {} for item in options}
    for month in ('2026-01', '2026-02'):
        for i in range(6):
            name = f'selection-game-{i}'
            while service.reserved_game(name):
                name += 'x'
            label = {'family': name, 'month': month, 'class': 'downloads',
                     'amount_usd_m': 1.0, 'available_on': month + '-28', 'source_id': 'fixture'}
            labels.append(label)
            for item, error in zip(options, errors):
                predictions[item['id']][replay.key(label)] = {
                    'family': name, 'month': month, 'class': 'downloads',
                    'status': 'estimated', 'estimate': 1e6 * math.exp(error)}
    return labels, predictions


class LiteratureSelectionTests(unittest.TestCase):
    def test_without_children_the_native_selection_contract_is_unchanged(self):
        parent_a, parent_b = option('a'), option('b')
        labels, predictions = evidence([parent_a, parent_b], [0.1, 0.2])
        expected = literature.ORIGINAL_SELECT(
            [parent_a, parent_b], predictions, labels, 'downloads', '2026-03')
        actual = literature.staged_select(
            [parent_a, parent_b], predictions, labels, 'downloads', '2026-03')
        self.assertEqual(actual, expected)

    def test_a_good_child_of_a_worse_parent_cannot_change_the_parent(self):
        parent_a, parent_b = option('a'), option('b')
        child_a, child_b = option('a', True), option('b', True)
        options = [parent_a, parent_b, child_a, child_b]
        labels, predictions = evidence(options, [0.10, 0.20, 0.08, 0.01])
        chosen, detail = literature.staged_select(
            options, predictions, labels, 'downloads', '2026-03')
        self.assertEqual(detail['parent_candidate'], parent_a['id'])
        self.assertEqual(chosen['id'], child_a['id'])

    def test_warmup_remains_the_original_availability_only_choice(self):
        parent, child = option('a'), option('a', True)
        labels, predictions = evidence([parent, child], [0.5, 0.001])
        chosen, detail = literature.staged_select(
            [parent, child], predictions, labels, 'downloads', '2026-02',
            {parent['id']: 20, child['id']: 20})
        self.assertEqual(chosen['id'], parent['id'])
        self.assertEqual(detail['curvature_selection'], 'retain_parent_warmup')


class RecencyStabilityTests(unittest.TestCase):
    def options(self):
        recent = {'recipe': 'same', 'half_life': 3.0}
        full = {'recipe': 'same', 'half_life': math.inf}
        for item in (recent, full):
            item['id'] = service.digest(item)[:16]
        return recent, full

    def test_cluster_scale_matches_a_hand_computed_six_game_example(self):
        pairs = [((f'game-{game}', month, 'downloads'), 0.04 if game < 3 else -0.02)
                 for month in ('2026-01', '2026-02') for game in range(6)]
        self.assertAlmostEqual(recency.cluster_scale(pairs, 0), math.sqrt(0.02592) / 12, places=12)
        self.assertAlmostEqual(recency.cluster_scale(pairs, 1), 0.0, places=12)

    def test_full_history_is_preferred_only_when_its_disadvantage_is_uncertain(self):
        recent, full = self.options()
        labels, predictions = evidence([recent, full], [0.10, 0.11])
        games = sorted({row['family'] for row in labels})
        for key, row in predictions[full['id']].items():
            difference = 0.04 if games.index(key[0]) < 3 else -0.02
            row['estimate'] = 1e6 * math.exp(0.1 + difference)
        chosen, detail = recency.select(
            [recent, full], predictions, labels, 'downloads', '2026-03')
        self.assertEqual(chosen['id'], full['id'])
        self.assertTrue(detail['prefer_full_history'])
        labels, predictions = evidence([recent, full], [0.10, 0.15])
        chosen, detail = recency.select(
            [recent, full], predictions, labels, 'downloads', '2026-03')
        self.assertEqual(chosen['id'], recent['id'])
        self.assertFalse(detail['prefer_full_history'])

    def test_service_default_changes_downloads_only_and_retains_the_research_control(self):
        recent, full = self.options()
        labels, predictions = evidence([recent, full], [0.10, 0.11])
        games = sorted({row['family'] for row in labels})
        for key, row in predictions[full['id']].items():
            row['estimate'] = 1e6 * math.exp(0.1 + (0.04 if games.index(key[0]) < 3 else -0.02))
        selected, _ = replay.select_candidate(
            [recent, full], predictions, labels, 'downloads', '2026-03')
        self.assertEqual(selected['id'], full['id'])
        control, _ = replay.select_candidate(
            [recent, full], predictions, labels, 'downloads', '2026-03', recency_stability=False)
        self.assertEqual(control['id'], recent['id'])
        revenue_labels = [{**row, 'class': 'gross'} for row in labels]
        revenue_predictions = {
            candidate_id: {(key[0], key[1], 'gross'): {**row, 'class': 'gross'}
                           for key, row in values.items()}
            for candidate_id, values in predictions.items()}
        unchanged, _ = replay.select_candidate(
            [recent, full], revenue_predictions, revenue_labels, 'consumer_spend', '2026-03')
        self.assertEqual(unchanged['id'], recent['id'])


if __name__ == '__main__':
    unittest.main()
