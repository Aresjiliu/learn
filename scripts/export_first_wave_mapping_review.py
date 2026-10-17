"""Export an auditable decision template for first-wave textbook mappings."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "docs" / "phase0" / "mapping-review-queue.json"
PLAN = ROOT / "docs" / "phase0" / "mapping-review-plan.json"
OUTPUT = ROOT / "docs" / "phase0" / "first-wave-mapping-review.json"


def main() -> None:
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    first_wave = set(plan.get("firstWaveBooks", []))
    entries = []
    for item in queue.get("entries", []):
        if item.get("bookName") not in first_wave:
            continue
        entries.append({
            "reviewId": f"{item.get('bookName', '')}:{item.get('normalized', '')}",
            "bookName": item.get("bookName", ""),
            "textbookWord": item.get("word", ""),
            "normalized": item.get("normalized", ""),
            "accent": item.get("accent", ""),
            "textbookMeaning": item.get("meaning", ""),
            "reviewReason": item.get("reviewReason", ""),
            "prototypeCandidates": item.get("prototypeCandidates", []),
            "decisionStatus": "pending",
            "selectedPrototype": "",
            "dictionaryId": "",
            "reviewNote": "",
        })
    entries.sort(key=lambda item: (item["bookName"], item["textbookWord"]))
    report = {
        "policy": "审核模板只供人工确认；空白 decisionStatus 不得进入运行时映射。",
        "allowedDecisionStatus": ["pending", "approved", "rejected", "needs-more-data"],
        "requiredForApproval": ["selectedPrototype", "dictionaryId", "reviewNote"],
        "source": "docs/phase0/mapping-review-queue.json",
        "summary": {
            "bookCount": len(first_wave),
            "entryCount": len(entries),
            "pendingCount": len(entries),
        },
        "entries": entries,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
