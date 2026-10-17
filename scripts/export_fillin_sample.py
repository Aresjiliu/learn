"""Create a small verified fill-in exam fixture for Mini Program testing."""

from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/remote_7500km/production_7500km_com__n_exam_question.csv.gz'
PAPER_ID = '112df13e3990437b8cd021c79fc18b3c'
TARGET = ROOT / 'data/content_samples/exam_fillin_sample.json'


def main() -> None:
    questions = []
    with gzip.open(SOURCE, 'rt', encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            if row.get('examination_paper_uuid') != PAPER_ID or row.get('exam_question_type') != '4':
                continue
            if not row.get('question_content', '').strip() or not row.get('right_result', '').strip():
                continue
            questions.append({
                'id': row.get('exam_question_id'),
                'paperId': PAPER_ID,
                'questionType': row.get('exam_question_type', ''),
                'question_content': row.get('question_content', ''),
                'a_item': '', 'b_item': '', 'c_item': '', 'd_item': '',
                'right_result': row.get('right_result', ''),
                'analysis': row.get('exam_explain', ''),
                'translate': row.get('translate', ''),
                'point': row.get('point', ''),
            })
            if len(questions) >= 8:
                break
    if len(questions) < 5:
        raise RuntimeError('not enough fill-in questions')
    TARGET.write_text(json.dumps({
        'source': 'data/remote_7500km/production_7500km_com__n_exam_question.csv.gz',
        'paperId': PAPER_ID,
        'questions': questions,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'written={TARGET}; questions={len(questions)}; paper={PAPER_ID}')


if __name__ == '__main__':
    main()
