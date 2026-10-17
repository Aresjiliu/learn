"""Export only approved textbook mappings into a small runtime module."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "phase0" / "first-wave-mapping-review.json"
OUTPUT = ROOT / "data" / "content_samples" / "mapping_decisions.js"
REQUIRED = ("bookName", "normalized", "selectedPrototype", "dictionaryId", "reviewNote")


def main() -> None:
    report = json.loads(SOURCE.read_text(encoding="utf-8"))
    decisions = []
    for item in report.get("entries", []):
        if item.get("decisionStatus") != "approved":
            continue
        missing = [field for field in REQUIRED if not str(item.get(field, "")).strip()]
        if missing:
            raise SystemExit(f"approved mapping missing fields: {item.get('reviewId')}: {', '.join(missing)}")
        decisions.append({field: item[field] for field in REQUIRED} | {
            "reviewId": item.get("reviewId", ""),
            "decisionStatus": "approved",
        })
    OUTPUT.write_text(
        "module.exports = " + json.dumps({"decisions": decisions}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"approved": len(decisions), "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
