"""Create a small UTF-8 exam fixture from the verified read-only export."""

import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path
from exam_export_fields import explanation_fields


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/remote_7500km/production_7500km_com__n_exam_question.csv.gz'
ORIGINAL_TEXT_SOURCE = ROOT / 'data/remote_7500km/production_7500km_com__n_exam_original_text.csv.gz'
TARGET = ROOT / 'data/content_samples/exam_practice_sample.json'


def main():
    original_text = {}
    with gzip.open(ORIGINAL_TEXT_SOURCE, 'rt', encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            original_text[row.get('exam_original_text_uuid', '')] = row
    grouped = defaultdict(list)
    with gzip.open(SOURCE, 'rt', encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            if not row.get('question_content', '').strip() or not row.get('right_result', '').strip():
                continue
            paper_id = row.get('examination_paper_uuid') or 'unknown'
            original = original_text.get(row.get('exam_original_text_uuid', ''), {})
            grouped[paper_id].append({
                'id': row.get('exam_question_id'),
                'paperId': paper_id,
                'questionType': row.get('exam_question_type', ''),
                'originalTextUuid': row.get('exam_original_text_uuid', ''),
                'audioUrl': original.get('audio_url', ''),
                'question_content': row.get('question_content', ''),
                'a_item': row.get('a_item', ''),
                'b_item': row.get('b_item', ''),
                'c_item': row.get('c_item', ''),
                'd_item': row.get('d_item', ''),
                'right_result': row.get('right_result', ''),
                **explanation_fields(row),
                'translate': row.get('translate', ''),
                'point': row.get('point', ''),
            })
            if len(grouped[paper_id]) >= 8:
                break

    if not grouped:
        raise RuntimeError('no answer-ready questions found')

    paper_id, questions = next(iter(grouped.items()))
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps({
        'source': 'data/remote_7500km/production_7500km_com__n_exam_question.csv.gz',
        'paperId': paper_id,
        'questions': questions,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'written={TARGET}; questions={len(questions)}; paper={paper_id}')


if __name__ == '__main__':
    main()
