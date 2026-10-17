"""Read-only inspection of local content tables and course media files."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import pymysql


HOST = os.environ.get("LOCAL_DB_HOST", "127.0.0.1")
PORT = int(os.environ.get("LOCAL_DB_PORT", "3316"))
USER = os.environ.get("LOCAL_DB_USER", "root")
PASSWORD = os.environ.get("LOCAL_DB_PASSWORD")
DATABASE = "ruflo_content"
TABLES = [
    "raw_production_7500km_com__n_study_book",
    "raw_production_7500km_com__n_study_book_type",
    "raw_production_7500km_com__n_study_book_word",
    "raw_ey_data__x_7500km_russian_index_new_test",
    "raw_ey_data__fanyi2",
]

SAMPLE_COLUMNS = {
    "raw_production_7500km_com__n_study_book": ["id", "book_uuid", "book_name", "author", "book_cover_img", "wordNum", "book_type", "price", "member_price"],
    "raw_production_7500km_com__n_study_book_type": ["id", "book_type_name", "sort"],
    "raw_production_7500km_com__n_study_book_word": ["id", "word", "book_name", "word_character", "accent", "word_meaning_all", "sentence_all"],
    "raw_ey_data__x_7500km_russian_index_new_test": ["id", "word", "sound", "word_character_zh", "XJSY", "zywz"],
    "raw_ey_data__fanyi2": ["ID", "SFROM", "SHAPE", "TYC", "FYC", "XJSY", "cixing"],
}


def identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", value):
        raise ValueError(value)
    return f"`{value}`"


def main() -> None:
    if not PASSWORD:
        raise RuntimeError("LOCAL_DB_PASSWORD is required")
    connection = pymysql.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=PASSWORD,
        database=DATABASE,
        charset="utf8mb4",
        read_timeout=300,
    )
    try:
        with connection.cursor() as cursor:
            for table in TABLES:
                cursor.execute(f"SHOW COLUMNS FROM {identifier(table)}")
                columns = [row[0] for row in cursor.fetchall() if row[0] != "_import_row_id"]
                cursor.execute(f"SELECT COUNT(*) FROM {identifier(table)}")
                count = cursor.fetchone()[0]
                select_columns = ", ".join(identifier(column) for column in columns)
                if table == "raw_ey_data__fanyi2":
                    rows = []
                else:
                    cursor.execute(f"SELECT {select_columns} FROM {identifier(table)} LIMIT 3")
                    rows = cursor.fetchall()
                sample_names = SAMPLE_COLUMNS.get(table, columns[:8])
                sample_indexes = [columns.index(name) for name in sample_names if name in columns]
                sample_dicts = [
                    {columns[index]: row[index] for index in sample_indexes}
                    for row in rows
                ]
                print(json.dumps({"table": table, "count": count, "columns": columns, "samples": sample_dicts}, ensure_ascii=False, default=str))

            book_table = identifier("raw_production_7500km_com__n_study_book")
            word_table = identifier("raw_production_7500km_com__n_study_book_word")
            cursor.execute(
                f"SELECT book_name, COUNT(*) AS word_count FROM {word_table} "
                "GROUP BY book_name ORDER BY word_count DESC"
            )
            word_counts = cursor.fetchall()
            cursor.execute(f"SELECT id, book_name, wordNum, book_cover_img FROM {book_table} ORDER BY id")
            books = cursor.fetchall()
            index_table = identifier("raw_ey_data__x_7500km_russian_index_new_test")
            cursor.execute(
                f"SELECT COUNT(*), COUNT(DISTINCT word), COUNT(DISTINCT book_name) FROM {word_table}"
            )
            word_totals = cursor.fetchone()
            cursor.execute(
                f"SELECT COUNT(*) FROM {word_table} w JOIN {index_table} i ON w.word = i.word"
            )
            exact_matches = cursor.fetchone()[0]
            print(json.dumps({"book_word_counts": word_counts, "books": books, "word_totals": word_totals, "exact_main_index_matches": exact_matches}, ensure_ascii=False, default=str))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
