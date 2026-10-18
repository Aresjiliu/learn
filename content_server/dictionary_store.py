"""Ranked, read-only lookup over a prebuilt dictionary snapshot."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from scripts.build_dictionary_index import normalize_strict_word, normalize_word


TIERS = ('exact', 'prefix', 'wordForm', 'substring', 'meaning')


class AmbiguousLegacyId(ValueError):
    """The old source ID identifies more than one dictionary entry."""


class DictionaryStore:
    def __init__(self, path: Path):
        self.path = Path(path)

    def connect(self) -> sqlite3.Connection:
        if not self.path.is_file():
            raise FileNotFoundError(self.path)
        connection = sqlite3.connect(self.path.resolve().as_uri() + '?mode=ro', uri=True)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA query_only=ON')
        return connection

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
        if not raw or len(raw) > 64 or any(char in raw for char in ('%', '_')):
            raise ValueError('查询词为空、过长或包含不支持的通配符')
        if not isinstance(page, int) or page < 1 or not isinstance(page_size, int) or not 1 <= page_size <= 100:
            raise ValueError('分页参数无效')
        normalized = normalize_word(raw)
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
