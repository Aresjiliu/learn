"""Create a tiny dictionary fixture for local vocabulary mapping UI tests."""

import csv
import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOOK = ROOT / 'data/content_samples/book_1_words.json'
SOURCE = ROOT / 'data/remote_7500km/ey_data__x_7500km_russian_index_new_test.csv.gz'
TARGET = ROOT / 'data/content_samples/dictionary_words.json'


def main():
    book_words = json.loads(BOOK.read_text(encoding='utf-8'))['words'][:8]
    wanted = {item['word'].strip().lower() for item in book_words}
    records = []
    with gzip.open(SOURCE, 'rt', encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            word = (row.get('word') or row.get('word_text') or '').strip()
            if word.lower() in wanted:
                records.append({
                    'sourceId': row.get('id', ''),
                    'word': word,
                    'word_meaning_all': row.get('word_meaning_all') or row.get('meaning') or '',
                    'word_character': row.get('word_character') or row.get('part_of_speech') or '',
                    'source': 'x_7500km_russian_index_new_test',
                })
                if len(records) == len(wanted):
                    break

    TARGET.write_text(json.dumps({
        'source': 'data/remote_7500km/ey_data__x_7500km_russian_index_new_test.csv.gz',
        'words': records,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'written={TARGET}; matched={len(records)}; requested={len(wanted)}')


if __name__ == '__main__':
    main()
