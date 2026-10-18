"""Regression tests for the offline, read-only dictionary index builder."""

import csv
import gzip
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dictionary_index import build_index, stable_entry_id, normalize_word


FIELDS = ['id', 'word', 'sound', 'word_character_zh', 'XJSY']
GENERATED = Path(__file__).resolve().parents[1] / 'data' / 'generated'


class DictionaryIndexTests(unittest.TestCase):
    def write_source(self, path, rows):
        with gzip.open(path, 'wt', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    def build_with_forms(self, source, output):
        forms = source.with_name('forms.csv.gz')
        with gzip.open(forms, 'wt', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['id', 'change_form', 'prototype'])
            writer.writeheader()
            writer.writerow({'id': '1', 'change_form': 'ёлки', 'prototype': 'ёлка'})
        return build_index(source, output, forms)

    def test_duplicate_legacy_ids_remain_distinct(self):
        GENERATED.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=GENERATED) as directory:
            source = Path(directory) / 'dictionary.csv.gz'
            output = Path(directory) / 'dictionary.sqlite'
            self.write_source(source, [
                {'id': '17', 'word': 'ёлка', 'XJSY': '[{"cy":"圣诞树"}]'},
                {'id': '17', 'word': 'ель', 'XJSY': '[{"cy":"云杉"}]'},
            ])
            report = self.build_with_forms(source, output)
            self.assertEqual(report['rows'], 2)
            self.assertGreater(report['build_seconds'], 0)
            self.assertEqual(report['duplicate_source_ids'], 1)
            with closing(sqlite3.connect(output)) as connection:
                rows = connection.execute('SELECT id, source_id, word, normalized_word, meaning FROM entries ORDER BY word').fetchall()
                self.assertEqual(len(set(row[0] for row in rows)), 2)
                self.assertEqual({row[1] for row in rows}, {'17'})
                self.assertEqual({row[3] for row in rows}, {'елка', 'ель'})
                self.assertEqual({row[4] for row in rows}, {'圣诞树', '云杉'})

    def test_same_composite_key_fails_without_replacing_existing_index(self):
        GENERATED.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=GENERATED) as directory:
            source = Path(directory) / 'dictionary.csv.gz'
            output = Path(directory) / 'dictionary.sqlite'
            output.write_bytes(b'previous-index')
            self.write_source(source, [
                {'id': '17', 'word': 'ёлка', 'XJSY': '[{"cy":"圣诞树"}]'},
                {'id': '17', 'word': 'ёлка', 'XJSY': '[{"cy":"不同释义"}]'},
            ])
            with self.assertRaisesRegex(ValueError, '重复词条键'):
                self.build_with_forms(source, output)
            self.assertEqual(output.read_bytes(), b'previous-index')

    def test_key_is_stable_and_yo_search_is_relaxed(self):
        self.assertEqual(stable_entry_id('17', 'ёлка'), stable_entry_id('17', 'ёлка'))
        self.assertNotEqual(stable_entry_id('17', 'ёлка'), stable_entry_id('17', 'ель'))
        self.assertEqual(normalize_word(' ЁЛКА́ '), 'елка')
        self.assertEqual(normalize_word(' МАЙ '), 'май')
        self.assertNotEqual(normalize_word('май'), normalize_word('маи'))

    def test_missing_word_is_rejected(self):
        GENERATED.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=GENERATED) as directory:
            source = Path(directory) / 'dictionary.csv.gz'
            output = Path(directory) / 'dictionary.sqlite'
            self.write_source(source, [{'id': '17', 'word': ''}])
            with self.assertRaisesRegex(ValueError, '词条缺少'):
                self.build_with_forms(source, output)
            self.assertFalse(output.exists())

    def test_cli_refuses_snapshot_without_forms_source(self):
        GENERATED.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=GENERATED) as directory:
            source = Path(directory) / 'dictionary.csv.gz'
            output = Path(directory) / 'dictionary.sqlite'
            self.write_source(source, [{'id': '17', 'word': 'ёлка'}])
            result = subprocess.run([
                sys.executable, '-B', str(Path(__file__).with_name('build_dictionary_index.py')),
                '--source', str(source), '--output', str(output)
            ], capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('--forms-source', result.stderr)
            self.assertFalse(output.exists())

    def test_empty_export_cannot_replace_existing_snapshot(self):
        GENERATED.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=GENERATED) as directory:
            source = Path(directory) / 'words.csv.gz'
            output = Path(directory) / 'dictionary.sqlite'
            output.write_bytes(b'previous-index')
            self.write_source(source, [])
            with self.assertRaisesRegex(ValueError, '空'):
                self.build_with_forms(source, output)
            self.assertEqual(output.read_bytes(), b'previous-index')

    def test_output_cannot_replace_input_export(self):
        GENERATED.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=GENERATED) as directory:
            source = Path(directory) / 'words.csv.gz'
            self.write_source(source, [{'id': '1', 'word': 'ёлка'}])
            previous = source.read_bytes()
            with self.assertRaisesRegex(ValueError, '源文件'):
                self.build_with_forms(source, source)
            self.assertEqual(source.read_bytes(), previous)


if __name__ == '__main__':
    unittest.main()
