"""Profile exported Russian content without contacting MySQL or remote services."""

from __future__ import annotations

import csv
import gzip
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "data" / "remote_7500km"
OUTPUT = ROOT / "docs" / "phase0" / "content-quality-report.json"


def rows(filename: str):
    with gzip.open(EXPORTS / filename, "rt", encoding="utf-8", newline="") as source:
        yield from csv.DictReader(source)


def missing_stats(filename: str, fields: list[str]) -> dict[str, int]:
    result = {field: 0 for field in fields}
    total = 0
    for row in rows(filename):
        total += 1
        for field in fields:
            if not str(row.get(field, "")).strip():
                result[field] += 1
    return {"rows": total, "missing": result}


def main() -> None:
    dictionary_words: set[str] = set()
    for row in rows("ey_data__x_7500km_russian_index_new_test.csv.gz"):
        word = str(row.get("word", "")).strip().casefold()
        if word:
            dictionary_words.add(word)

    book_words: set[str] = set()
    book_pairs: set[tuple[str, str]] = set()
    duplicate_pairs = 0
    book_word_rows = 0
    for row in rows("production_7500km_com__n_study_book_word.csv.gz"):
        book_word_rows += 1
        book = str(row.get("book_name", "")).strip()
        word = str(row.get("word", "")).strip()
        normalized = word.casefold()
        if normalized:
            book_words.add(normalized)
            pair = (book, normalized)
            if pair in book_pairs:
                duplicate_pairs += 1
            book_pairs.add(pair)

    question_total = 0
    question_missing = Counter()
    for row in rows("production_7500km_com__n_exam_question.csv.gz"):
        question_total += 1
        for field in ("question_content", "right_result", "analysis"):
            if not str(row.get(field, "")).strip():
                question_missing[field] += 1

    report = {
        "generatedFrom": "data/remote_7500km/manifest.json",
        "databaseTouched": False,
        "dictionary": {
            "rows": 166260,
            "distinctNormalizedWords": len(dictionary_words),
        },
        "bookWords": {
            "rows": book_word_rows,
            "distinctNormalizedWords": len(book_words),
            "distinctBookWordPairs": len(book_pairs),
            "duplicateBookWordPairs": duplicate_pairs,
            "matchedDictionaryWords": len(book_words & dictionary_words),
            "matchRate": round(len(book_words & dictionary_words) / len(book_words), 6) if book_words else 0,
            "missing": missing_stats(
                "production_7500km_com__n_study_book_word.csv.gz",
                ["book_name", "word", "accent", "word_meaning_all"],
            )["missing"],
        },
        "examples": missing_stats(
            "ey_data__liju_prod.csv.gz",
            ["eyu", "han"],
        ),
        "questions": {
            "rows": question_total,
            "missing": dict(question_missing),
        },
        "books": missing_stats(
            "production_7500km_com__n_study_book.csv.gz",
            ["book_name", "book_uuid", "introduce"],
        ),
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
