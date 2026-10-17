"""Compare textbook vocabulary with the main dictionary and word-form export."""

from __future__ import annotations

import csv
import gzip
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "data" / "remote_7500km"
OUTPUT = ROOT / "docs" / "phase0" / "book-dictionary-comparison.json"


def read_rows(filename: str):
    with gzip.open(EXPORTS / filename, "rt", encoding="utf-8", newline="") as source:
        yield from csv.DictReader(source)


def normalize(value: str, relaxed: bool = False) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.replace("ё", "е") if relaxed else text
    return re.sub(r"[^\wа-яё-]", "", text, flags=re.IGNORECASE)


def classify(item: dict[str, str], key: str, dictionary_exact: set[str], dictionary_relaxed: set[str], prototype_candidates: dict[str, set[str]]) -> str:
    if key in dictionary_exact:
        return "exact"
    if normalize(item["word"], relaxed=True) in dictionary_relaxed:
        return "relaxed"
    if any(proto in dictionary_exact or proto in dictionary_relaxed for proto in prototype_candidates.get(key, set())):
        return "wordFormToDictionary"
    return "unmatched"


def main() -> None:
    dictionary_exact: set[str] = set()
    dictionary_relaxed: set[str] = set()
    for row in read_rows("ey_data__x_7500km_russian_index_new_test.csv.gz"):
        word = row.get("word", "")
        if word:
            dictionary_exact.add(normalize(word))
            dictionary_relaxed.add(normalize(word, relaxed=True))

    book_words: dict[str, dict[str, str]] = {}
    book_rows: list[dict[str, str]] = []
    for row in read_rows("production_7500km_com__n_study_book_word.csv.gz"):
        key = normalize(row.get("word", ""))
        if key and key not in book_words:
            item = {
                "word": row.get("word", ""),
                "bookName": row.get("book_name", ""),
                "accent": row.get("accent", ""),
                "meaning": row.get("word_meaning_all", ""),
            }
            book_words[key] = item
        if key:
            book_rows.append({
                "key": key,
                "word": row.get("word", ""),
                "bookName": row.get("book_name", ""),
                "accent": row.get("accent", ""),
                "meaning": row.get("word_meaning_all", ""),
            })

    prototype_candidates: dict[str, set[str]] = defaultdict(set)
    book_keys = set(book_words)
    for row in read_rows("ey_data__e_change_word.csv.gz"):
        change = normalize(row.get("change_form", ""))
        prototype = normalize(row.get("prototype", ""))
        if change in book_keys and prototype:
            prototype_candidates[change].add(prototype)

    tiers = {"exact": [], "relaxed": [], "wordFormToDictionary": [], "unmatched": []}
    classifications: dict[str, str] = {}
    for key, item in book_words.items():
        tier = classify(item, key, dictionary_exact, dictionary_relaxed, prototype_candidates)
        classifications[key] = tier
        if len(tiers[tier]) < 100:
            tiers[tier].append({**item, "normalized": key, "prototypes": sorted(prototype_candidates.get(key, set()))})

    counts = {tier: sum(1 for value in classifications.values() if value == tier) for tier in tiers}
    total = len(book_words)
    book_summary: dict[str, dict[str, object]] = {}
    seen_book_words: set[tuple[str, str]] = set()
    for item in book_rows:
        book_name = item["bookName"] or "未标注教材"
        identity = (book_name, item["key"])
        if identity in seen_book_words:
            continue
        seen_book_words.add(identity)
        tier = classify(item, item["key"], dictionary_exact, dictionary_relaxed, prototype_candidates)
        summary = book_summary.setdefault(book_name, {
            "distinctWords": 0,
            "exact": 0,
            "relaxed": 0,
            "wordFormToDictionary": 0,
            "unmatched": 0,
            "meaningMissing": 0,
            "unmatchedSamples": [],
        })
        summary["distinctWords"] += 1
        summary[tier] += 1
        if not item["meaning"].strip():
            summary["meaningMissing"] += 1
        if tier == "unmatched" and len(summary["unmatchedSamples"]) < 20:
            summary["unmatchedSamples"].append({
                "word": item["word"],
                "accent": item["accent"],
                "meaning": item["meaning"],
            })
    for summary in book_summary.values():
        summary["coveredByAnyTier"] = summary["distinctWords"] - summary["unmatched"]
        summary["coverageRate"] = round(summary["coveredByAnyTier"] / summary["distinctWords"], 6) if summary["distinctWords"] else 0
    report = {
        "policy": {
            "tier1": "标准化后精确匹配，直接复用主词典释义/音频并保留教材字段。",
            "tier2": "仅处理大小写、重音符号和 ё/е 差异，需保留原词用于展示。",
            "tier3": "通过 e_change_word 从变形回溯原型；不覆盖教材释义，需记录映射来源。",
            "unmatched": "进入人工复核，不自动删除或强行合并。",
        },
        "summary": {
            "distinctBookWords": total,
            "dictionaryExact": counts["exact"],
            "dictionaryRelaxed": counts["relaxed"],
            "wordFormToDictionary": counts["wordFormToDictionary"],
            "unmatched": counts["unmatched"],
            "coveredByAnyTier": total - counts["unmatched"],
            "coverageRate": round((total - counts["unmatched"]) / total, 6) if total else 0,
        },
        "byBook": dict(sorted(book_summary.items())),
        "samples": tiers,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
