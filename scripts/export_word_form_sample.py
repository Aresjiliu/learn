"""Export only word-form mappings needed by the local book fixtures."""

from __future__ import annotations

import csv
import gzip
import json
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "data" / "remote_7500km"
OUTPUT = ROOT / "data" / "content_samples" / "book_word_forms.json"
BOOK_IDS = ("1", "13")


def normalize(value: str, relaxed: bool = True) -> str:
    text = unicodedata.normalize("NFD", str(value or "").strip().lower())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return text.replace("ё", "е") if relaxed else text


def main() -> None:
    target_words = set()
    for book_id in BOOK_IDS:
        data = json.loads((ROOT / f"data/content_samples/book_{book_id}_words.json").read_text(encoding="utf-8"))
        target_words.update(normalize(row.get("word", "")) for row in data["words"])

    dictionary_exact = set()
    dictionary_words = set()
    dictionary_path = EXPORTS / "ey_data__x_7500km_russian_index_new_test.csv.gz"
    with gzip.open(dictionary_path, "rt", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if row.get("word"):
                dictionary_exact.add(normalize(row["word"], relaxed=False))
                dictionary_words.add(normalize(row["word"]))

    by_word = {}
    form_path = EXPORTS / "ey_data__e_change_word.csv.gz"
    with gzip.open(form_path, "rt", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            change = normalize(row.get("change_form", ""))
            change_exact = normalize(row.get("change_form", ""), relaxed=False)
            prototype = normalize(row.get("prototype", ""))
            if (
                not change
                or change not in target_words
                or change_exact in dictionary_exact
                or change in dictionary_words
                or prototype not in dictionary_words
            ):
                continue
            values = by_word.setdefault(change, [])
            candidate = {
                "prototype": row.get("prototype", ""),
                "sourceId": row.get("id", ""),
                "word_character": row.get("word_character_zh", ""),
            }
            if candidate not in values:
                values.append(candidate)

    OUTPUT.write_text(json.dumps({
        "source": "data/remote_7500km/ey_data__e_change_word.csv.gz",
        "books": list(BOOK_IDS),
        "byWord": dict(sorted(by_word.items())),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"words": len(by_word), "mappings": sum(len(items) for items in by_word.values())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
