"""Validate Python files without creating __pycache__ directories."""

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FILES = sorted(ROOT.glob("scripts/*.py"))

pycache_dirs = list(ROOT.glob("scripts/**/__pycache__"))
if pycache_dirs:
    names = ", ".join(str(path.relative_to(ROOT)) for path in pycache_dirs)
    raise SystemExit(f"发现不应提交的 Python 缓存目录: {names}")


for path in FILES:
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

print("python syntax: PASS")
