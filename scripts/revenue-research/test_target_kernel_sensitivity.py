import unittest

from target_kernel_sensitivity import publication_periods, without_periods


class PublicationBlockTests(unittest.TestCase):
    def test_reprints_and_classes_share_excluded_period_but_not_other_months(self):
        sources = {'first': {'url': 'https://example.test/chart'},
                   'alias': {'url': 'https://example.test/chart'},
                   'reprint': {'url': 'https://example.test/reprint'}}
        support = [
            {'family': 'game', 'month': '2026-05', 'class': 'gross', 'source_id': 'first'},
            {'family': 'other', 'month': '2026-06', 'class': 'downloads', 'source_id': 'alias'},
        ]
        excluded = publication_periods(support, sources, 'https://example.test/chart')
        evaluation = [
            {'family': 'game', 'month': '2026-05', 'class': 'net', 'source_id': 'reprint'},
            {'family': 'game', 'month': '2026-06', 'class': 'gross', 'source_id': 'first'},
        ]
        self.assertEqual(without_periods(evaluation, excluded), [evaluation[1]])
        self.assertEqual(len(evaluation), 2)


if __name__ == '__main__':
    unittest.main()
