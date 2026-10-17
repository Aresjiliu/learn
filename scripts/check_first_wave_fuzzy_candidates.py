"""Check that fuzzy candidates remain non-authoritative review evidence."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
review = json.loads((ROOT / "docs/phase0/first-wave-mapping-review.json").read_text(encoding="utf-8"))
report = json.loads((ROOT / "docs/phase0/first-wave-fuzzy-candidates.json").read_text(encoding="utf-8"))
markdown = (ROOT / "docs/phase0/first-wave-fuzzy-candidates.md").read_text(encoding="utf-8")
expected = [item for item in review["entries"] if item.get("reviewReason") == "main-dictionary-unmatched"]
if len(report["entries"]) != len(expected):
    raise SystemExit("模糊候选报告与未匹配记录数量不一致")
if report["summary"]["approvedCount"] != 0:
    raise SystemExit("模糊候选报告不得包含 approved 状态")
if any(item.get("decisionStatus") != "pending" for item in report["entries"]):
    raise SystemExit("模糊候选报告存在非 pending 记录")
if "仅基于拼写相似度" not in markdown or "不会进入运行时映射" not in markdown:
    raise SystemExit("模糊候选 Markdown 缺少非权威声明")
print(f"first-wave fuzzy candidates: PASS ({len(report['entries'])} unmatched entries)")
