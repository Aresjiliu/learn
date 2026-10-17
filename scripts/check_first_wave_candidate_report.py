"""Validate that the first-wave candidate report matches its review template."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "docs/phase0/first-wave-mapping-review.json"
REPORT = ROOT / "docs/phase0/first-wave-candidate-report.md"


def main() -> int:
    review = json.loads(REVIEW.read_text(encoding="utf-8"))
    report = REPORT.read_text(encoding="utf-8")
    ambiguous = [
        item for item in review.get("entries", [])
        if item.get("reviewReason") == "ambiguous-word-form"
    ]
    failures = []
    if f"共 {len(ambiguous)} 条歧义记录" not in report:
        failures.append("报告歧义记录数量与审核模板不一致")

    for item in ambiguous:
        word = str(item.get("textbookWord", ""))
        row = next((line for line in report.splitlines() if line.startswith(f"| {word} |")), "")
        if not row:
            failures.append(f"报告缺少教材词: {word}")
            continue
        for prototype in item.get("prototypeCandidates", []):
            if f"`{prototype}` / ID `" not in row:
                failures.append(f"报告缺少候选 {prototype}: {word}")
        if "`pending`" not in row:
            failures.append(f"报告状态不是 pending: {word}")

    # The report is evidence for review only; it must never imply a runtime approval.
    if re.search(r"共 \d+ 条歧义记录；当前不自动导出任何映射。", report) is None:
        failures.append("报告缺少禁止自动导出的声明")

    if failures:
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"first-wave candidate report: PASS ({len(ambiguous)} ambiguous entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
