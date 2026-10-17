"""Read-only local mock for the phase-1 content API contract."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


BOOKS = read_json('data/content_samples/books.json')['books']
BOOK_WORDS = {
    book['id']: read_json(f"data/content_samples/book_{book['id']}_words.json")['words']
    for book in BOOKS
    if (ROOT / f"data/content_samples/book_{book['id']}_words.json").exists()
}
DICTIONARY_SAMPLE = read_json('data/content_samples/dictionary_words.json')['words']
EXAM = read_json('data/content_samples/exam_practice_sample.json')
FILLIN_EXAM = read_json('data/content_samples/exam_fillin_sample.json')
EXAM_PAPERS = read_json('data/content_samples/exam_papers.json')['papers']
EXAMS = {EXAM['paperId']: EXAM, FILLIN_EXAM['paperId']: FILLIN_EXAM}


def normalize_word(value):
    text = unicodedata.normalize('NFD', str(value or '').strip().lower())
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    return text.replace('ё', 'е')


def extract_meaning(value):
    try:
        items = json.loads(value or '[]')
        if isinstance(items, dict):
            items = [items]
        if not isinstance(items, list):
            return ''
        return '\n'.join(
            str(item.get('cy', '')).strip()
            for item in items
            if isinstance(item, dict) and item.get('cy')
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return ''


def read_main_dictionary():
    path = ROOT / 'data/remote_7500km/ey_data__x_7500km_russian_index_new_test.csv.gz'
    result = {}
    with gzip.open(path, 'rt', encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            word = row.get('word', '').strip()
            if not word:
                continue
            result.setdefault(normalize_word(word), {
                'sourceId': row.get('id', ''),
                'word': word,
                'word_meaning_all': extract_meaning(row.get('XJSY', '')),
                'word_character': row.get('word_character_zh', ''),
                'audio_url': row.get('sound', ''),
                'matchTier': 'exact',
            })
    return result

MAIN_DICTIONARY = read_main_dictionary()
DICTIONARY = list(MAIN_DICTIONARY.values()) or DICTIONARY_SAMPLE


def rank_dictionary_results(words, query):
    keyword = normalize_word(query)
    meaning_keyword = str(query or '').strip().lower()
    if not keyword:
        return []
    exact, prefix, substring, meaning = [], [], [], []
    for word in words:
        term = normalize_word(word.get('word', ''))
        if term == keyword:
            exact.append(word)
        elif term.startswith(keyword):
            prefix.append(word)
        elif keyword in term:
            substring.append(word)
        elif meaning_keyword in word.get('word_meaning_all', '').lower():
            meaning.append(word)
    return exact + prefix + substring + meaning


WORD_FORMS = read_json('data/content_samples/book_word_forms.json').get('byWord', {})


def enrich_book_words(words):
    enriched = []
    for word in words:
        item = dict(word)
        dictionary = MAIN_DICTIONARY.get(normalize_word(item.get('word', '')))
        candidates = WORD_FORMS.get(normalize_word(item.get('word', '')), [])
        if not dictionary and len(candidates) == 1:
            prototype = normalize_word(candidates[0].get('prototype', ''))
            dictionary = MAIN_DICTIONARY.get(prototype)
            if dictionary:
                dictionary = dict(dictionary)
                dictionary['matchTier'] = 'wordForm'
                dictionary['prototype'] = candidates[0].get('prototype', '')
        if dictionary:
            item['dictionary'] = dictionary
        enriched.append(item)
    return enriched


class ContentHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        query = parse_qs(parsed.query)

        if path == '/health':
            self.respond({'status': 'ok', 'service': 'local-content-api'})
            return
        if path == '/api/v1/content/manifest':
            self.respond({'data': {
                    'contentVersion': 'phase1-local-20261014-media-v2',
                'source': 'local-sample',
                'capabilities': ['categories', 'books', 'book-words', 'dictionary', 'exams', 'test-media'],
            }, 'meta': {'source': 'local-sample'}})
            return
        if path == '/api/v1/categories':
            category_ids = sorted({str(book.get('book_type', '')).strip() for book in BOOKS if str(book.get('book_type', '')).strip()})
            self.respond({'data': {'categories': [
                {'id': category_id, 'name': f'教材分类 {category_id}', 'icon': '/images/category/all.png'}
                for category_id in category_ids
            ]}, 'meta': {'source': 'local-sample'}})
            return
        if path == '/api/v1/books':
            keyword = (query.get('q') or [''])[0].strip().lower()
            category_id = (query.get('category_id') or [''])[0].strip()
            books = [book for book in BOOKS if (
                (not keyword or keyword in book.get('book_name', '').lower())
                and (not category_id or any(str(book.get(key, '')).strip() == category_id for key in ('category_id', 'book_category_id', 'book_type')))
            )]
            page = max(1, int((query.get('page') or ['1'])[0] or 1))
            page_size = min(100, max(1, int((query.get('page_size') or ['20'])[0] or 20)))
            start = (page - 1) * page_size
            self.respond({'data': {'books': [self.book_model(book) for book in books[start:start + page_size]]}, 'meta': {
                'source': 'local-sample', 'page': page, 'page_size': page_size, 'total': len(books)
            }})
            return
        if path.startswith('/api/v1/books/'):
            parts = path.split('/')
            book_id = parts[4] if len(parts) > 4 else ''
            book = next((item for item in BOOKS if item.get('id') == book_id), None)
            if not book:
                self.respond({'error': {'code': 'CONTENT_NOT_FOUND', 'message': '教材不存在'}}, status=404)
                return
            if len(parts) == 6 and parts[5] == 'words':
                self.respond({'data': {
                    'words': enrich_book_words(BOOK_WORDS.get(book_id, [])),
                    'wordForms': WORD_FORMS,
                }, 'meta': {'source': 'local-sample', 'dictionary': 'local-export-index'}})
            else:
                self.respond({'data': {'book': self.book_model(book)}, 'meta': {'source': 'local-sample'}})
            return
        if path == '/api/v1/dictionary/search':
            keyword = (query.get('q') or [''])[0].strip().lower()
            page = max(1, int((query.get('page') or ['1'])[0] or 1))
            page_size = min(100, max(1, int((query.get('page_size') or ['20'])[0] or 20)))
            matched = rank_dictionary_results(DICTIONARY, keyword)
            start = (page - 1) * page_size
            words = matched[start:start + page_size]
            self.respond({'data': {'words': words}, 'meta': {
                'source': 'local-export-index',
                'page': page,
                'page_size': page_size,
                'total': len(matched),
            }})
            return
        if path == '/api/v1/exams':
            page = max(1, int((query.get('page') or ['1'])[0] or 1))
            page_size = min(100, max(1, int((query.get('page_size') or ['20'])[0] or 20)))
            start = (page - 1) * page_size
            papers = EXAM_PAPERS[start:start + page_size]
            self.respond({'data': {'papers': papers}, 'meta': {
                'source': 'local-sample', 'page': page, 'page_size': page_size, 'total': len(EXAM_PAPERS)
            }})
            return
        if path.startswith('/api/v1/dictionary/'):
            word_id = unquote(path[len('/api/v1/dictionary/'):])
            word = next((item for item in DICTIONARY if str(item.get('sourceId')) == word_id or item.get('word') == word_id), None)
            if word:
                self.respond({'data': {'word': word}, 'meta': {'source': 'local-export-index'}})
            else:
                self.respond({'error': {'code': 'CONTENT_NOT_FOUND', 'message': '词条不存在'}, 'meta': {'source': 'local-sample'}}, status=404)
            return
        prefix = '/api/v1/exams/'
        if path.startswith(prefix):
            paper_id = unquote(path[len(prefix):])
            if paper_id in EXAMS:
                self.respond({'data': {'questions': EXAMS[paper_id]['questions']}, 'meta': {'source': 'local-sample'}})
            else:
                self.respond({'error': {'code': 'CONTENT_NOT_FOUND', 'message': '试卷不存在'}, 'meta': {'source': 'local-sample'}}, status=404)
            return
        self.respond({'error': {'code': 'NOT_FOUND', 'message': '路径不存在'}}, status=404)

    @staticmethod
    def book_model(book):
        sample_videos = [{
            'id': f"local-video-{book.get('id')}-{number}",
            'title': f'测试视频：第{number}节',
            'url': f'http://127.0.0.1:18090/video/video{number}.mp4',
            'isPreview': number <= 3,
            'duration': 0,
            'durationText': '--:--',
        } for number in range(1, 7)]
        return {
            'id': book.get('id'),
            'name': book.get('book_name', ''),
            # 本地联调不能访问生产相对路径；使用项目内测试封面保持页面可渲染。
            'cover_url': '/images/courses/course1.png',
            'word_count': int(book.get('wordNum') or 0),
            'price': book.get('member_price') or book.get('price') or '0.00',
            'original_price': book.get('price') or book.get('member_price') or '0.00',
            'students_count': 0,
            'lessons': [{
                'id': f"local-lesson-{book.get('id')}-1",
                'title': '第一单元（本地试听）',
                'videos': sample_videos[:3],
            }, {
                'id': f"local-lesson-{book.get('id')}-2",
                'title': '第二单元（本地权限样本）',
                'videos': sample_videos[3:],
            }],
            'source': 'local-sample',
        }

    def respond(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f'{self.address_string()} - {format % args}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=18091)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), ContentHandler)
    print(f'Serving local content API on http://{args.host}:{args.port}/')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('Stopping content API')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
