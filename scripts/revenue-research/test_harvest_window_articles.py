"""Behaviour checks for the period classifier of the window harvester.

Its job is to decide what period an amount belongs to. A wrong period produces a
row that looks clean and is silently misfiled, so the cases that decide a date
are pinned here.
"""
from __future__ import annotations

import unittest

import harvest_window_articles as harvest


class DayDates(unittest.TestCase):
    def test_a_year_in_the_sentence_beats_the_article_year(self):
        self.assertEqual(harvest.day_from('Its record was set on November 15th, 2025.', 2026),
                         ['2025-11-15'])

    def test_without_a_year_the_article_year_is_used(self):
        self.assertEqual(harvest.day_from('It made $9.6m on September 6th.', 2026),
                         ['2026-09-06'])

    def test_a_date_written_before_the_month_is_read(self):
        self.assertEqual(harvest.day_from('Spending peaked on the 5th of September.', 2026),
                         ['2026-09-05'])

    def test_an_impossible_day_number_is_ignored(self):
        self.assertEqual(harvest.day_from('Chapter September 45 was released.', 2026), [])


class Classify(unittest.TestCase):
    def test_a_date_with_a_daily_phrase_is_a_day(self):
        kind, evidence = harvest.classify('Daily spending hit $10.1m on September 5th.', '2026-09-07')
        self.assertEqual(kind, 'day')
        self.assertEqual(evidence['date'], '2026-09-05')

    def test_a_date_without_a_daily_phrase_stays_unconfirmed(self):
        kind, _ = harvest.classify('The update landed on September 5th.', '2026-09-07')
        self.assertEqual(kind, 'day_unconfirmed')

    def test_a_week_phrase_without_dates_is_a_week(self):
        kind, evidence = harvest.classify('During the first week of September it made $44.2m.',
                                          '2026-09-08')
        self.assertEqual(kind, 'week')
        self.assertEqual(evidence['phrase'].lower(), 'first week of september')

    def test_several_dates_are_not_resolved_to_one(self):
        kind, _ = harvest.classify('Between September 4th and September 6th it fell.', '2026-09-08')
        self.assertEqual(kind, 'multi_day')

    def test_a_sentence_without_any_period_expression_is_unresolved(self):
        kind, _ = harvest.classify('The game has made $112.5m on mobile.', '2026-09-07')
        self.assertEqual(kind, 'unresolved')


class Geography(unittest.TestCase):
    def test_one_named_country_is_used(self):
        self.assertEqual(harvest.geography_of('Players in China accounted for most of it.'), 'CN')

    def test_no_named_country_means_worldwide(self):
        self.assertEqual(harvest.geography_of('It generated $44.2m that week.'), 'WW')

    def test_two_named_countries_are_ambiguous(self):
        self.assertEqual(harvest.geography_of('The US led, followed by Japan.'), 'ambiguous')


class Extraction(unittest.TestCase):
    HTML = ('<html><body><p>By Writer</p><p>September 7, 2026</p>'
            '<p>Delta Force generated $10 million in daily player spending for the first time '
            'on September 4th, 2026.</p>'
            '<p>The previous Delta Force record was set on November 15th, 2025, '
            'having made $9.8m on mobile.</p>'
            '</body></html>')
    NAMES = {'delta force': 'Delta Force'}

    def rows(self):
        return harvest.extract('https://example.test/article/', self.HTML, self.NAMES, {},
                               '2026-09-07')

    def test_the_stated_day_is_kept(self):
        kept = [row for row in self.rows() if row['keep']]
        self.assertEqual([(row['game'], row['amount_usd_m'], row['period_evidence']['date'])
                          for row in kept],
                         [('Delta Force', 10.0, '2026-09-04')])

    def test_an_older_year_is_dated_in_that_year(self):
        dated = {row['period_evidence'].get('date') for row in self.rows()}
        self.assertIn('2025-11-15', dated)

    def test_a_day_later_than_publication_is_flagged(self):
        html = self.HTML.replace('November 15th, 2025', 'November 15th, 2026')
        rows = harvest.extract('https://example.test/article/', html, self.NAMES, {}, '2026-09-07')
        flagged = [row for row in rows if 'date_after_publication' in row['flags']]
        self.assertTrue(flagged)
        self.assertFalse(any(row['keep'] for row in flagged))

    def test_published_date_is_read_from_the_page(self):
        self.assertEqual(harvest.published_on(self.HTML), '2026-09-07')


if __name__ == '__main__':
    unittest.main()
