"""Check the read-only local content API contract."""

import json
import os
import urllib.parse
import urllib.request


BASE = os.environ.get('CONTENT_API_BASE', 'http://127.0.0.1:18091').rstrip('/')
PAPER = '50cda4cb21244f00b72f3c31ec3b7020'
FILLIN_PAPER = '112df13e3990437b8cd021c79fc18b3c'


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=5) as response:
        return response.status, json.loads(response.read().decode('utf-8'))


def main():
    health_status, health = get('/health')
    manifest_status, manifest = get('/api/v1/content/manifest')
    categories_status, categories = get('/api/v1/categories')
    books_status, books = get('/api/v1/books?page=1&page_size=20')
    category_books_status, category_books = get('/api/v1/books?category_id=3&page=1&page_size=20')
    query = urllib.parse.quote('агент')
    dictionary_status, dictionary = get(f'/api/v1/dictionary/search?q={query}')
    dictionary_page_status, dictionary_page = get(f'/api/v1/dictionary/search?q={query}&page=2&page_size=5')
    dictionary_detail_status, dictionary_detail = get('/api/v1/dictionary/219938')
    exam_status, exam = get(f'/api/v1/exams/{PAPER}')
    fillin_status, fillin = get(f'/api/v1/exams/{FILLIN_PAPER}')
    exam_audio_count = sum(1 for question in exam['data']['questions'] if question.get('audioUrl') or question.get('audio_url'))
    papers_status, papers = get('/api/v1/exams?page=1&page_size=20')
    book_status, book = get('/api/v1/books/1')
    words_status, words = get('/api/v1/books/1/words')
    word_rows = words['data']['words']
    word_forms = words['data'].get('wordForms', {})
    mapped_words = [word for word in word_rows if word.get('dictionary')]
    word_form_mapped = [word for word in mapped_words if word['dictionary'].get('matchTier') == 'wordForm']
    result = {
        'health': health,
        'manifest': {'status': manifest_status, 'version': manifest['data']['contentVersion']},
        'categories': {'status': categories_status, 'count': len(categories['data']['categories'])},
        'books': {'status': books_status, 'count': len(books['data']['books'])},
        'booksByCategory': {'status': category_books_status, 'count': len(category_books['data']['books'])},
        'dictionary': {'status': dictionary_status, 'count': len(dictionary['data']['words'])},
        'dictionaryPagination': {
            'status': dictionary_page_status,
            'count': len(dictionary_page['data']['words']),
            'page': dictionary_page['meta'].get('page'),
            'pageSize': dictionary_page['meta'].get('page_size'),
            'total': dictionary_page['meta'].get('total'),
        },
        'dictionaryDetail': {
            'status': dictionary_detail_status,
            'word': dictionary_detail['data']['word']['word'],
        },
        'exam': {
            'status': exam_status,
            'count': len(exam['data']['questions']),
            'audioCount': exam_audio_count,
        },
        'fillinExam': {
            'status': fillin_status,
            'count': len(fillin['data']['questions']),
            'textCount': sum(1 for question in fillin['data']['questions'] if not any(question.get(f'{key}_item') for key in ('a', 'b', 'c', 'd', 'e'))),
        },
        'examPapers': {
            'status': papers_status,
            'count': len(papers['data']['papers']),
            'total': papers['meta'].get('total'),
        },
        'bookDetail': {'status': book_status, 'name': book['data']['book']['name']},
        'bookWords': {
            'status': words_status,
            'count': len(word_rows),
            'dictionaryMapped': len(mapped_words),
            'wordFormMapped': len(word_form_mapped),
            'pending': len(word_rows) - len(mapped_words),
            'wordFormIndexSize': len(word_forms),
        },
    }
    result['status'] = 'pass' if (
        health_status == 200
        and health.get('status') == 'ok'
        and manifest_status == 200
        and manifest['data']['contentVersion'] == 'phase1-local-20261014-media-v2'
        and 'book-words' in manifest['data']['capabilities']
        and categories_status == 200
        and len(categories['data']['categories']) == 2
        and books_status == 200
        and books['data']['books']
        and category_books_status == 200
        and len(category_books['data']['books']) == 1
        and dictionary_status == 200
        and dictionary['data']['words']
        and dictionary_page_status == 200
        and len(dictionary_page['data']['words']) == 5
        and dictionary_page['meta']['page'] == 2
        and dictionary_page['meta']['page_size'] == 5
        and dictionary_page['meta']['total'] >= 10
        and dictionary_detail_status == 200
        and dictionary_detail['data']['word']['sourceId'] == '219938'
        and dictionary_detail['data']['word']['word'] == 'агент'
        and exam_status == 200
        and len(exam['data']['questions']) == 8
        and exam_audio_count == 8
        and fillin_status == 200
        and len(fillin['data']['questions']) == 8
        and all(not any(question.get(f'{key}_item') for key in ('a', 'b', 'c', 'd', 'e')) for question in fillin['data']['questions'])
        and papers_status == 200
        and len(papers['data']['papers']) == 2
        and papers['data']['papers'][0]['practiceReady'] is True
        and book_status == 200
        and book['data']['book']['lessons']
        and book['data']['book']['lessons'][0]['videos'][0]['url'].endswith('/video/video1.mp4')
        and book['data']['book']['lessons'][1]['videos'][-1]['url'].endswith('/video/video6.mp4')
        and book['data']['book']['lessons'][1]['videos'][0]['isPreview'] is False
        and book['data']['book']['cover_url'] == '/images/courses/course1.png'
        and words_status == 200
        and words['data']['words']
        and isinstance(word_forms, dict)
        and word_forms
    ) else 'needs-review'
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['status'] == 'pass' else 1)


if __name__ == '__main__':
    main()
