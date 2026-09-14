"""Source harvesting retains first publication and page-edit dates separately."""
import unittest
from unittest.mock import patch

import harvest_mobilegamer_charts as revenue
import harvest_mobilegamer_downloads as downloads


class SourceRevisionMetadata(unittest.TestCase):
    def test_both_harvesters_keep_revision_metadata_without_changing_month_or_amount(self):
        html = '''
        <meta property="article:published_time" content="2026-08-19T10:00:00+00:00">
        <meta property="article:modified_time" content="2026-09-02T10:00:00+00:00">
        <p>IAP estimates do not include ad revenue, web shop spend, Apple and Google's 30% cut.</p>
        <p>These estimates do not include numbers from China's fractured Android market.</p>
        <p>11. Example Game (Publisher): $10m</p>
        <p>11. Example Game (Publisher): 9m</p>
        '''
        cases = [
            (revenue, ['https://example.test/julys-top-grossing-mobile-games-example/'], 10),
            (downloads, ['https://example.test/julys-top-mobile-game-downloads-example/'], 9),
        ]
        for module, urls, amount in cases:
            with self.subTest(module=module.__name__):
                with patch.object(module, 'cached_fetch', return_value=(200, html, None)), \
                        patch.object(module.time, 'sleep'):
                    if module is revenue:
                        sources, rows, _ = module.harvest(urls, {}, {}, 'T')
                    else:
                        sources, rows, _ = module.harvest(urls, 'T')
                self.assertEqual(sources['T01']['published_on'], '2026-08-19')
                self.assertEqual(sources['T01']['page_modified_on'], '2026-09-02')
                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]['amount'], amount)
                self.assertEqual(rows[0]['period']['start'], '2026-07-01')
                self.assertEqual(rows[0]['period']['end'], '2026-07-31')


if __name__ == '__main__':
    unittest.main()
