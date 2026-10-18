"""Ranked, read-only lookup over a prebuilt dictionary snapshot."""

from __future__ import annotations

import sqlite3
import re
from contextlib import closing
from pathlib import Path

from .dictionary_normalization import normalize_strict_word, normalize_word


TIERS = ('exact', 'prefix', 'wordForm', 'substring', 'meaning')


class AmbiguousLegacyId(ValueError):
    """The old source ID identifies more than one dictionary entry."""


class SnapshotUnavailable(ValueError):
    """Snapshot schema or required content is not ready to serve."""


class DictionaryStore:
    def __init__(self, path: Path, *, immutable: bool = False):
        self.path = Path(path)
        self.immutable = immutable

    def connect(self) -> sqlite3.Connection:
        if not self.path.is_file():
            raise FileNotFoundError(self.path)
        # immutable is only for a private snapshot owned by the service, with no writer.
        suffix = '?mode=ro&immutable=1' if self.immutable else '?mode=ro'
        connection = sqlite3.connect(self.path.resolve().as_uri() + suffix, uri=True)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA query_only=ON')
        return connection

    def snapshot_info(self) -> dict:
        with closing(self.connect()) as connection:
            metadata = dict(connection.execute('SELECT key, value FROM metadata'))
            if (metadata.get('schema_version') != '4'
                    or not str(metadata.get('row_count', '')).isdigit()
                    or int(metadata.get('row_count', '0')) < 1
                    or not str(metadata.get('form_row_count', '')).isdigit()
                    or int(metadata.get('form_row_count', '0')) < 1
                    or any(not re.fullmatch('[0-9a-f]{64}', metadata.get(key, ''))
                           for key in ('source_sha256', 'forms_source_sha256'))):
                raise SnapshotUnavailable('索引版本或元数据无效')
            if (connection.execute('SELECT id, strict_word FROM entries LIMIT 1').fetchone() is None
                    or connection.execute('SELECT prototype_strict FROM forms LIMIT 1').fetchone() is None):
                raise SnapshotUnavailable('索引内容为空')
            connection.execute('SELECT rowid FROM entries_fts LIMIT 1').fetchone()
            connection.execute('SELECT rowid FROM meaning_short_fts LIMIT 1').fetchone()
        return {
            'schemaVersion': metadata['schema_version'],
            'contentVersion': 'dict-v4-' + metadata['source_sha256'][:12] + '-' + metadata['forms_source_sha256'][:12],
            'entryCount': int(metadata['row_count']),
        }

    @staticmethod
    def _word(row: sqlite3.Row, tier: int | None = None, ambiguous: bool = False) -> dict:
        return {
            'id': row['id'],
            'sourceId': row['source_id'],
            'word': row['word'],
            'word_meaning_all': row['meaning'],
            'word_character': row['word_class'],
            'sourceType': 'dictionary',
            'audio_url': '',  # Unverified source references are never playable URLs.
            'audioPending': bool(row['audio_ref']),
            'matchTier': TIERS[tier] if tier is not None else 'exact',
            'ambiguous': ambiguous if tier == 2 else False,
        }

    def detail(self, entry_id: str) -> dict | None:
        value = str(entry_id or '').strip()
        if not value:
            return None
        with closing(self.connect()) as connection:
            if value.startswith('dict:'):
                row = connection.execute('SELECT * FROM entries WHERE id = ?', (value,)).fetchone()
                return self._word(row) if row else None
            rows = connection.execute('SELECT * FROM entries WHERE source_id = ? LIMIT 2', (value,)).fetchall()
            if len(rows) > 1:
                raise AmbiguousLegacyId(f'旧词条 ID 不唯一: {value}')
            return self._word(rows[0]) if rows else None

    def search(self, query: str, page: int = 1, page_size: int = 20) -> dict:
        raw = str(query or '').strip()
        normalized = normalize_word(raw)
        if (not normalized or len(raw) > 64 or any(char in raw for char in ('%', '_'))
                or any(ord(char) < 32 or ord(char) == 127 for char in raw)):
            raise ValueError('查询词为空、过长或包含不支持的通配符')
        if type(page) is not int or not 1 <= page <= 1000000 or type(page_size) is not int or not 1 <= page_size <= 100:
            raise ValueError('分页参数无效')
        strict = normalize_strict_word(raw)
        clauses = [
            'SELECT id, 0 AS tier FROM entries WHERE normalized_word = ?',
            'SELECT id, 1 AS tier FROM entries WHERE normalized_word >= ? AND normalized_word < ?',
            '''SELECT e.id, 2 AS tier FROM forms f
               JOIN entries e ON e.strict_word = f.prototype_strict
               WHERE f.form_normalized = ?''',
            '''SELECT e.id, 2 AS tier FROM forms f
               JOIN entries e ON e.normalized_word = f.prototype_normalized
               WHERE f.form_normalized = ? AND NOT EXISTS (
                   SELECT 1 FROM entries exact WHERE exact.strict_word = f.prototype_strict
               )''',
        ]
        parameters = [normalized, normalized, normalized + '\uffff', normalized, normalized]
        if len(normalized) >= 3:
            clauses.append('''SELECT e.id, 3 AS tier FROM entries_fts f
                              JOIN entries e ON e.rowid = f.rowid
                              WHERE f.normalized_word LIKE ?''')
            parameters.append('%' + normalized + '%')
            clauses.append('''SELECT e.id, 4 AS tier FROM entries_fts f
                              JOIN entries e ON e.rowid = f.rowid
                              WHERE f.meaning LIKE ?''')
            parameters.append('%' + raw + '%')
        elif all('\u3400' <= char <= '\u9fff' for char in raw):
            clauses.append('''SELECT e.id, 4 AS tier FROM meaning_short_fts f
                              JOIN entries e ON e.rowid = f.rowid
                              WHERE meaning_short_fts MATCH ? AND instr(e.meaning, ?) > 0''')
            parameters.extend(('"' + raw + '"', raw))
        cte = 'WITH candidates AS (' + ' UNION ALL '.join(clauses) + '''),
               ranked AS (SELECT id, MIN(tier) AS tier FROM candidates GROUP BY id)'''
        with closing(self.connect()) as connection:
            form_candidates = [row[0] for row in connection.execute('''
                SELECT prototype_strict FROM forms WHERE form_normalized = ?
                ORDER BY prototype_strict
            ''', (normalized,))]
            total = connection.execute(cte + ' SELECT COUNT(*) FROM ranked', parameters).fetchone()[0]
            rows = connection.execute(cte + '''
                SELECT e.*, ranked.tier FROM ranked JOIN entries e ON e.id = ranked.id
                ORDER BY ranked.tier,
                    CASE WHEN e.strict_word = ? THEN 0 ELSE 1 END,
                    e.normalized_word, e.id LIMIT ? OFFSET ?
            ''', parameters + [strict, page_size, (page - 1) * page_size]).fetchall()
        return {
            'words': [self._word(row, row['tier'], len(form_candidates) > 1) for row in rows],
            'formCandidates': form_candidates,
            'page': page,
            'page_size': page_size,
            'total': total,
        }
