import unittest

from harvest_mobilegamer_downloads import anchor_row, article_month, list_rows


class ListRows(unittest.TestCase):
    def test_ranked_download_rows_are_read_in_millions(self):
        text = ("May's top mobile game downloads: 11-20\n"
                "11. Fortnite (Epic Games): 10.3m\n"
                "12. Block Crazy Robo World Craft (Prokids Studio): 10.08m\n"
                "16. Magic Tiles 3 (Amanotes): 9.26m\n"
                "Having made the top ten in April, Royal Kingdom dropped out of the top ten.\n")
        rows = list_rows(text)
        self.assertEqual([(r['rank'], r['game'], r['amount_m']) for r in rows],
                         [(11, 'Fortnite', 10.3), (12, 'Block Crazy Robo World Craft', 10.08), (16, 'Magic Tiles 3', 9.26)])
        self.assertEqual(rows[0]['publisher'], 'Epic Games')

    def test_list_names_map_to_the_identity_family_of_the_listing(self):
        rows = list_rows("15. Mobile Legends: Bang Bang (Moonton): 9.75m\n19. Bus Traffic Driver (Goodroid): 9.7m\n")
        self.assertEqual([r['game'] for r in rows], ['Mobile Legends: Bang Bang US', 'Bus Traffic Fever'])

    def test_prose_and_revenue_lines_are_ignored(self):
        text = "With nearly 23m downloads last month, Roblox leapt to the top.\n11. Clash Royale (Supercell): $51.2m\n"
        self.assertEqual(list_rows(text), [])


class ArticleMonth(unittest.TestCase):
    def test_slug_month_takes_the_year_before_a_january_publication(self):
        self.assertEqual(article_month('decembers-top-mobile-game-downloads-2', '2026-01-08'),
                         ('2025-12-01', '2025-12-31'))

    def test_slug_month_in_the_same_year(self):
        self.assertEqual(article_month('julys-top-mobile-game-downloads-roblox-free-fire', '2026-08-19'),
                         ('2026-07-01', '2026-07-31'))

    def test_other_slugs_are_not_download_articles(self):
        self.assertIsNone(article_month('julys-top-grossing-mobile-games', '2026-08-19'))


class AnchorRow(unittest.TestCase):
    def test_row_is_a_benchmark_download_count(self):
        row = anchor_row({'rank': 11, 'game': 'Fortnite', 'publisher': 'Epic Games', 'amount_m': 10.3,
                          'sentence': '11. Fortnite (Epic Games): 10.3m'}, ('2026-05-01', '2026-05-31'), 'MDL05')
        self.assertEqual((row['metric'], row['currency'], row['unit_multiplier'], row['amount']),
                         ('downloads', 'COUNT', 1000000, 10.3))
        self.assertEqual((row['evidence_role'], row['review_status'], row['period']['start']),
                         ('benchmark', 'clear', '2026-05-01'))


if __name__ == '__main__':
    unittest.main()
