"""Ensure the generated first-wave review queue has not gone stale."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "docs/phase0/first-wave-mapping-review.json"
QUEUE = ROOT / "docs/phase0/first-wave-review-queue.md"


def main() -> int:
    template = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    queue = QUEUE.read_text(encoding="utf-8")
    entries = template.get("entries", [])
    failures = []
    if f"覆盖全部 {len(entries)} 条" not in queue:
        failures.append("队列说明中的记录总数与审核模板不一致")

    rows = {}
    for line in queue.splitlines():
        if not line.startswith("| ") or line.startswith("| ---"):
            continue
        fields = [field.strip() for field in line.strip("|").split("|")]
        if len(fields) >= 5 and fields[1].startswith("`") and fields[1].endswith("`"):
            rows[fields[1][1:-1].replace("\\|", "|")] = fields
    for item in entries:
        word = str(item.get("textbookWord", ""))
        fields = rows.get(word)
        if not fields:
            failures.append(f"队列缺少教材词: {word}")
        elif item.get("decisionStatus") == "pending" and fields[3] != "`pending`":
            failures.append(f"pending 词条状态不一致: {word}")

    if "不会改变 `first-wave-mapping-review.json`" not in queue:
        failures.append("队列缺少非权威声明")
    if failures:
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"first-wave review queue: PASS ({len(entries)} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
