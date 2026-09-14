"""Behavior tests for ledger import: regeneration must not drop its own rows."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harvest_to_manual


def ledger_row(game, period_start, amount, notes=''):
    return {'game': game, 'game_key': game, 'period': {'start': period_start},
            'amount_usd_m': amount, 'notes': notes}


class ExistingKeyTests(unittest.TestCase):
    def setUp(self):
        handle = tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False, encoding='utf-8')
        self.path = Path(handle.name)
        handle.close()
        self.original = harvest_to_manual.LEDGER
        harvest_to_manual.LEDGER = self.path
        self.addCleanup(self.restore)

    def restore(self):
        harvest_to_manual.LEDGER = self.original
        self.path.unlink(missing_ok=True)

    def write(self, rows):
        self.path.write_text('\n'.join(json.dumps(row) for row in rows) + '\n', encoding='utf-8')

    def test_a_hand_entered_row_blocks_a_duplicate_import(self):
        self.write([ledger_row('Honor of Kings', '2026-08-01', 218.1, 'read by hand')])
        keys = harvest_to_manual.existing_keys()
        self.assertIn((harvest_to_manual.slug('Honor of Kings'), '2026-08-01', 218.1), keys)

    def test_a_row_this_importer_wrote_is_ignored_so_regeneration_is_idempotent(self):
        self.write([ledger_row('Honor of Kings', '2026-08-01', 218.1,
                               f'{harvest_to_manual.HARVEST_MARKER} Honor of Kings made $218.1m.')])
        self.assertEqual(harvest_to_manual.existing_keys(), set())

    def test_rows_without_an_amount_are_skipped(self):
        self.write([ledger_row('Mystery', '2026-08-01', None)])
        self.assertEqual(harvest_to_manual.existing_keys(), set())

    def test_slugs_ignore_case_and_punctuation(self):
        self.assertEqual(harvest_to_manual.slug('MONOPOLY GO!'), harvest_to_manual.slug('Monopoly Go'))
        self.assertEqual(harvest_to_manual.slug('Pokémon GO'), 'pokemon-go')


if __name__ == '__main__':
    unittest.main(verbosity=1)
