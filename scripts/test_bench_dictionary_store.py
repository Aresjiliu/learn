"""Smoke test the repeatable dictionary query benchmark."""

import csv
import gzip
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from bench_dictionary_store import benchmark, percentile_ms
from build_dictionary_index import build_index


class BenchmarkTests(unittest.TestCase):
    def test_nearest_rank_percentiles(self):
        self.assertEqual(percentile_ms([0.003, 0.001, 0.002], 50), 2.0)
        self.assertEqual(percentile_ms([0.003, 0.001, 0.002], 95), 3.0)

    def test_process_cold_and_warm_results_are_reported(self):
        generated = ROOT / 'data' / 'generated'
        generated.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=generated) as directory:
            root = Path(directory)
            words = root / 'words.csv.gz'
            forms = root / 'forms.csv.gz'
            index = root / 'dictionary.sqlite'
            with gzip.open(words, 'wt', encoding='utf-8-sig', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['id', 'word', 'XJSY', 'sound', 'word_character_zh'])
                writer.writeheader()
                writer.writerow({'id': '1', 'word': 'ёлка', 'XJSY': '[{"cy":"圣诞树"}]'})
            with gzip.open(forms, 'wt', encoding='utf-8-sig', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['id', 'change_form', 'prototype'])
                writer.writeheader()
            build_index(words, index, forms)
            result = benchmark(index, ['ёлка'], warm_repeats=3, cold_repeats=3)
            self.assertEqual(result['schemaVersion'], '4')
            self.assertEqual(len(result['sourceSha256']), 64)
            self.assertEqual(result['queries'][0]['total'], 1)
            self.assertGreater(result['queries'][0]['processColdP95Ms'], 0)
            self.assertGreater(result['queries'][0]['warmP50Ms'], 0)


if __name__ == '__main__':
    unittest.main()
