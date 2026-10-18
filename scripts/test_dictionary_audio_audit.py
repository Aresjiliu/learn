"""Offline evidence tests: pronunciation candidates are not publication approval."""

import csv
import gzip
import hashlib
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from audit_dictionary_audio import audit_audio, write_report

HASH = 'a' * 32
OTHER = 'b' * 32
FRAME = b'\xff\xfb\x94\xc4' + b'\x00' * 380


class DictionaryAudioAuditTests(unittest.TestCase):
    def setUp(self):
        generated = Path(__file__).resolve().parents[1] / 'data' / 'generated'
        generated.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=generated)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.export = self.root / 'words.csv.gz'
        self.index = self.root / 'dictionary.sqlite'
        self.cache = self.root / 'audio'
        self.cache.mkdir()
        (self.cache / (HASH + '.mp3')).write_bytes(FRAME * 2)
        with closing(sqlite3.connect(self.index)) as connection, connection:
            connection.executescript('''
                CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT);
                INSERT INTO metadata VALUES ('schema_version', '4');
                CREATE TABLE entries(id TEXT PRIMARY KEY, word TEXT, audio_ref TEXT);
            ''')
            connection.executemany('INSERT INTO entries VALUES (?, ?, ?)', [
                ('dict:1:a', 'всё', ''), ('dict:1:b', 'все', ''),
                ('dict:2:a', 'мой', ''), ('dict:2:b', 'мои', ''),
                ('dict:3:a', 'привет', ''), ('dict:4:a', 'ёлка', HASH),
            ])

    def export_rows(self, rows):
        with gzip.open(self.export, 'wt', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['id', 'word', 'change_form_sound'])
            writer.writeheader()
            writer.writerows(dict(zip(writer.fieldnames, row)) for row in rows)

    def test_strict_candidates_preserve_russian_letters_and_provenance(self):
        self.export_rows([('10', 'всё', HASH), ('11', 'МОЙ', HASH), ('12', 'приве́т', HASH)])
        before = hashlib.sha256(self.index.read_bytes()).hexdigest()
        def asset_state():
            return {str(path.relative_to(self.root)): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in self.root.rglob('*') if path.is_file()}
        assets_before = asset_state()
        report = audit_audio(self.export, self.index, self.cache)
        candidates = {item['entryId']: item for item in report['candidates']}
        self.assertEqual(set(candidates), {'dict:1:a', 'dict:2:a', 'dict:3:a'})
        self.assertEqual(candidates['dict:3:a']['textbookIds'], ['12'])
        self.assertEqual(candidates['dict:3:a']['sha256'], hashlib.sha256(FRAME * 2).hexdigest())
        self.assertFalse(report['publicationReady'])
        self.assertEqual(report['verification'], 'mp3-structure-only')
        self.assertEqual(report['summary']['dictionaryNativeCachedEntries'], 1)
        self.assertEqual(hashlib.sha256(self.index.read_bytes()).hexdigest(), before)
        self.assertEqual(asset_state(), assets_before, 'audit must not create SQLite sidecars or change assets')

    def test_multiple_source_hashes_are_ambiguous_even_when_only_one_cached(self):
        self.export_rows([('10', 'привет', HASH), ('11', 'приве́т', OTHER)])
        report = audit_audio(self.export, self.index, self.cache)
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['summary']['ambiguousWordGroups'], 1)
        self.assertEqual(report['summary']['ambiguousDictionaryEntries'], 1)
        self.assertEqual(report['summary']['missingFiles'], 1)

    def test_missing_corrupt_and_unsafe_sources_cannot_become_candidates(self):
        (self.cache / (OTHER + '.mp3')).write_bytes(b'ID3not valid')
        self.export_rows([('10', 'привет', OTHER), ('11', 'мой', '../escape'),
                          ('12', 'мой', HASH), ('13', 'всё', 'c' * 32)])
        report = audit_audio(self.export, self.index, self.cache)
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['summary']['invalidReferences'], 1)
        self.assertEqual(report['summary']['invalidFiles'], 1)
        self.assertEqual(report['summary']['missingFiles'], 1)

    def test_rejects_duplicate_ids_missing_columns_and_wrong_index_version(self):
        self.export_rows([('10', 'привет', HASH), ('10', 'мой', HASH)])
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            audit_audio(self.export, self.index, self.cache)
        self.export_rows([('10', 'привет', HASH)])
        with closing(sqlite3.connect(self.index)) as connection, connection:
            connection.execute("UPDATE metadata SET value='3'")
        with self.assertRaisesRegex(ValueError, 'schema'):
            audit_audio(self.export, self.index, self.cache)
        with gzip.open(self.export, 'wt', encoding='utf-8') as stream:
            stream.write('id,word\n1,test\n')
        with self.assertRaises(ValueError):
            audit_audio(self.export, self.index, self.cache)

    def test_report_may_not_overwrite_assets_or_inputs(self):
        self.export_rows([('10', 'привет', HASH)])
        report = audit_audio(self.export, self.index, self.cache)
        outside_generated = Path(__file__).resolve().parents[1] / 'docs' / 'private-audio-candidates.json'
        for output in (self.export, self.index, self.cache / 'report.json', outside_generated):
            with self.subTest(output=output), self.assertRaises(ValueError):
                write_report(report, output, [self.export, self.index], self.cache)
        output = self.root / 'report.json'
        write_report(report, output, [self.export, self.index], self.cache)
        import json
        self.assertEqual(json.loads(output.read_text(encoding='utf-8')), report)

    def test_rejects_non_decimal_ids_and_oversized_audio(self):
        self.export_rows([('../10', 'привет', HASH)])
        with self.assertRaisesRegex(ValueError, 'ID'):
            audit_audio(self.export, self.index, self.cache)
        self.export_rows([('10', 'привет', OTHER)])
        from cache_word_audio import MAX_AUDIO_BYTES
        (self.cache / (OTHER + '.mp3')).write_bytes(b'x' * (MAX_AUDIO_BYTES + 1))
        report = audit_audio(self.export, self.index, self.cache)
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['summary']['invalidFiles'], 1)

    def test_resolved_asset_escape_cannot_become_candidate(self):
        from unittest.mock import patch
        self.export_rows([('10', 'привет', OTHER)])
        target = self.cache / (OTHER + '.mp3')
        outside = self.root / (OTHER + '.mp3')
        outside.write_bytes(FRAME * 2)
        original_resolve = Path.resolve
        # Simulate an external link target without requiring Windows symlink privileges.
        def resolve(path, *args, **kwargs):
            return outside if path == target else original_resolve(path, *args, **kwargs)
        with patch.object(Path, 'resolve', resolve):
            report = audit_audio(self.export, self.index, self.cache)
        self.assertEqual(report['candidates'], [])
        self.assertEqual(report['summary']['invalidFiles'], 1)

    def test_rejects_wal_snapshot_without_creating_source_sidecars(self):
        self.export_rows([('10', 'привет', HASH)])
        with closing(sqlite3.connect(self.index)) as connection:
            self.assertEqual(connection.execute('PRAGMA journal_mode=WAL').fetchone()[0], 'wal')
        names_before = {path.name for path in self.root.iterdir()}
        with self.assertRaisesRegex(ValueError, 'WAL|snapshot'):
            audit_audio(self.export, self.index, self.cache)
        self.assertEqual({path.name for path in self.root.iterdir()}, names_before)

    def test_input_replacement_during_audit_rejects_report(self):
        from unittest.mock import patch
        from content_server.dictionary_normalization import normalize_strict_word
        self.export_rows([('10', 'привет', HASH)])
        replaced = False
        def normalize_and_replace(value):
            nonlocal replaced
            if not replaced:
                replaced = True
                self.export_rows([('99', 'привет', HASH)])
            return normalize_strict_word(value)
        with patch('audit_dictionary_audio.normalize_strict_word', normalize_and_replace):
            with self.assertRaisesRegex(ValueError, 'changed'):
                audit_audio(self.export, self.index, self.cache)


if __name__ == '__main__':
    unittest.main()
