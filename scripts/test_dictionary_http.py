"""HTTP contract tests for the independent read-only dictionary service."""

import csv
import gzip
import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from content_server.app import app_from_env, create_app
from scripts.build_dictionary_index import build_index


class DictionaryHttpTests(unittest.TestCase):
    def setUp(self):
        generated = ROOT / 'data' / 'generated'
        generated.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=generated)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        words, forms = self.root / 'words.csv.gz', self.root / 'forms.csv.gz'
        with gzip.open(words, 'wt', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['id', 'word', 'XJSY', 'sound', 'word_character_zh'])
            writer.writeheader()
            for source_id, word in [('17', 'все'), ('17', 'всё'), ('1', 'привет')]:
                writer.writerow({'id': source_id, 'word': word, 'XJSY': '[{"cy":"问候"}]', 'sound': 'a' * 32})
        with gzip.open(forms, 'wt', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['id', 'change_form', 'prototype'])
            writer.writeheader()
            writer.writerow({'id': '1', 'change_form': 'приветы', 'prototype': 'привет'})
        self.index = self.root / 'dictionary.sqlite'
        build_index(words, self.index, forms)
        self.client = self.enterContext(TestClient(create_app(self.index)))

    def test_health_search_detail_and_manifest_share_version(self):
        before = hashlib.sha256(self.index.read_bytes()).hexdigest()
        health = self.client.get('/health')
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()['schemaVersion'], '4')
        result = self.client.get('/api/v1/dictionary/search', params={'q': 'все', 'page_size': 1})
        self.assertEqual(result.status_code, 200)
        payload = result.json()
        self.assertEqual(payload['meta']['total'], 2)
        self.assertEqual(payload['meta']['source'], 'dictionary-index')
        word = payload['data']['words'][0]
        self.assertTrue(word['id'].startswith('dict:17:'))
        self.assertEqual(word['audio_url'], '')
        detail = self.client.get('/api/v1/dictionary/' + quote(word['id'], safe=''))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['data']['word']['id'], word['id'])
        manifest = self.client.get('/api/v1/content/manifest').json()
        self.assertEqual(manifest['data']['contentVersion'], health.json()['contentVersion'])
        self.assertEqual(payload['meta']['contentVersion'], health.json()['contentVersion'])
        self.assertEqual(hashlib.sha256(self.index.read_bytes()).hexdigest(), before)

    def test_invalid_inputs_missing_and_ambiguous_ids(self):
        for params in ({'q': ''}, {'q': '\u0301'}, {'q': 'а' * 65}, {'q': '%'},
                       {'q': 'привет', 'page': 0}, {'q': 'привет', 'page_size': 101},
                       {'q': 'привет', 'page': 'not-an-integer'}):
            with self.subTest(params=params):
                response = self.client.get('/api/v1/dictionary/search', params=params)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['error']['code'], 'INVALID_ARGUMENT')
        self.assertEqual(self.client.get('/api/v1/dictionary/17').status_code, 409)
        self.assertEqual(self.client.get('/api/v1/dictionary/unknown').status_code, 404)
        self.assertEqual(self.client.post('/api/v1/dictionary/search').status_code, 405)

    def test_missing_corrupt_and_old_snapshot_are_unready_without_path_leak(self):
        bad = self.root / 'bad.sqlite'
        bad.write_bytes(b'not a database')
        for path in (self.root / 'missing.sqlite', bad):
            with TestClient(create_app(path)) as client:
                for url in ('/health', '/api/v1/dictionary/search?q=привет'):
                    response = client.get(url)
                    self.assertEqual(response.status_code, 503)
                    self.assertEqual(response.json()['error']['code'], 'CONTENT_UNAVAILABLE')
                    self.assertNotIn(str(self.root), response.text)
        from contextlib import closing
        import sqlite3
        with closing(sqlite3.connect(self.index)) as connection, connection:
            connection.execute("UPDATE metadata SET value='3' WHERE key='schema_version'")
        self.assertEqual(self.client.get('/health').status_code, 503)

    def test_startup_requires_explicit_index_path(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'DICTIONARY_INDEX_PATH'):
                app_from_env()


if __name__ == '__main__':
    unittest.main()
