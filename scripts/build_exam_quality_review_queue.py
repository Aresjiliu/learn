"""Build a compact, non-runtime review queue for questionable exam rows."""

from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "data" / "remote_7500km"
OUTPUT = ROOT / "docs" / "phase0" / "exam-quality-review-queue.json"
MAX_TEXT_ANSWER_LENGTH = 80


def text(row: dict[str, str], field: str) -> str:
    return str(row.get(field, "")).strip()


def corrupt_fields(row: dict[str, str]) -> list[str]:
    return [
        field for field in (
            "question_content", "right_result", "analysis",
            "a_item", "b_item", "c_item", "d_item", "e_item",
        )
        if "�" in str(row.get(field, ""))
    ]


def main() -> None:
    queue: list[dict[str, object]] = []
    source = EXPORTS / "production_7500km_com__n_exam_question.csv.gz"
    with gzip.open(source, "rt", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            reasons: list[str] = []
            answer = text(row, "right_result")
            if not text(row, "question_content"):
                reasons.append("blank-question")
            if not any(text(row, f"{key}_item") for key in "abcde") and len(answer) > MAX_TEXT_ANSWER_LENGTH:
                reasons.append("long-text-answer")
            fields = corrupt_fields(row)
            if fields:
                reasons.append("corrupt-text")
            if not reasons:
                continue
            queue.append({
                "questionId": row.get("exam_question_id", ""),
                "paperUuid": row.get("examination_paper_uuid", ""),
                "questionType": row.get("exam_question_type", ""),
                "reasons": reasons,
                "answerLength": len(answer),
                "corruptFields": fields,
            })
    queue.sort(key=lambda item: (str(item["paperUuid"]), str(item["questionId"])))
    output = {
        "policy": {
            "blank-question": "补录题干或确认删除。",
            "long-text-answer": "确认是否确实要求整句作答；否则补充标准化判分规则。",
            "corrupt-text": "重新导出或人工校正损坏字段，禁止直接发布。",
            "runtime": "本文件仅供人工审核，不进入小程序运行时。",
        },
        "summary": {
            "queueCount": len(queue),
            "blankQuestionCount": sum("blank-question" in item["reasons"] for item in queue),
            "longTextAnswerCount": sum("long-text-answer" in item["reasons"] for item in queue),
            "corruptTextCount": sum("corrupt-text" in item["reasons"] for item in queue),
        },
        "items": queue,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
