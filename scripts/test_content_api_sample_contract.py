"""Validate the local content API sample exposes the vocabulary index contract."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.serve_content_api import BOOK_WORDS, WORD_FORMS, ContentHandler, enrich_book_words


assert BOOK_WORDS, "book word samples must be available"
assert WORD_FORMS, "word form index must be available"
first_book_id = next(iter(BOOK_WORDS))
enriched = enrich_book_words(BOOK_WORDS[first_book_id][:20])
assert isinstance(enriched, list)
assert all(isinstance(item, dict) for item in enriched)
book = ContentHandler.book_model({'id': 'sample', 'book_name': '测试教材', 'wordNum': '0', 'price': '0'})
assert len(book['lessons']) == 2
assert sum(len(lesson['videos']) for lesson in book['lessons']) == 6
assert book['lessons'][0]['videos'][0]['url'].endswith('/video/video1.mp4')
assert book['lessons'][1]['videos'][-1]['url'].endswith('/video/video6.mp4')
assert book['lessons'][1]['videos'][0]['isPreview'] is False
print(f"content API sample contract: PASS (books={len(BOOK_WORDS)}, wordForms={len(WORD_FORMS)})")
