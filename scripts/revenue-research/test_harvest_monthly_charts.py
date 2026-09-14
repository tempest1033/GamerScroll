"""Behavior tests for the monthly chart harvester. No network access."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harvest_monthly_charts as monthly
import harvest_sensortower_totals as sensor
from harvest_monthly_charts import (carry_is_safe, extract, extract_market_totals, find_games,
                                    month_reference, specific_enough, strip_html)

AUGUST = ('2026-08-01', '2026-08-31')
NAMES = {'honor of kings': 'Honor of Kings', 'brawl stars': 'Brawl Stars',
         'monopoly go!': 'MONOPOLY GO!', 'roblox': 'Roblox', 'efootball': 'eFootball'}
PUBLISHERS = {'tencent': 'Tencent', 'supercell': 'Supercell'}


def page(*paragraphs: str) -> str:
    body = ''.join(f'<p>{paragraph}</p>' for paragraph in paragraphs)
    return f'<html><body>{body}</body></html>'


def rows_for(*paragraphs: str, period=AUGUST):
    return extract('https://example.test/august-2026-mobile-game-charts/',
                   page(*paragraphs), NAMES, period, PUBLISHERS)

class CacheTests(unittest.TestCase):
    def test_cache_preserves_utf8_and_mixed_line_endings_without_refetch(self):
        text = '<html>\r\n<p>한글 $2.4m</p>\n<p>Two stores</p>\r</html>'
        url = 'https://example.test/source/'
        cases = [
            (monthly, lambda: monthly.cached_fetch(url)),
            (sensor, lambda: sensor.cached(url, '2026-01', False)),
        ]
        for module, fetch_cached in cases:
            with self.subTest(module=module.__name__), tempfile.TemporaryDirectory() as directory:
                with patch.object(module, 'CACHE', Path(directory)):
                    with patch.object(module, 'fetch', return_value=(200, text)):
                        status, fetched, path = fetch_cached()
                    self.assertEqual(status, 200)
                    self.assertEqual(fetched, text)
                    self.assertEqual(path.read_bytes(), text.encode('utf-8'))
                    with patch.object(module, 'fetch', side_effect=AssertionError('Unexpected refetch')):
                        cached_status, cached_text, cached_path = fetch_cached()
                    self.assertEqual((cached_status, cached_text, cached_path), (200, text, path))


class ReadingTests(unittest.TestCase):
    def test_entities_survive_stripping(self):
        text = strip_html('<p>Pok&eacute;mon Go made $71.7m in August.</p>')
        self.assertIn('Pokémon Go', text)

    def test_generic_names_are_rejected(self):
        self.assertFalse(specific_enough('the game'))
        self.assertFalse(specific_enough('mobile'))
        self.assertTrue(specific_enough('honor of kings'))
        self.assertTrue(specific_enough('roblox'))

    def test_find_games_prefers_the_longer_title(self):
        names = dict(NAMES)
        names['honor of kings world'] = 'Honor of Kings: World'
        self.assertEqual(find_games('Honor of Kings World launched in August.', names),
                         ['Honor of Kings: World'])


class PeriodTests(unittest.TestCase):
    def test_month_attaches_to_the_figure_not_to_a_comparison(self):
        sentence = 'Player spending in Monopoly Go tanked in February to $111m - a fall of 39.5% from January.'
        position = sentence.index('$111m') + len('$111m')
        start, _, basis = month_reference(sentence, (2026, 2), position=position)
        self.assertEqual(start, '2026-02-01')
        self.assertIn(basis, {'article_month', 'nearest_before'})

    def test_trailing_month_wins_over_an_earlier_mention(self):
        sentence = 'Revenue rose from $692,000 in June to $3.4m in July.'
        position = sentence.index('$3.4m') + len('$3.4m')
        start, _, basis = month_reference(sentence, (2026, 7), position=position)
        self.assertEqual(start, '2026-07-01')
        self.assertIn(basis, {'article_month', 'attached_after'})

    def test_a_month_after_the_article_month_rolls_back_a_year(self):
        sentence = 'By December, revenue rose to $76.1m.'
        start, end, _ = month_reference(sentence, (2026, 1), position=len(sentence))
        self.assertEqual((start, end), ('2025-12-01', '2025-12-31'))


class AttributionTests(unittest.TestCase):
    def test_carry_requires_a_pronoun_opener_and_no_other_proper_noun(self):
        self.assertTrue(carry_is_safe('It made just $19.6m last month.', 'Brawl Stars'))
        self.assertFalse(carry_is_safe('In third was UGC platform Roblox, which accrued $176.7m.', 'Last War'))
        self.assertFalse(carry_is_safe('Valorant Mobile had its best month to date, picking up $33.6m.', 'Arknights'))

    def test_an_in_sentence_amount_is_kept_with_its_period(self):
        rows = rows_for('Honor of Kings kept the lead, raking in another $218.1m in August.')
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['game'], 'Honor of Kings')
        self.assertEqual(row['amount_usd_m'], 218.1)
        self.assertEqual(row['period_start'], '2026-08-01')
        self.assertEqual(row['attribution'], 'in_sentence')
        self.assertTrue(row['keep'])

    def test_billions_are_converted_to_millions(self):
        rows = rows_for('Roblox players spent $1.2bn in August.')
        self.assertEqual(rows[0]['amount_usd_m'], 1200.0)


class RejectionTests(unittest.TestCase):
    def assert_flagged(self, rows, flag):
        self.assertTrue(rows)
        self.assertTrue(all(flag in row['flags'] for row in rows))
        self.assertFalse(any(row['keep'] for row in rows))

    def test_threshold_statements_are_not_amounts(self):
        self.assert_flagged(rows_for('Brawl Stars spending stayed above $50m in August.'),
                            'threshold_not_amount')

    def test_difference_sentences_are_rejected(self):
        self.assert_flagged(rows_for('Honor of Kings finished just $1.6m short of the leader in August.'),
                            'difference_not_level')

    def test_publisher_totals_are_flagged(self):
        self.assert_flagged(rows_for('Roblox and its studios collectively made $755.9m in August.'),
                            'publisher_or_aggregate')

    def test_a_sentence_naming_two_games_is_not_attributed(self):
        self.assertEqual(rows_for('Honor of Kings and eFootball together made $1.6m in August.'), [])

    def test_an_unattributed_amount_is_dropped(self):
        self.assertEqual(rows_for('Tencent generated $755.9m in gross player spending.'), [])

    def test_yearly_totals_are_flagged_as_not_monthly(self):
        self.assert_flagged(rows_for('Brawl Stars picked up an estimated $646.8 million in gross revenue in 2025.'),
                            'not_monthly')

    def test_store_specific_sentences_are_flagged(self):
        self.assert_flagged(rows_for('Roblox earned $12.3m while the App Store version alone made $2.7m.'),
                            'store_specific')

    def test_two_amounts_in_one_month_stay_ambiguous(self):
        self.assert_flagged(rows_for('Honor of Kings made $218.1m in August after $225.1m previously.'),
                            'multi_amount_same_month')

    def test_download_sentences_are_not_treated_as_revenue(self):
        rows = rows_for('Roblox picked up 21.8m installs and $4m of that came later.')
        self.assertTrue(all(row['keep'] is False for row in rows))


class MarketTotalTests(unittest.TestCase):
    def totals(self, *paragraphs, period=AUGUST):
        return extract_market_totals('https://example.test/august-2026-mobile-game-charts/',
                                     page(*paragraphs), period, NAMES)

    def test_an_aggregate_month_total_is_captured(self):
        rows = self.totals('Collectively, mobile games generated $6.8 billion during the month.')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['amount_usd_m'], 6800.0)
        self.assertEqual(rows[0]['period_start'], '2026-08-01')
        self.assertTrue(rows[0]['keep'])

    def test_a_sentence_naming_a_game_is_not_a_market_total(self):
        self.assertEqual(self.totals('Honor of Kings generated $6.8 billion during the month.'), [])

    def test_download_totals_are_not_market_spend(self):
        self.assertEqual(self.totals('Across all mobile games, installs totalled 4.2bn.'), [])

    def test_a_segment_sized_figure_is_ignored(self):
        self.assertEqual(self.totals('Collectively, mobile games generated $680m in the category.'), [])


if __name__ == '__main__':
    unittest.main(verbosity=1)
