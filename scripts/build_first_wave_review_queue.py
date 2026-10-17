"""Build a non-authoritative, human-review queue for first-wave mappings."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "docs/phase0/first-wave-mapping-review.json"
OUTPUT = ROOT / "docs/phase0/first-wave-review-queue.md"


def classify(item: dict) -> tuple[str, str]:
    word = str(item.get("textbookWord", "")).strip()
    meaning = str(item.get("textbookMeaning", "")).strip()
    reason = item.get("reviewReason")
    if reason == "ambiguous-word-form":
        return "歧义词形", "结合词性、教材释义和上下文选择原型"
    if "影片" in meaning or "《" in meaning:
        return "作品名/专名", "保留教材词条；仅在主词典有可靠独立条目时映射"
    if any(char.isspace() for char in word) or "-" in word or "/" in str(item.get("textbookMeaning", "")):
        return "短语/复合表达", "优先作为教材词条展示，不强行拆分映射"
    if word[:1].isupper():
        return "专名/地名", "核对主词典是否有同名条目和来源 ID"
    if word in {"выстовочный", "чтокасаетсякого-чегото"}:
        return "疑似录入问题", "先回看教材原页或音频，再决定修正或标记 needs-more-data"
    return "普通单词", "核对词典缺失原因、词性和教材释义后再决定"


def main() -> None:
    report = json.loads(INPUT.read_text(encoding="utf-8"))
    groups = defaultdict(list)
    for item in report.get("entries", []):
        category, action = classify(item)
        groups[category].append({**item, "category": category, "action": action})

    order = ["歧义词形", "疑似录入问题", "作品名/专名", "专名/地名", "短语/复合表达", "普通单词"]
    lines = [
        "# 首发教材词汇人工复核队列",
        "",
        f"本文件覆盖全部 {len(report.get('entries', []))} 条审核记录，由 `build_first_wave_review_queue.py` 根据审核模板生成，仅用于安排人工复核顺序。分类是规则化初筛，不是语言学结论；不会改变 `first-wave-mapping-review.json`，也不会进入运行时映射。",
        "",
        "## 分类统计",
        "",
        "| 类别 | 数量 |",
        "| --- | ---: |",
    ]
    counts = Counter(item["category"] for values in groups.values() for item in values)
    lines.extend(f"| {category} | {counts.get(category, 0)} |" for category in order if counts.get(category, 0))
    lines.extend(["", "## 逐条队列", ""])
    for category in order:
        items = sorted(groups.get(category, []), key=lambda item: (item.get("bookName", ""), item.get("textbookWord", "")))
        if not items:
            continue
        lines.extend([f"### {category}", "", "| 教材 | 词条 | 教材释义 | 当前状态 | 建议动作 |", "| --- | --- | --- | --- | --- |"])
        for item in items:
            meaning = " ".join(str(item.get("textbookMeaning", "")).split()).replace("|", "\\|")
            word = str(item.get("textbookWord", "")).replace("|", "\\|")
            lines.append(f"| {item.get('bookName', '')} | `{word}` | {meaning} | `{item.get('decisionStatus', 'pending')}` | {item['action']} |")
        lines.append("")
    lines.append("所有记录当前仍需人工审核；批准时必须填写 `selectedPrototype`、`dictionaryId` 和 `reviewNote`，然后重新导出运行时决策。")
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"entryCount": len(report.get("entries", [])), "output": str(OUTPUT), "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
