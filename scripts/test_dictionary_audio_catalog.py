"""Development-only catalog and bounded file verification contracts."""

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from content_server.audio_catalog import AudioCatalog
from build_development_audio_catalog import compile_catalog

ENTRY = 'dict:1:' + 'a' * 16
FILENAME = 'a' * 32 + '.mp3'
DATA = (b'\xff\xfb\x94\xc4' + b'\x00' * 380) * 2


class AudioCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'data' / 'generated')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.index = self.root / 'index.sqlite'
        self.index.write_bytes(b'owned snapshot fixture')
        self.audio = self.root / 'audio'
        self.audio.mkdir()
        (self.audio / FILENAME).write_bytes(DATA)
        self.report = {'schemaVersion': 1, 'publicationReady': False,
                       'verification': 'mp3-structure-only',
                       'sources': {'dictionarySha256': hashlib.sha256(self.index.read_bytes()).hexdigest(),
                                   'textbookSha256': 'b' * 64},
                       'candidates': [{'entryId': ENTRY, 'word': 'привет', 'textbookIds': ['10'],
                                       'source': 'textbook-strict-word', 'filename': FILENAME,
                                       'bytes': len(DATA), 'sha256': hashlib.sha256(DATA).hexdigest()}]}
        self.manifest = self.root / 'catalog.json'

    def write_catalog(self, decode=None):
        decode = decode or (lambda data: {'frames': 22050, 'sampleRate': 44100, 'channels': 1,
                                         'durationSeconds': 0.5, 'decoder': 'fixture-decoder'})
        catalog = compile_catalog(self.report, self.index, self.audio, decode=decode)
        self.manifest.write_text(json.dumps(catalog), encoding='utf-8')
        return catalog

    def load_catalog(self, **kwargs):
        catalog = AudioCatalog(self.manifest, self.index, self.audio,
                               kwargs.pop('base_url', 'http://127.0.0.1:18092'),
                               development_enabled=kwargs.pop('development_enabled', True), **kwargs)
        self.addCleanup(catalog.close)
        return catalog

    def test_compile_and_serve_keeps_provenance_and_requires_development_mode(self):
        compiled = self.write_catalog()
        self.assertEqual(compiled['entries'][0]['textbookIds'], ['10'])
        self.assertFalse(compiled['publicationReady'])
        with self.assertRaises(ValueError):
            self.load_catalog(development_enabled=False)
        for base in ('http://example.com', 'http://user:pass@127.0.0.1', 'http://127.0.0.1?x=1',
                     'http://127.0.0.1:invalid', 'http://127.0.0.1:0'):
            with self.subTest(base=base), self.assertRaises(ValueError):
                self.load_catalog(base_url=base)
        catalog = self.load_catalog()
        word = catalog.decorate({'id': ENTRY, 'word': 'привет', 'audio_url': ''})
        self.assertTrue(word['audio_url'].endswith('/' + FILENAME))
        self.assertTrue(word['audioDevelopmentOnly'])
        self.assertEqual(word['audioSource'], 'textbook')
        self.assertEqual(catalog.read_file(FILENAME), DATA)
        self.assertEqual(catalog.decorate({'id': ENTRY, 'word': 'wrong'})['audio_url'], '')
        self.assertEqual(catalog.decorate({'id': 'unknown', 'word': 'привет'})['audio_url'], '')

    def test_unverified_report_index_mismatch_and_unsafe_manifest_are_rejected(self):
        self.write_catalog()
        self.index.write_bytes(b'other snapshot')
        with self.assertRaises(ValueError):
            self.load_catalog()
        with self.assertRaises(ValueError):
            compile_catalog(self.report, self.index, self.audio, decode=lambda data: {})
        self.index.write_bytes(b'owned snapshot fixture')
        self.manifest.write_text(json.dumps(self.report), encoding='utf-8')
        with self.assertRaises(ValueError):
            self.load_catalog()
        compiled = self.write_catalog()
        compiled['entries'][0]['filename'] = '../escape.mp3'
        self.manifest.write_text(json.dumps(compiled), encoding='utf-8')
        with self.assertRaises(ValueError):
            self.load_catalog()

    def test_changed_missing_and_unlisted_files_never_get_playable_urls(self):
        self.write_catalog()
        catalog = self.load_catalog()
        target = self.audio / FILENAME
        target.write_bytes(b'changed')
        self.assertIsNone(catalog.read_file(FILENAME))
        self.assertEqual(catalog.decorate({'id': ENTRY, 'word': 'привет'})['audio_url'], '')
        target.unlink()
        self.assertIsNone(catalog.read_file(FILENAME))
        self.assertIsNone(catalog.read_file('../index.sqlite'))
        self.assertIsNone(catalog.read_file('b' * 32 + '.mp3'))

    def test_decoder_failure_or_bad_candidate_cannot_be_compiled(self):
        def fail(data):
            raise ValueError('decode failed')
        self.assertEqual(self.write_catalog(decode=fail)['entries'], [])
        self.report['candidates'][0]['sha256'] = 'c' * 64
        self.assertEqual(self.write_catalog()['entries'], [])

    def test_invalid_shared_decode_result_is_not_reused_as_valid(self):
        self.report['candidates'].append({**self.report['candidates'][0], 'entryId': 'dict:2:' + 'b' * 16})
        self.assertEqual(self.write_catalog(decode=lambda data: {})['entries'], [])

    def test_running_catalog_keeps_its_verified_private_batch_when_source_changes(self):
        self.write_catalog()
        catalog = self.load_catalog()
        self.index.write_bytes(b'updated snapshot')
        self.assertEqual(catalog.index_path.read_bytes(), b'owned snapshot fixture')
        self.assertEqual(catalog.read_file(FILENAME), DATA)

    def test_missing_textbook_source_hash_cannot_claim_provenance(self):
        self.report['sources'].pop('textbookSha256')
        with self.assertRaises(ValueError):
            self.write_catalog()

    def test_same_size_source_edit_with_restored_mtime_cannot_change_private_batch(self):
        import os
        self.write_catalog()
        catalog = self.load_catalog()
        original_stat = self.index.stat()
        changed = bytearray(self.index.read_bytes())
        changed[-1] ^= 1
        self.index.write_bytes(changed)
        os.utime(self.index, ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))
        self.assertNotEqual(self.index.read_bytes(), catalog.index_path.read_bytes())
        self.assertEqual(catalog.index_path.read_bytes(), b'owned snapshot fixture')
        self.assertEqual(catalog.read_file(FILENAME), DATA)

    def test_source_changed_during_media_read_does_not_mix_batches(self):
        from unittest.mock import patch
        from content_server.audio_catalog import read_verified_file
        self.write_catalog()
        catalog = self.load_catalog()
        def read_then_replace(root, entry):
            data = read_verified_file(root, entry)
            self.index.write_bytes(b'changed during media read')
            return data
        with patch('content_server.audio_catalog.read_verified_file', read_then_replace):
            self.assertEqual(catalog.read_file(FILENAME), DATA)
        self.assertEqual(catalog.index_path.read_bytes(), b'owned snapshot fixture')

    def test_close_cleans_private_snapshot_without_removing_original(self):
        self.write_catalog()
        catalog = self.load_catalog()
        private = catalog.index_path
        self.assertTrue(private.is_file())
        self.assertNotEqual(private, self.index)
        catalog.close()
        self.assertFalse(private.parent.exists())
        self.assertEqual(self.index.read_bytes(), b'owned snapshot fixture')
        self.assertIsNone(catalog.read_file(FILENAME))


if __name__ == '__main__':
    unittest.main()
