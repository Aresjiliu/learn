"""Ensure raw exports and development-only directories are excluded from the Mini Program package."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FOLDERS = {".git", "audio", "videos", "content_server", "data/remote_7500km", "data/generated", "docs", "scripts", "tasks", "learn", "lingosnake-main", "miniprogram-demo-master"}
REQUIRED_FILES = {
    "data/content_samples/books.json",
    "data/content_samples/book_1_words.json",
    "data/content_samples/categories.json",
    "data/content_samples/book_13_words.json",
    "data/content_samples/book_word_forms.json",
    "data/content_samples/dictionary_words.json",
    "data/content_samples/exam_fillin_sample.json",
    "data/content_samples/exam_papers.json",
    "data/content_samples/exam_practice_sample.json",
}


def main():
    config = json.loads((ROOT / "project.config.json").read_text(encoding="utf-8"))
    ignored = config.get("packOptions", {}).get("ignore", [])
    folders = {item.get("value") for item in ignored if item.get("type") == "folder"}
    files = {item.get("value") for item in ignored if item.get("type") == "file"}
    missing = sorted(REQUIRED_FOLDERS - folders)
    missing_files = sorted(REQUIRED_FILES - files)
    if missing or missing_files:
        if missing:
            print("packOptions 缺少排除目录: " + ", ".join(missing))
        if missing_files:
            print("packOptions 缺少排除源文件: " + ", ".join(missing_files))
        raise SystemExit(1)
    print("pack options: PASS (raw exports, source JSON, and development directories excluded)")


if __name__ == "__main__":
    main()
