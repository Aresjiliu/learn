"""Ensure the human-readable exam report reflects the generated JSON summary."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JSON_REPORT = ROOT / "docs/phase0/exam-selection-report.json"
MARKDOWN_REPORT = ROOT / "docs/phase0/exam-selection-report.md"

summary = json.loads(JSON_REPORT.read_text(encoding="utf-8"))["summary"]
markdown = MARKDOWN_REPORT.read_text(encoding="utf-8")
expected = {
    "selectedQuestionCount": f"{summary['selectedQuestionCount']:,}",
    "practiceReadyPapers": f"{summary['practiceReadyPapers']:,}",
    "analysisReadyPapers": f"{summary['analysisReadyPapers']:,}",
}
missing = [f"{key}={value}" for key, value in expected.items() if value not in markdown]
if missing:
    raise SystemExit("报告 Markdown 与 JSON 摘要不一致: " + ", ".join(missing))
print("content report consistency: PASS")
