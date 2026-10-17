import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from serve_content_api import rank_dictionary_results


class DictionaryRankingTests(unittest.TestCase):
    def test_exact_before_prefix_and_substring(self):
        words = [
            {'word': 'бесприветный', 'word_meaning_all': '冷漠'},
            {'word': 'приветствие', 'word_meaning_all': '问候'},
            {'word': 'привет', 'word_meaning_all': '你好'},
        ]
        self.assertEqual([item['word'] for item in rank_dictionary_results(words, 'привет')],
                         ['привет', 'приветствие', 'бесприветный'])

    def test_chinese_meaning_and_yo_normalization(self):
        words = [{'word': 'ёлка', 'word_meaning_all': '圣诞树'},
                 {'word': 'ёлочки', 'word_meaning_all': '小圣诞树'}]
        self.assertEqual(rank_dictionary_results(words, 'елка')[0]['word'], 'ёлка')
        self.assertEqual(len(rank_dictionary_results(words, '圣诞树')), 2)


if __name__ == '__main__':
    unittest.main()
