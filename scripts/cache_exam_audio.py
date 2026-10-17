"""Cache owned exam-sample MP3s and publish only validated local filenames."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from pathlib import Path

from cache_word_audio import HASH_RE, ID_RE, MAX_AUDIO_BYTES, cache_audio, valid_mp3


ROOT = Path(__file__).resolve().parents[1]
AUDIO_PATH_RE = re.compile(r"/exam_audio/([0-9a-f]{32})\.mp3\Z")


def collect_exam_candidates(sample_path: Path) -> dict[str, str]:
    questions = json.loads(sample_path.read_text(encoding="utf-8"))["questions"]
    if not isinstance(questions, list):
        raise ValueError("sample questions must be a list")
    candidates = {}
    seen_question_ids = set()
    for question in questions:
        question_id = str(question.get("id", ""))
        if not ID_RE.fullmatch(question_id) or question_id in seen_question_ids:
            raise ValueError("invalid or duplicate question ID")
        seen_question_ids.add(question_id)
        audio_path = str(question.get("audioUrl") or question.get("audio_url") or "")
        if not audio_path:
            continue
        match = AUDIO_PATH_RE.fullmatch(audio_path)
        if not match:
            raise ValueError("unsafe exam audio path for question " + question_id)
        candidates[question_id] = match.group(1)
    return candidates


def build_exam_manifest(candidates: dict[str, str], cache_dir: Path) -> list[str]:
    files = set()
    for question_id, sound_hash in candidates.items():
        if not ID_RE.fullmatch(question_id) or not HASH_RE.fullmatch(sound_hash):
            raise ValueError("unsafe question ID or audio hash")
        path = cache_dir / (sound_hash + ".mp3")
        if path.is_file() and path.stat().st_size <= MAX_AUDIO_BYTES and valid_mp3(path.read_bytes()):
            files.add(path.name)
    return sorted(files)


def write_exam_manifest(files: list[str], output_path: Path) -> None:
    if any(not re.fullmatch(r"[0-9a-f]{32}\.mp3", name) for name in files):
        raise ValueError("unsafe exam audio filename")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    content = "module.exports = " + json.dumps({"files": sorted(set(files))}, separators=(",", ":")) + "\n"
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output_path.parent, suffix=".part", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
    os.replace(temporary, output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", type=Path, default=ROOT / "data/content_samples/exam_practice_sample.json")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "audio/exam_audio")
    parser.add_argument("--output", type=Path, default=ROOT / "data/content_samples/exam_audio.js")
    parser.add_argument("--source-base", help="explicit source directory URL; omit for offline manifest-only mode")
    args = parser.parse_args()
    candidates = collect_exam_candidates(args.sample)
    summary = {"downloaded": 0, "skipped": 0, "failed": [], "bytes": 0}
    if args.source_base:
        summary = cache_audio(candidates, args.cache_dir, args.source_base)
    files = build_exam_manifest(candidates, args.cache_dir)
    write_exam_manifest(files, args.output)
    print(json.dumps({"questionsWithAudio": len(candidates), "cachedFiles": len(files), **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
