"""Find conservative spelling candidates for unmatched first-wave textbook words."""

from __future__ import annotations

import csv
import difflib
import gzip
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "data/remote_7500km"
REVIEW = ROOT / "docs/phase0/first-wave-mapping-review.json"
OUTPUT = ROOT / "docs/phase0/first-wave-fuzzy-candidates.json"
MARKDOWN_OUTPUT = ROOT / "docs/phase0/first-wave-fuzzy-candidates.md"


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = text.replace("ё", "е")
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^\wа-я-]", "", text, flags=re.IGNORECASE)


def dictionary_meaning(row: dict[str, str]) -> str:
    try:
        entries = json.loads(row.get("XJSY", "[]"))
    except json.JSONDecodeError:
        return ""
    if not isinstance(entries, list):
        return ""
    return "；".join(
        str(item.get("cy", "")).strip()
        for item in entries
        if isinstance(item, dict) and item.get("cy")
    )


def main() -> None:
    dictionary: dict[str, dict[str, str]] = {}
    source = EXPORTS / "ey_data__x_7500km_russian_index_new_test.csv.gz"
    with gzip.open(source, "rt", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            key = normalize(row.get("word", ""))
            if key and key not in dictionary:
                dictionary[key] = {
                    "word": row.get("word", ""),
                    "id": row.get("id", row.get("word_id", "")),
                    "meaning": dictionary_meaning(row),
                    "wordCharacter": row.get("word_character_zh", ""),
                }
    keys = list(dictionary)
    review = json.loads(REVIEW.read_text(encoding="utf-8"))
    rows = []
    for item in review.get("entries", []):
        if item.get("reviewReason") != "main-dictionary-unmatched":
            continue
        word = str(item.get("textbookWord", ""))
        key = normalize(word)
        if not key or any(char.isspace() for char in word):
            candidates = []
        else:
            scored = []
            for candidate_key in keys:
                if abs(len(candidate_key) - len(key)) > 2:
                    continue
                score = difflib.SequenceMatcher(None, key, candidate_key).ratio()
                if score >= 0.75:
                    scored.append((score, candidate_key))
            scored.sort(reverse=True)
            candidates = [
                {"score": round(score, 4), **dictionary[candidate_key]}
                for score, candidate_key in scored[:5]
            ]
        rows.append({
            "reviewId": item.get("reviewId", ""),
            "textbookWord": word,
            "textbookMeaning": item.get("textbookMeaning", ""),
            "decisionStatus": item.get("decisionStatus", "pending"),
            "candidates": candidates,
        })
    output = {
        "policy": "仅为拼写相近候选，不代表词义或词性一致；任何候选必须人工核对后才能批准。",
        "source": "data/remote_7500km/ey_data__x_7500km_russian_index_new_test.csv.gz",
        "summary": {
            "unmatchedEntries": len(rows),
            "entriesWithCandidates": sum(bool(row["candidates"]) for row in rows),
            "candidateCount": sum(len(row["candidates"]) for row in rows),
            "approvedCount": sum(row["decisionStatus"] == "approved" for row in rows),
        },
        "entries": rows,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# 首发教材未匹配词模糊候选",
        "",
        "本报告仅基于拼写相似度生成候选，不代表词义、词性或教材上下文一致；任何候选必须人工核对后才能批准。结果不会进入运行时映射。",
        "",
        f"共 {len(rows)} 条未匹配记录，其中 {output['summary']['entriesWithCandidates']} 条有候选、共 {output['summary']['candidateCount']} 个候选；当前批准数为 0。",
        "",
        "| 教材词 | 教材释义 | 拼写候选（得分 / ID） | 状态 |",
        "| --- | --- | --- | --- |",
    ]
    for row in rows:
        if not row["candidates"]:
            continue
        candidates = "<br>".join(
            f"`{candidate['word']}`（{candidate['score']:.4f} / `{candidate['id'] or '未提供'}`）"
            for candidate in row["candidates"]
        )
        meaning = " ".join(str(row["textbookMeaning"]).split()).replace("|", "\\|")
        lines.append(f"| `{row['textbookWord']}` | {meaning} | {candidates} | `{row['decisionStatus']}` |")
    MARKDOWN_OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
