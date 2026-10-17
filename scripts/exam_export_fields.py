"""Keep source task instructions separate from answer explanations."""


def explanation_fields(row):
    return {
        'analysis': str(row.get('analysis') or '').strip(),
        'instruction': str(row.get('exam_explain') or '').strip(),
    }
