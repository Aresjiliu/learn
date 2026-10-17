"""Build a review plan from the immutable textbook mapping queue."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "docs" / "phase0" / "mapping-review-queue.json"
COMPARISON = ROOT / "docs" / "phase0" / "book-dictionary-comparison.json"
OUTPUT = ROOT / "docs" / "phase0" / "mapping-review-plan.json"

FIRST_WAVE = {"东方教材大学俄语3", "俄语专业大纲综合"}


def main() -> None:
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    comparison = json.loads(COMPARISON.read_text(encoding="utf-8"))
    books = defaultdict(list)
    for entry in queue.get("entries", []):
        books[entry.get("bookName") or "未标注教材"].append(entry)

    rows = []
    for book_name, entries in books.items():
        reasons = Counter(item.get("reviewReason", "unknown") for item in entries)
        high = sum(item.get("priority") == "high" for item in entries)
        missing_meaning = sum(not str(item.get("meaning", "")).strip() for item in entries)
        if book_name in FIRST_WAVE:
            stage = "first-wave"
            recommendation = "样本首发课程优先；先处理有教材释义的未匹配词，再处理歧义词形。"
            stage_rank = 0
        elif high:
            stage = "second-wave"
            recommendation = "按教材使用频次和用户入口排序；先确认唯一原型，再处理未匹配词。"
            stage_rank = 1
        else:
            stage = "later"
            recommendation = "暂不阻断课程展示；保留教材词并在后台逐步补录。"
            stage_rank = 2
        rows.append({
            "bookName": book_name,
            "stage": stage,
            "stageRank": stage_rank,
            "queueSize": len(entries),
            "highPriority": high,
            "missingMeaning": missing_meaning,
            "byReason": dict(sorted(reasons.items())),
            "topEntries": [
                {
                    "word": item.get("word", ""),
                    "meaning": item.get("meaning", ""),
                    "reviewReason": item.get("reviewReason", ""),
                    "prototypeCandidates": item.get("prototypeCandidates", []),
                }
                for item in entries[:20]
            ],
            "recommendation": recommendation,
        })

    rows.sort(key=lambda item: (item["stageRank"], -item["highPriority"], -item["queueSize"], item["bookName"]))
    report = {
        "policy": "本计划只组织独立复核队列，不自动建立映射、不修改原始导出或生产数据。",
        "firstWaveBooks": sorted(FIRST_WAVE),
        "sourceSummary": queue.get("summary", {}),
        "comparisonSummary": comparison.get("summary", {}),
        "books": rows,
        "summary": {
            "bookCount": len(rows),
            "firstWaveBookCount": sum(item["stage"] == "first-wave" for item in rows),
            "secondWaveBookCount": sum(item["stage"] == "second-wave" for item in rows),
            "laterBookCount": sum(item["stage"] == "later" for item in rows),
            "firstWaveQueueSize": sum(item["queueSize"] for item in rows if item["stage"] == "first-wave"),
        },
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
