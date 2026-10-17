"""Export a review queue for textbook-to-dictionary mappings.

The output is derived from local read-only exports and is intentionally separate
from the raw tables and the runtime content API.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from compare_book_dictionary import classify, normalize, read_rows


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "data" / "remote_7500km"
OUTPUT = ROOT / "docs" / "phase0" / "mapping-review-queue.json"


def main() -> None:
    dictionary_exact: set[str] = set()
    dictionary_relaxed: set[str] = set()
    for row in read_rows("ey_data__x_7500km_russian_index_new_test.csv.gz"):
        word = row.get("word", "")
        if word:
            dictionary_exact.add(normalize(word))
            dictionary_relaxed.add(normalize(word, relaxed=True))

    book_rows: dict[tuple[str, str], dict[str, str]] = {}
    for row in read_rows("production_7500km_com__n_study_book_word.csv.gz"):
        key = normalize(row.get("word", ""))
        if not key:
            continue
        book_name = row.get("book_name", "") or "未标注教材"
        book_rows.setdefault((book_name, key), {
            "word": row.get("word", ""),
            "bookName": book_name,
            "accent": row.get("accent", ""),
            "meaning": row.get("word_meaning_all", ""),
            "normalized": key,
        })

    book_keys = {key for _, key in book_rows}
    prototypes: dict[str, set[str]] = defaultdict(set)
    for row in read_rows("ey_data__e_change_word.csv.gz"):
        change = normalize(row.get("change_form", ""))
        prototype = normalize(row.get("prototype", ""))
        if change in book_keys and prototype:
            prototypes[change].add(prototype)

    entries = []
    counts = defaultdict(int)
    for item in book_rows.values():
        tier = classify(item, item["normalized"], dictionary_exact, dictionary_relaxed, prototypes)
        candidates = sorted(prototypes.get(item["normalized"], set()))
        # Unmatched entries need review; word-form entries with multiple
        # prototypes need review even though a dictionary mapping exists.
        if tier == "unmatched":
            priority = "high" if item["meaning"].strip() else "normal"
            reason = "main-dictionary-unmatched"
        elif tier == "wordFormToDictionary" and len(candidates) != 1:
            priority = "high"
            reason = "ambiguous-word-form"
        else:
            continue
        counts[reason] += 1
        entries.append({
            **item,
            "tier": tier,
            "prototypeCandidates": candidates,
            "priority": priority,
            "reviewReason": reason,
            "reviewStatus": "pending",
        })

    entries.sort(key=lambda item: (item["priority"] != "high", item["bookName"], item["word"]))
    report = {
        "source": [
            "production_7500km_com__n_study_book_word.csv.gz",
            "ey_data__x_7500km_russian_index_new_test.csv.gz",
            "ey_data__e_change_word.csv.gz",
        ],
        "policy": "仅输出待人工复核项；不修改原始导出或生产表。审核后应另存映射结果。",
        "summary": {
            "queueSize": len(entries),
            "highPriority": sum(item["priority"] == "high" for item in entries),
            "normalPriority": sum(item["priority"] == "normal" for item in entries),
            "byReason": dict(sorted(counts.items())),
        },
        "entries": entries,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
