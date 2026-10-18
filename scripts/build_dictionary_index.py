"""Build a replaceable SQLite snapshot from the owned Russian dictionary export."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
import time
import unicodedata
from collections import Counter
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from content_server.dictionary_normalization import normalize_strict_word, normalize_word


def stable_entry_id(source_id: str, word: str) -> str:
    legacy_id = str(source_id).strip()
    original = unicodedata.normalize('NFC', str(word).strip())
    if not legacy_id.isdecimal() or not original:
        raise ValueError('词条缺少合法旧 ID 或原词')
    digest = hashlib.sha256(original.encode('utf-8')).hexdigest()[:16]
    return f'dict:{legacy_id}:{digest}'


def extract_meaning(raw: str) -> str:
    try:
        values = json.loads(raw or '[]')
    except (TypeError, ValueError):
        return ''
    if isinstance(values, dict):
        values = [values]
    if not isinstance(values, list):
        return ''
    return '\n'.join(str(value.get('cy', '')).strip() for value in values
                     if isinstance(value, dict) and str(value.get('cy', '')).strip())


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def chinese_short_grams(meaning: str) -> str:
    def is_han(char: str) -> bool:
        return '\u3400' <= char <= '\u9fff'

    grams = {char for char in meaning if is_han(char)}
    grams.update(meaning[index:index + 2] for index in range(len(meaning) - 1)
                 if is_han(meaning[index]) and is_han(meaning[index + 1]))
    return ' '.join(sorted(grams))


def build_index(source: Path, output: Path, forms_source: Path) -> dict:
    started = time.perf_counter()
    source, output = Path(source), Path(output)
    if not source.is_file():
        raise FileNotFoundError(source)
    forms_source = Path(forms_source)
    if not forms_source.is_file():
        raise FileNotFoundError(forms_source)
    if output.resolve() in {source.resolve(), forms_source.resolve()}:
        raise ValueError('输出不能覆盖源文件')
    output.parent.mkdir(parents=True, exist_ok=True)
    source_hash = source_sha256(source)
    forms_hash = source_sha256(forms_source)
    with tempfile.TemporaryDirectory(prefix='dictionary-index-', dir=output.parent) as directory:
        staged = Path(directory) / 'snapshot.sqlite'
        source_ids = Counter()
        count = 0
        form_count = 0
        with closing(sqlite3.connect(staged)) as connection, connection:
            connection.execute('PRAGMA synchronous=FULL')
            connection.executescript('''
                CREATE TABLE entries (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    word TEXT NOT NULL,
                    normalized_word TEXT NOT NULL,
                    strict_word TEXT NOT NULL,
                    meaning TEXT NOT NULL,
                    word_class TEXT NOT NULL,
                    audio_ref TEXT NOT NULL
                );
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE forms (
                    form_normalized TEXT NOT NULL,
                    prototype_strict TEXT NOT NULL,
                    prototype_normalized TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    PRIMARY KEY (form_normalized, prototype_strict)
                );
                CREATE VIRTUAL TABLE entries_fts USING fts5(
                    normalized_word, meaning, content='entries', content_rowid='rowid', tokenize='trigram'
                );
                CREATE VIRTUAL TABLE meaning_short_fts USING fts5(grams, content='');
            ''')
            with gzip.open(source, 'rt', encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                required = {'id', 'word', 'XJSY', 'word_character_zh', 'sound'}
                if not required.issubset(reader.fieldnames or []):
                    raise ValueError('主词典导出缺少必需字段')
                for row in reader:
                    source_id = str(row['id']).strip()
                    word = str(row['word']).strip()
                    entry_id = stable_entry_id(source_id, word)
                    meaning = extract_meaning(row['XJSY'])
                    try:
                        cursor = connection.execute('''
                            INSERT INTO entries
                            (id, source_id, word, normalized_word, strict_word, meaning, word_class, audio_ref)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (entry_id, source_id, word, normalize_word(word),
                              normalize_strict_word(word), meaning, row['word_character_zh'] or '', row['sound'] or ''))
                    except sqlite3.IntegrityError as error:
                        raise ValueError(f'重复词条键: {entry_id}') from error
                    grams = chinese_short_grams(meaning)
                    if grams:
                        connection.execute('INSERT INTO meaning_short_fts(rowid, grams) VALUES (?, ?)',
                                           (cursor.lastrowid, grams))
                    source_ids[source_id] += 1
                    count += 1
            with gzip.open(forms_source, 'rt', encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                if not {'id', 'change_form', 'prototype'}.issubset(reader.fieldnames or []):
                    raise ValueError('词形导出缺少必需字段')
                for row in reader:
                    form = normalize_word(row['change_form'])
                    prototype_strict = normalize_strict_word(row['prototype'])
                    prototype = normalize_word(row['prototype'])
                    if form and prototype:
                        connection.execute('''
                            INSERT OR IGNORE INTO forms
                            (form_normalized, prototype_strict, prototype_normalized, source_id)
                            VALUES (?, ?, ?, ?)
                        ''', (form, prototype_strict, prototype, str(row['id']).strip()))
                        form_count += 1
            if not count or not form_count:
                raise ValueError('词典或词形导出为空，拒绝发布索引')
            connection.execute("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')")
            connection.execute('CREATE INDEX entries_normalized_word ON entries(normalized_word, id)')
            connection.execute('CREATE INDEX entries_strict_word ON entries(strict_word, id)')
            connection.execute('CREATE INDEX entries_source_id ON entries(source_id)')
            connection.executemany('INSERT INTO metadata(key, value) VALUES (?, ?)', [
                ('schema_version', '4'), ('source_sha256', source_hash),
                ('row_count', str(count)), ('source_name', source.name),
                ('forms_source_sha256', forms_hash), ('form_row_count', str(form_count)),
            ])
            if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('词典索引完整性检查失败')
        os.replace(staged, output)
    return {
        'rows': count,
        'duplicate_source_ids': sum(value - 1 for value in source_ids.values() if value > 1),
        'source_sha256': source_hash,
        'forms_source_sha256': forms_hash,
        'form_rows': form_count,
        'index_bytes': output.stat().st_size,
        'build_seconds': round(time.perf_counter() - started, 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--forms-source', type=Path, required=True)
    arguments = parser.parse_args()
    print(json.dumps(build_index(arguments.source, arguments.output, arguments.forms_source), ensure_ascii=False))


if __name__ == '__main__':
    main()
