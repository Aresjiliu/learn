"""Verify the exam review queue matches the generated quality report."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
report = json.loads((ROOT / "docs/phase0/exam-selection-report.json").read_text(encoding="utf-8"))["summary"]
queue = json.loads((ROOT / "docs/phase0/exam-quality-review-queue.json").read_text(encoding="utf-8"))
summary = queue["summary"]
items = queue["items"]

if summary["queueCount"] != len(items):
    raise SystemExit("题库复核队列数量与条目数不一致")
for key in ("blankQuestionCount", "longTextAnswerCount", "corruptTextCount"):
    if summary[key] != report[key]:
        raise SystemExit(f"题库复核队列与报告不一致: {key}={summary[key]} != {report[key]}")
if any(not item.get("questionId") or not item.get("reasons") for item in items):
    raise SystemExit("题库复核队列存在缺少 questionId 或 reasons 的条目")
print(f"exam quality review queue: PASS ({len(items)} items)")
