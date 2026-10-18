"""Contract tests for ranked, read-only Russian/Chinese dictionary lookup."""

import csv
import gzip
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))
from build_dictionary_index import build_index, stable_entry_id
from content_server.dictionary_store import AmbiguousLegacyId, DictionaryStore


class DictionaryStoreTests(unittest.TestCase):
    def setUp(self):
        generated = ROOT / 'data' / 'generated'
        generated.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=generated)
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        dictionary = root / 'words.csv.gz'
        forms = root / 'forms.csv.gz'
        with gzip.open(dictionary, 'wt', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['id', 'word', 'XJSY', 'word_character_zh', 'sound'])
            writer.writeheader()
            for source_id, word, meaning in [
                ('17', 'ёлка', '圣诞树'), ('17', 'ель', '云杉'),
                ('2', 'ёлочки', '小圣诞树'), ('3', 'привет', '你好'),
                ('4', 'приветствие', '问候'), ('5', 'бесприветный', '不友好'),
                ('6', 'машина', '汽车'), ('7', 'автомобиль', '汽车'),
                ('8', 'идти', '走'), ('9', 'пойти', '去'),
                ('10', 'все', '所有人'), ('11', 'всё', '一切'),
                ('12', 'книга', '学习课本')
            ]:
                writer.writerow({'id': source_id, 'word': word,
                                 'XJSY': '[{"cy":"' + meaning + '"}]'})
        with gzip.open(forms, 'wt', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['id', 'change_form', 'prototype'])
            writer.writeheader()
            writer.writerows([
                {'id': '101', 'change_form': 'ёлки', 'prototype': 'ёлка'},
                {'id': '102', 'change_form': 'пойду', 'prototype': 'идти'},
                {'id': '103', 'change_form': 'пойду', 'prototype': 'пойти'},
                {'id': '104', 'change_form': 'ищу', 'prototype': 'идти'},
                {'id': '105', 'change_form': 'ищу', 'prototype': 'несуществующий'},
                {'id': '106', 'change_form': 'всем', 'prototype': 'все'},
                {'id': '107', 'change_form': 'всем', 'prototype': 'всё'},
            ])
        self.index = root / 'dictionary.sqlite'
        build_index(dictionary, self.index, forms_source=forms)
        self.store = DictionaryStore(self.index)

    def test_exact_prefix_then_substring_ranking(self):
        result = self.store.search('привет')
        self.assertEqual([item['word'] for item in result['words']],
                         ['привет', 'приветствие', 'бесприветный'])
        self.assertEqual([item['matchTier'] for item in result['words']],
                         ['exact', 'prefix', 'substring'])

    def test_yo_normalization_and_word_form_candidates(self):
        self.assertEqual(self.store.search('елка')['words'][0]['word'], 'ёлка')
        self.assertEqual(self.store.search('ёлки')['words'][0]['word'], 'ёлка')
        ambiguous = self.store.search('пойду')['words']
        self.assertEqual({item['word'] for item in ambiguous}, {'идти', 'пойти'})
        self.assertTrue(all(item['matchTier'] == 'wordForm' and item['ambiguous'] for item in ambiguous))

    def test_unavailable_second_prototype_still_marks_ambiguity(self):
        result = self.store.search('ищу')
        self.assertEqual([item['word'] for item in result['words']], ['идти'])
        self.assertTrue(result['words'][0]['ambiguous'])
        self.assertEqual(result['formCandidates'], ['идти', 'несуществующий'])

    def test_yo_distinct_prototypes_are_not_collapsed(self):
        result = self.store.search('всем')
        self.assertEqual({item['word'] for item in result['words']}, {'все', 'всё'})
        self.assertEqual(result['formCandidates'], ['все', 'всё'])
        self.assertTrue(all(item['ambiguous'] for item in result['words']))

    def test_original_yo_spelling_precedes_relaxed_match(self):
        self.assertEqual(self.store.search('всё')['words'][0]['word'], 'всё')
        self.assertEqual(self.store.search('все')['words'][0]['word'], 'все')

    def test_chinese_meaning_including_two_character_query(self):
        self.assertEqual([item['word'] for item in self.store.search('圣诞树')['words']],
                         ['ёлка', 'ёлочки'])
        self.assertEqual({item['word'] for item in self.store.search('汽车')['words']},
                         {'машина', 'автомобиль'})

    def test_one_character_chinese_and_short_russian_prefix(self):
        self.assertEqual([item['word'] for item in self.store.search('学')['words']], ['книга'])
        self.assertEqual([item['word'] for item in self.store.search('пр')['words']],
                         ['привет', 'приветствие'])
        self.assertNotIn('бесприветный', [item['word'] for item in self.store.search('п')['words']])

    def test_stable_pagination_and_duplicate_legacy_id(self):
        first = self.store.search('汽车', page=1, page_size=1)
        second = self.store.search('汽车', page=2, page_size=1)
        self.assertEqual(first['total'], 2)
        self.assertEqual(second['total'], 2)
        self.assertNotEqual(first['words'][0]['id'], second['words'][0]['id'])
        self.assertEqual(first['words'] + second['words'], self.store.search('汽车')['words'])
        with self.assertRaises(AmbiguousLegacyId):
            self.store.detail('17')
        self.assertEqual(self.store.detail(stable_entry_id('17', 'ель'))['word'], 'ель')
        self.assertIsNone(self.store.detail('missing'))

    def test_input_bounds_and_read_only_connection(self):
        with self.assertRaises(ValueError):
            self.store.search('')
        with self.assertRaises(ValueError):
            self.store.search('авто', page_size=101)
        with self.assertRaises(ValueError):
            self.store.search('авто', page=0)
        with self.assertRaises(ValueError):
            self.store.search('а' * 65)
        with self.assertRaises(ValueError):
            self.store.search('%')
        for query in ('\u0301', 'а\x00', 'а\nб'):
            with self.subTest(query=repr(query)), self.assertRaises(ValueError):
                self.store.search(query)
        with self.assertRaises(ValueError):
            self.store.search('авто', page=10 ** 100)
        with closing(self.store.connect()) as connection:
            with self.assertRaises(sqlite3.OperationalError):
                connection.execute('CREATE TABLE forbidden(value TEXT)')


if __name__ == '__main__':
    unittest.main()
