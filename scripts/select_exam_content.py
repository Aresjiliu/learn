"""Select usable exam questions and papers from verified local exports."""

from __future__ import annotations

import csv
import gzip
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "data" / "remote_7500km"
OUTPUT = ROOT / "docs" / "phase0" / "exam-selection-report.json"
TEXT_ANSWER_REVIEW_LENGTH = 80


def read_rows(filename: str):
    with gzip.open(EXPORTS / filename, "rt", encoding="utf-8", newline="") as source:
        yield from csv.DictReader(source)


def nonempty(row: dict[str, str], field: str) -> bool:
    value = str(row.get(field, "")).strip()
    return bool(value) and "�" not in value


def has_corrupt_text(row: dict[str, str]) -> bool:
    return any("�" in str(row.get(field, "")) for field in (
        "question_content", "right_result", "analysis",
        "a_item", "b_item", "c_item", "d_item", "e_item",
    ))


def answer_is_selectable(row: dict[str, str]) -> bool:
    """Match the runtime rule: an answer must point to a non-empty option."""
    if not nonempty(row, "right_result"):
        return False
    answer = str(row.get("right_result", "")).strip().lower()
    option_keys = {
        key
        for key in ("a", "b", "c", "d", "e")
        if nonempty(row, f"{key}_item")
    }
    return not option_keys or answer in option_keys


def answer_is_practice_ready(row: dict[str, str]) -> bool:
    if not answer_is_selectable(row):
        return False
    has_options = any(nonempty(row, f"{key}_item") for key in ("a", "b", "c", "d", "e"))
    return has_options or len(str(row.get("right_result", "")).strip()) <= TEXT_ANSWER_REVIEW_LENGTH


def main() -> None:
    papers = {
        row.get("examincation_paper_uuid", ""): {
            "id": row.get("examination_paper_id", ""),
            "title": row.get("title", ""),
            "type": row.get("examincation_paper_type", ""),
            "status": row.get("status", ""),
            "totalScore": row.get("total_score", ""),
        }
        for row in read_rows("production_7500km_com__n_examincation_paper.csv.gz")
        if row.get("examincation_paper_uuid")
    }
    original_text = {
        row.get("exam_original_text_uuid", ""): row
        for row in read_rows("production_7500km_com__n_exam_original_text.csv.gz")
        if row.get("exam_original_text_uuid")
    }
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in read_rows("production_7500km_com__n_exam_question.csv.gz"):
        grouped[row.get("examination_paper_uuid", "")].append(row)

    paper_reports = []
    selected_question_ids: list[str] = []
    for uuid, questions in grouped.items():
        answer_ready = [
            q for q in questions
            if nonempty(q, "question_content") and answer_is_practice_ready(q)
        ]
        text_answer_candidates = [
            q for q in questions
            if nonempty(q, "question_content")
            and answer_is_selectable(q)
            and not any(nonempty(q, f"{key}_item") for key in ("a", "b", "c", "d", "e"))
        ]
        explanation_ready = [q for q in answer_ready if nonempty(q, "analysis")]
        text_answer_ready = [q for q in answer_ready if not any(nonempty(q, f"{key}_item") for key in ("a", "b", "c", "d", "e"))]
        choice_answer_ready = [q for q in answer_ready if q not in text_answer_ready]
        blank_question_count = sum(not nonempty(q, "question_content") for q in questions)
        corrupt_text_count = sum(has_corrupt_text(q) for q in questions)
        long_text_answer_count = sum(
            len(str(q.get("right_result", "")).strip()) > TEXT_ANSWER_REVIEW_LENGTH
            for q in text_answer_candidates
        )
        audio_ready = [q for q in questions if nonempty(original_text.get(q.get("exam_original_text_uuid", ""), {}), "audio_url")]
        type_counts = Counter(q.get("exam_question_type", "") or "unknown" for q in questions)
        total = len(questions)
        answer_rate = len(answer_ready) / total if total else 0
        explanation_rate = len(explanation_ready) / len(answer_ready) if answer_ready else 0
        audio_rate = len(audio_ready) / total if total else 0
        practice_ready = total >= 5 and answer_rate >= 0.8
        analysis_ready = practice_ready and explanation_rate >= 0.8
        if practice_ready:
            selected_question_ids.extend(q.get("exam_question_id", "") for q in answer_ready)
        paper_reports.append({
            "paperUuid": uuid,
            "paper": papers.get(uuid, {}),
            "questionCount": total,
            "answerReadyCount": len(answer_ready),
            "textAnswerCount": len(text_answer_ready),
            "choiceAnswerCount": len(choice_answer_ready),
            "blankQuestionCount": blank_question_count,
            "corruptTextCount": corrupt_text_count,
            "longTextAnswerCount": long_text_answer_count,
            "explanationReadyCount": len(explanation_ready),
            "answerRate": round(answer_rate, 6),
            "explanationRate": round(explanation_rate, 6),
            "audioReadyCount": len(audio_ready),
            "audioRate": round(audio_rate, 6),
            "questionTypeCounts": dict(sorted(type_counts.items())),
            "practiceReady": practice_ready,
            "analysisReady": analysis_ready,
        })

    paper_reports.sort(key=lambda item: (-int(item["practiceReady"]), -item["answerRate"], item["paperUuid"]))
    output = {
        "policy": {
            "practiceReady": "至少 5 道题，题干和正确答案完整的题目比例 >= 80%；有选择项时答案必须对应非空选项，无选择项时按填空题放行。",
            "analysisReady": "practiceReady 且解析完整率 >= 80%；只有此级别允许展示‘含解析’标签。",
            "audio": "音频覆盖率单独统计；没有音频不阻断文字练习，但听力题在音频地址未验证前不显示可播放入口。",
            "excludedQuestions": "缺题干、正确答案、答案无法对应非空选项或文本答案超过 80 个字符的题目不进入练习；缺解析但答案完整的题目可进入基础练习，不展示解析。超长答案另行统计供人工复核。",
        },
        "papers": paper_reports,
        "summary": {
            "totalPapersWithQuestions": len(paper_reports),
            "practiceReadyPapers": sum(1 for item in paper_reports if item["practiceReady"]),
            "analysisReadyPapers": sum(1 for item in paper_reports if item["analysisReady"]),
            "papersWithAudio": sum(1 for item in paper_reports if item["audioReadyCount"]),
            "audioQuestionCount": sum(item["audioReadyCount"] for item in paper_reports),
            "selectedQuestionCount": len([item for item in selected_question_ids if item]),
            "answerReadyTextQuestionCount": sum(item["textAnswerCount"] for item in paper_reports),
            "answerReadyChoiceQuestionCount": sum(item["choiceAnswerCount"] for item in paper_reports),
            "blankQuestionCount": sum(item["blankQuestionCount"] for item in paper_reports),
            "corruptTextCount": sum(item["corruptTextCount"] for item in paper_reports),
            "longTextAnswerCount": sum(item["longTextAnswerCount"] for item in paper_reports),
        },
        "selectedQuestionIds": [item for item in selected_question_ids if item],
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
