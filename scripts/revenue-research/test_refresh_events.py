"""Behavior tests for wholesale chart republish detection."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import refresh_rate


def pair(start, end, identical, moved, minutes=15.0):
    return {'from': start, 'to': end, 'minutes': minutes, 'identical': identical,
            'positions_changed': moved, 'top10_identical': identical}


class RefreshEventTests(unittest.TestCase):
    def test_a_window_where_most_charts_change_is_an_event(self):
        per_chart = {f'ios_c{index}_grossing': [pair('19:01', '19:16', False, 180)]
                     for index in range(4)}
        events = refresh_rate.refresh_events(per_chart)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['store'], 'ios')
        self.assertEqual(events[0]['charts_changed'], 4)
        self.assertEqual(events[0]['share_changed'], 1.0)
        self.assertEqual(events[0]['median_positions_changed'], 180.0)

    def test_a_quiet_window_is_not_an_event(self):
        per_chart = {f'ios_c{index}_grossing': [pair('18:35', '19:01', True, 0)]
                     for index in range(4)}
        self.assertEqual(refresh_rate.refresh_events(per_chart), [])

    def test_a_single_moving_chart_does_not_count_as_a_republish(self):
        per_chart = {'ios_c0_grossing': [pair('18:35', '19:01', False, 120)]}
        per_chart.update({f'ios_c{index}_grossing': [pair('18:35', '19:01', True, 0)]
                          for index in range(1, 5)})
        self.assertEqual(refresh_rate.refresh_events(per_chart), [])

    def test_stores_are_reported_separately(self):
        per_chart = {f'ios_c{index}_grossing': [pair('19:01', '19:16', False, 180)]
                     for index in range(3)}
        per_chart.update({f'aos_c{index}_grossing': [pair('19:01', '19:16', True, 0)]
                          for index in range(3)})
        events = refresh_rate.refresh_events(per_chart)
        self.assertEqual([event['store'] for event in events], ['ios'])

    def test_changed_countries_are_listed(self):
        per_chart = {'ios_us_grossing': [pair('19:01', '19:16', False, 180)],
                     'ios_jp_grossing': [pair('19:01', '19:16', False, 150)]}
        events = refresh_rate.refresh_events(per_chart)
        self.assertEqual(events[0]['countries_changed'], ['JP', 'US'])


if __name__ == '__main__':
    unittest.main(verbosity=1)
