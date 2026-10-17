"""Validate the independent textbook mapping decision template."""

from __future__ import annotations

import json
import csv
import gzip
import re
import sys
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "docs" / "phase0" / "first-wave-mapping-review.json"
DICTIONARY = ROOT / "data" / "remote_7500km" / "ey_data__x_7500km_russian_index_new_test.csv.gz"
ALLOWED = {"pending", "approved", "rejected", "needs-more-data"}


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^\wа-я-]", "", text, flags=re.IGNORECASE)


def load_dictionary() -> tuple[set[str], set[str], set[tuple[str, str]]]:
    words: set[str] = set()
    ids: set[str] = set()
    pairs: set[tuple[str, str]] = set()
    with gzip.open(DICTIONARY, "rt", encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            word = normalize(row.get("word", ""))
            source_id = str(row.get("id", "")).strip()
            if word:
                words.add(word)
            if source_id:
                ids.add(source_id)
            if word and source_id:
                pairs.add((word, source_id))
    return words, ids, pairs


def validate_summary(summary: dict, entries: list[dict]) -> list[str]:
    expected = {
        "entryCount": len(entries),
        "pendingCount": sum(item.get("decisionStatus") == "pending" for item in entries),
        "approvedCount": sum(item.get("decisionStatus") == "approved" for item in entries),
        "rejectedCount": sum(item.get("decisionStatus") == "rejected" for item in entries),
        "needsMoreDataCount": sum(item.get("decisionStatus") == "needs-more-data" for item in entries),
    }
    failures = []
    for field, actual in expected.items():
        declared = summary.get(field)
        if type(declared) is not int or declared != actual:
            failures.append(f"summary.{field}: 声明值 {declared!r} 与实际值 {actual} 不一致")
    return failures


def validate_decision_status(status: object) -> bool:
    return isinstance(status, str) and status in ALLOWED


def main() -> int:
    report = json.loads(INPUT.read_text(encoding="utf-8"))
    dictionary_words, dictionary_ids, dictionary_pairs = load_dictionary()
    failures = []
    entries = report.get("entries", [])
    failures.extend(validate_summary(report.get("summary", {}), entries))
    for item in entries:
        status = item.get("decisionStatus")
        if not validate_decision_status(status):
            failures.append(f"{item.get('reviewId')}: 非法 decisionStatus")
        if status == "approved":
            for field in ("selectedPrototype", "dictionaryId", "reviewNote"):
                if not str(item.get(field, "")).strip():
                    failures.append(f"{item.get('reviewId')}: approved 缺少 {field}")
            prototype = normalize(item.get("selectedPrototype", ""))
            dictionary_id = str(item.get("dictionaryId", "")).strip()
            if prototype not in dictionary_words:
                failures.append(f"{item.get('reviewId')}: selectedPrototype 不在本地主词典")
            if dictionary_id not in dictionary_ids:
                failures.append(f"{item.get('reviewId')}: dictionaryId 不在本地主词典")
            if (prototype, dictionary_id) not in dictionary_pairs:
                failures.append(f"{item.get('reviewId')}: selectedPrototype 与 dictionaryId 不匹配")
    pending = sum(item.get("decisionStatus") == "pending" for item in entries)
    approved = sum(item.get("decisionStatus") == "approved" for item in entries)
    rejected = sum(item.get("decisionStatus") == "rejected" for item in entries)
    needs_more_data = sum(item.get("decisionStatus") == "needs-more-data" for item in entries)
    print(json.dumps({
        "entryCount": len(entries),
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "needsMoreData": needs_more_data,
    }, ensure_ascii=False))
    if failures:
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("mapping review template: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
