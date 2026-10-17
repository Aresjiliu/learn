"""Regression tests for offline exam-content quality rules."""

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("select_exam_content", ROOT / "scripts" / "select_exam_content.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)

assert MODULE.nonempty({"value": " 有效 "}, "value") is True
assert MODULE.nonempty({"value": "   "}, "value") is False
assert MODULE.nonempty({"value": "乱码�"}, "value") is False
assert MODULE.has_corrupt_text({"analysis": "解析�"}) is True
assert MODULE.has_corrupt_text({"analysis": "正常解析"}) is False
assert MODULE.answer_is_selectable({"right_result": "�"}) is False
assert MODULE.answer_is_selectable({"right_result": "a", "a_item": "A"}) is True
print("exam quality rules: PASS")
