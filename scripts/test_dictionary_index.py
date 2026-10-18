"""Regression tests for the offline, read-only dictionary index builder."""

import csv
import gzip
import sqlite3
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

    def test_duplicate_legacy_ids_remain_distinct(self):
        GENERATED.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=GENERATED) as directory:
            source = Path(directory) / 'dictionary.csv.gz'
            output = Path(directory) / 'dictionary.sqlite'
            self.write_source(source, [
                {'id': '17', 'word': 'ёлка', 'XJSY': '[{"cy":"圣诞树"}]'},
                {'id': '17', 'word': 'ель', 'XJSY': '[{"cy":"云杉"}]'},
            ])
            report = build_index(source, output)
            self.assertEqual(report['rows'], 2)
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
                build_index(source, output)
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
                build_index(source, output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
