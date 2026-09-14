"""Tests for reading history/ best-of-day ranks as five-market observations."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from history_label_check import price  # noqa: E402
from history_panel import (FIRST_IDENTIFIED_DAY, best_rank_payload, month_totals,  # noqa: E402
                           score_best_ranks, snapshot_time_kst)
from score_day import identity_families, score_day  # noqa: E402

PARAMS = {'alpha_ios': 1.05, 'alpha_aos': 0.5, 'censored': 1.0, 'country_multipliers': {'CN': 3.0}}


def write_history(directory: Path, day: str, best_ranks: dict, timestamp: str = '2026-03-15T14:01:38.567Z') -> None:
    (directory / f'{day}.json').write_text(
        json.dumps({'compact': 1, 'timestamp': timestamp, 'bestRanks': best_ranks, 'rankings': {}}),
        encoding='utf-8')


class Payload(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_only_five_market_charts_with_valid_rows_are_kept(self):
        write_history(self.dir, '2026-03-15', {
            'ios_us_grossing': {'100': 1, '200': 2, '': 5, '300': 0, '400': 'x'},
            'aos_cn_grossing': {},
            'ios_us_free': {'100': 1},
            'ios_de_grossing': {'100': 1},
        })
        payload = best_rank_payload('2026-03-15', self.dir)
        self.assertEqual(sorted(payload['charts']), ['ios_us_free', 'ios_us_grossing'])
        chart = payload['charts']['ios_us_grossing']
        self.assertEqual(chart['ranks'], {'100': 1, '200': 2})
        self.assertEqual((chart['depth'], chart['rows'], chart['dropped']), (2, 2, 3))
        self.assertEqual(payload['time_kst'], '23:01')

    def test_missing_file_or_missing_best_ranks_is_none_not_an_empty_day(self):
        self.assertIsNone(best_rank_payload('2026-03-15', self.dir))
        (self.dir / '2026-03-16.json').write_text(json.dumps({'compact': 1, 'rankings': {}}), encoding='utf-8')
        self.assertIsNone(best_rank_payload('2026-03-16', self.dir))

    def test_month_totals_skip_days_before_ids_were_recorded(self):
        families, _ = identity_families()
        ios = next(app.split(':')[1] for app in families if app.startswith('ios:'))
        write_history(self.dir, '2025-12-11', {'ios_us_grossing': {ios: 1}})
        write_history(self.dir, FIRST_IDENTIFIED_DAY, {'ios_us_grossing': {ios: 1}})
        write_history(self.dir, '2025-12-13', {'ios_us_grossing': {ios: 1}})
        totals = month_totals('2025-12', PARAMS, self.dir)
        self.assertEqual(totals['days'], [FIRST_IDENTIFIED_DAY, '2025-12-13'])
        self.assertEqual(totals['calendar_days'], 31)
        self.assertEqual(totals['min_depth'], {'ios_us_grossing': 1})

    def test_snapshot_time_is_kst(self):
        self.assertEqual(snapshot_time_kst('2026-08-15T14:46:00Z'), '23:46')
        self.assertIsNone(snapshot_time_kst(None))


class Scoring(unittest.TestCase):
    def sample_charts(self) -> dict:
        families, names = identity_families()
        picked = {}
        for slot, name in families.items():
            store = slot.split(':')[0]
            picked.setdefault((store, name), slot.split(':')[1])
        ios = [app for (store, _), app in sorted(picked.items()) if store == 'ios'][:6]
        aos = [app for (store, _), app in sorted(picked.items()) if store == 'aos'][:5]
        return {
            'ios_us_grossing': {app: rank for rank, app in enumerate(ios, start=1)},
            'ios_cn_grossing': {app: rank for rank, app in enumerate(reversed(ios), start=1)},
            'aos_jp_grossing': {app: rank for rank, app in enumerate(aos, start=1)},
        }

    def test_contiguous_best_ranks_score_exactly_like_the_archive_scorer(self):
        charts = self.sample_charts()
        payload = {'date': '2026-03-15', 'time_kst': '23:00',
                   'charts': {key: {'ranks': ranks, 'depth': max(ranks.values()), 'rows': len(ranks), 'dropped': 0}
                              for key, ranks in charts.items()}}
        archive_day = {'date': '2026-03-15', 'lists': {
            key: {'times': ['23:00'], 'ranks': [[app for app, _ in sorted(ranks.items(), key=lambda row: row[1])]]}
            for key, ranks in charts.items()}}
        ours = score_best_ranks(payload, PARAMS)['family_totals']
        theirs = score_day(archive_day, PARAMS)['family_totals']
        self.assertEqual(set(ours), set(theirs))
        for name, value in theirs.items():
            self.assertAlmostEqual(ours[name], value, delta=abs(value) * 1e-9)

    def test_tied_best_ranks_keep_their_value(self):
        families, _ = identity_families()
        first, second = [slot.split(':')[1] for slot in families if slot.startswith('ios:')][:2]
        payload = {'date': '2026-03-15', 'time_kst': '23:00', 'charts': {
            'ios_us_grossing': {'ranks': {first: 1, second: 1}, 'depth': 1, 'rows': 2, 'dropped': 0}}}
        totals = score_best_ranks(payload, PARAMS)['family_totals']
        self.assertEqual(totals[families[f'ios:{first}']], totals[families[f'ios:{second}']])

    def test_free_charts_never_enter_the_grossing_index(self):
        families, _ = identity_families()
        first = next(slot.split(':')[1] for slot in families if slot.startswith('ios:'))
        payload = {'date': '2026-03-15', 'time_kst': '23:00', 'charts': {
            'ios_us_grossing': {'ranks': {first: 5}, 'depth': 5, 'rows': 1, 'dropped': 0},
            'ios_us_free': {'ranks': {first: 1}, 'depth': 1, 'rows': 1, 'dropped': 0}}}
        grossing = score_best_ranks(payload, PARAMS, 'grossing')
        free = score_best_ranks(payload, PARAMS, 'free')
        self.assertEqual(grossing['charts'], 1)
        self.assertGreater(free['family_totals'][families[f'ios:{first}']],
                           grossing['family_totals'][families[f'ios:{first}']])

    def test_a_chart_outside_the_weight_table_is_an_error_not_zero(self):
        payload = {'date': '2026-03-15', 'time_kst': '23:00', 'charts': {
            'aos_cn_grossing': {'ranks': {'a': 1}, 'depth': 1, 'rows': 1, 'dropped': 0}}}
        with self.assertRaises(ValueError):
            score_best_ranks(payload, PARAMS)


class Pricing(unittest.TestCase):
    def test_a_shorter_month_is_prorated_from_the_31_day_scale(self):
        self.assertAlmostEqual(price(2.0, 0.5, 10.0, 31), 40.0)
        self.assertAlmostEqual(price(2.0, 0.5, 10.0, 28), 40.0 * 28 / 31)


if __name__ == '__main__':
    unittest.main()
