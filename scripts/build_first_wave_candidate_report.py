"""Build an auditable candidate view for ambiguous first-wave mappings."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "docs/phase0/first-wave-mapping-review.json"
FORMS = ROOT / "data/content_samples/book_word_forms.json"
OUTPUT = ROOT / "docs/phase0/first-wave-candidate-report.md"


def main() -> None:
    review = json.loads(REVIEW.read_text(encoding="utf-8"))
    forms = json.loads(FORMS.read_text(encoding="utf-8")).get("byWord", {})
    rows = []
    for item in review.get("entries", []):
        if item.get("reviewReason") != "ambiguous-word-form":
            continue
        normalized = str(item.get("normalized", "")).strip().lower()
        indexed_candidates = forms.get(normalized, [])
        indexed_by_prototype = {
            str(candidate.get("prototype", "")).strip(): candidate
            for candidate in indexed_candidates
        }
        candidates = []
        for prototype in item.get("prototypeCandidates", []):
            prototype = str(prototype).strip()
            candidate = indexed_by_prototype.get(prototype, {"prototype": prototype})
            candidates.append(candidate)
        candidate_text = "<br>".join(
            f"`{candidate.get('prototype', '')}` / ID `{candidate.get('sourceId', '未提供')}` / {candidate.get('word_character', '需核对')}"
            for candidate in candidates
        ) or "（索引中无候选，需补充词典或上下文）"
        rows.append({
            "word": item.get("textbookWord", ""),
            "meaning": str(item.get("textbookMeaning", "")).replace("\n", " "),
            "candidates": candidate_text,
            "status": item.get("decisionStatus", "pending"),
        })

    lines = [
        "# 首发教材歧义映射候选报告",
        "",
        "本报告由 `build_first_wave_candidate_report.py` 从审核模板和词形索引生成，仅提供候选证据，不代表批准结果。最终决定必须结合教材上下文、词义和词性后填写审核模板。",
        "",
        "| 教材词 | 教材释义 | 词形索引候选（原型 / 来源 ID / 词性） | 当前状态 |",
        "| --- | --- | --- | --- |",
    ]
    lines.extend(f"| {row['word']} | {row['meaning']} | {row['candidates']} | `{row['status']}` |" for row in rows)
    lines.extend(["", f"共 {len(rows)} 条歧义记录；当前不自动导出任何映射。"])
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"ambiguousEntries": len(rows), "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
