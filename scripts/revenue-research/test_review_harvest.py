"""Behavior tests for the held-back review sheet."""
import json
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import review_harvest


def row(game, amount, flags, sentence='It made $1m last month.', period='2026-08-01'):
    return {'game': game, 'amount_usd_m': amount, 'flags': flags, 'keep': not flags,
            'period_start': period, 'sentence': sentence, 'attribution': 'in_sentence',
            'month_basis': 'article_month', 'source_url': 'https://example.test/'}


class ReviewSheetTests(unittest.TestCase):
    def setUp(self):
        self.stem = f'reports/rank-models/test-review-{uuid.uuid4().hex[:8]}'
        self.input = f'{self.stem}.json'
        self.output = f'{self.stem}.md'
        self.addCleanup(self.cleanup)

    def cleanup(self):
        for name in (self.input, self.output):
            path = review_harvest.ROOT / name
            if path.exists():
                path.unlink()

    def write(self, rows):
        (review_harvest.ROOT / self.input).write_text(
            json.dumps({'rows': rows, 'articles': []}), encoding='utf-8')

    def sheet(self, rows):
        self.write(rows)
        summary = review_harvest.write_review_sheet(self.input, self.output)
        self.assertEqual(summary['output'], self.output)
        return (review_harvest.ROOT / self.output).read_text(encoding='utf-8')

    def test_imported_rows_are_not_listed(self):
        text = self.sheet([row('Kept Game', 10.0, []), row('Held Game', 20.0, ['no_money_word'])])
        self.assertIn('Held Game', text)
        self.assertNotIn('Kept Game', text)

    def test_each_rule_gets_its_own_section_with_a_count(self):
        text = self.sheet([row('A', 1.0, ['no_money_word']), row('B', 2.0, ['no_money_word']),
                           row('C', 3.0, ['not_monthly'])])
        self.assertIn('## no_money_word (2)', text)
        self.assertIn('## not_monthly (1)', text)

    def test_a_row_with_two_rules_appears_under_both(self):
        text = self.sheet([row('A', 1.0, ['carried_subject', 'not_monthly'])])
        self.assertIn('## carried_subject (1)', text)
        self.assertIn('## not_monthly (1)', text)

    def test_a_pipe_in_a_sentence_cannot_break_the_table(self):
        text = self.sheet([row('A', 1.0, ['no_money_word'], sentence='Made $1m | really')])
        table_line = next(line for line in text.splitlines() if line.startswith('| 2026-08-01'))
        self.assertEqual(table_line.count('|'), 5)


if __name__ == '__main__':
    unittest.main(verbosity=1)
