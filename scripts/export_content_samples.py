"""Export small, local-only course fixtures from ruflo_content for UI validation."""

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
OUTPUT_DIR = Path(os.environ.get("CONTENT_SAMPLE_DIR", "data/content_samples"))
BOOK_IDS = [1, 13]


def identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", value):
        raise ValueError(value)
    return f"`{value}`"


def main() -> None:
    if not PASSWORD:
        raise RuntimeError("LOCAL_DB_PASSWORD is required")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    connection = pymysql.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=PASSWORD,
        database="ruflo_content",
        charset="utf8mb4",
        read_timeout=300,
    )
    book_table = identifier("raw_production_7500km_com__n_study_book")
    word_table = identifier("raw_production_7500km_com__n_study_book_word")
    try:
        with connection.cursor() as cursor:
            books = []
            for book_id in BOOK_IDS:
                cursor.execute(
                    f"SELECT id, book_uuid, book_name, author, book_cover_img, wordNum, book_type, price, member_price, introduce "
                    f"FROM {book_table} WHERE id=%s",
                    (book_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise RuntimeError(f"Missing book id: {book_id}")
                columns = ["id", "book_uuid", "book_name", "author", "book_cover_img", "wordNum", "book_type", "price", "member_price", "introduce"]
                book = dict(zip(columns, row))
                books.append(book)
                cursor.execute(
                    f"SELECT id, word, word_character, accent, word_meaning_all, sentence_all, fixed_collocation, book_name "
                    f"FROM {word_table} WHERE book_name=%s ORDER BY CAST(id AS UNSIGNED)",
                    (book["book_name"],),
                )
                word_columns = ["id", "word", "word_character", "accent", "word_meaning_all", "sentence_all", "fixed_collocation", "book_name"]
                words = [dict(zip(word_columns, item)) for item in cursor.fetchall()]
                (OUTPUT_DIR / f"book_{book_id}_words.json").write_text(
                    json.dumps({"book": book, "words": words}, ensure_ascii=False, indent=2, default=str),
                    encoding="utf-8",
                )
                print(f"book {book_id}: {len(words)} words")
        (OUTPUT_DIR / "books.json").write_text(
            json.dumps({"books": books}, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
    finally:
        connection.close()


if __name__ == "__main__":
    main()
