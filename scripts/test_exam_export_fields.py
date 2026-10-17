import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exam_export_fields import explanation_fields


class ExplanationFieldsTests(unittest.TestCase):
    def test_source_instruction_is_not_answer_explanation(self):
        result = explanation_fields({'analysis': '', 'exam_explain': '听录音，选择选项中的正确答案。'})
        self.assertEqual(result, {'analysis': '', 'instruction': '听录音，选择选项中的正确答案。'})

    def test_real_analysis_remains_separate_from_instruction(self):
        result = explanation_fields({'analysis': '名词第六格', 'exam_explain': '选出正确答案'})
        self.assertEqual(result, {'analysis': '名词第六格', 'instruction': '选出正确答案'})


if __name__ == '__main__':
    unittest.main()
