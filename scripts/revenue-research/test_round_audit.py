"""Behavior tests for the round audit: a missing artifact must not pass quietly."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import round_audit


class CountTests(unittest.TestCase):
    def test_a_count_field_and_a_list_field_both_work(self):
        self.assertEqual(round_audit.count(508), 508)
        self.assertEqual(round_audit.count(['a', 'b']), 2)
        self.assertEqual(round_audit.count(None), 0)


class CheckTests(unittest.TestCase):
    def setUp(self):
        self.directory = Path(tempfile.mkdtemp())

    def write(self, name, payload):
        path = self.directory / name
        path.write_text(json.dumps(payload), encoding='utf-8')
        return path

    def test_a_present_artifact_reports_its_evidence(self):
        path = self.write('report.json', {'rows': 7})
        name, evidence = round_audit.check('rows', path, lambda payload: f"{payload['rows']} rows")
        self.assertEqual((name, evidence), ('rows', '7 rows'))

    def test_a_missing_artifact_is_reported_as_missing(self):
        _, evidence = round_audit.check('rows', self.directory / 'absent.json', lambda payload: 'ok')
        self.assertTrue(evidence.startswith('MISSING'))

    def test_an_artifact_missing_the_field_is_reported_as_unreadable(self):
        path = self.write('report.json', {'other': 1})
        _, evidence = round_audit.check('rows', path, lambda payload: payload['rows'])
        self.assertTrue(evidence.startswith('UNREADABLE'))
        self.assertIn('rows', evidence)


if __name__ == '__main__':
    unittest.main(verbosity=1)
