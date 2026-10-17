"""Regression tests for mapping review summary counts."""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import check_mapping_review


class MappingReviewSummaryTests(unittest.TestCase):
    def setUp(self):
        self.entries = [
            {"decisionStatus": "pending"},
            {"decisionStatus": "approved"},
            {"decisionStatus": "rejected"},
            {"decisionStatus": "needs-more-data"},
        ]
        self.summary = {
            "entryCount": 4,
            "pendingCount": 1,
            "approvedCount": 1,
            "rejectedCount": 1,
            "needsMoreDataCount": 1,
        }

    def test_accepts_summary_matching_entry_statuses(self):
        self.assertEqual(check_mapping_review.validate_summary(self.summary, self.entries), [])

    def test_reports_each_summary_count_drift(self):
        for field in self.summary:
            with self.subTest(field=field):
                changed_summary = dict(self.summary)
                changed_summary[field] += 1
                errors = check_mapping_review.validate_summary(changed_summary, self.entries)
                self.assertEqual(len(errors), 1)
                self.assertIn(field, errors[0])

    def test_reports_missing_summary_count(self):
        changed_summary = dict(self.summary)
        del changed_summary["pendingCount"]

        errors = check_mapping_review.validate_summary(changed_summary, self.entries)

        self.assertEqual(len(errors), 1)
        self.assertIn("pendingCount", errors[0])

    def test_rejects_boolean_summary_count(self):
        for field, value in self.summary.items():
            if value == 1:
                with self.subTest(field=field):
                    changed_summary = dict(self.summary)
                    changed_summary[field] = True
                    errors = check_mapping_review.validate_summary(changed_summary, self.entries)
                    self.assertEqual(len(errors), 1)
                    self.assertIn(field, errors[0])

    def test_rejects_float_summary_count(self):
        for field, value in self.summary.items():
            with self.subTest(field=field):
                changed_summary = dict(self.summary)
                changed_summary[field] = float(value)
                errors = check_mapping_review.validate_summary(changed_summary, self.entries)
                self.assertEqual(len(errors), 1)
                self.assertIn(field, errors[0])

    def test_rejects_non_string_decision_status_without_raising(self):
        for status in ([], {}):
            with self.subTest(status=status):
                self.assertFalse(check_mapping_review.validate_decision_status(status))

    def test_main_records_non_string_status_as_validation_failure(self):
        for status in ([], {}):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temp_dir:
                report_path = Path(temp_dir) / "review.json"
                report_path.write_text(json.dumps({
                    "summary": {
                        "entryCount": 1,
                        "pendingCount": 0,
                        "approvedCount": 0,
                        "rejectedCount": 0,
                        "needsMoreDataCount": 0,
                    },
                    "entries": [{"reviewId": "bad-status", "decisionStatus": status}],
                }), encoding="utf-8")
                output = io.StringIO()
                with patch.object(check_mapping_review, "INPUT", report_path):
                    with contextlib.redirect_stdout(output):
                        result = check_mapping_review.main()

                self.assertEqual(result, 1)
                self.assertIn("bad-status: 非法 decisionStatus", output.getvalue())


if __name__ == "__main__":
    unittest.main()
