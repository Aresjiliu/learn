"""Fail closed unless every published local exam MP3 is present and valid."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from cache_word_audio import MAX_AUDIO_BYTES, valid_mp3


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config.js"
EXAM_AUDIO_ROOT = ROOT / "audio/exam_audio"
MANIFEST = ROOT / "data/content_samples/exam_audio.js"


def audit_audio(audio_root: Path, files: list[str], enabled: bool) -> dict:
    missing = []
    invalid = []
    for name in files:
        if not re.fullmatch(r"[0-9a-f]{32}\.mp3", name):
            invalid.append(name)
            continue
        path = audio_root / name
        if not path.is_file():
            missing.append(name)
        elif path.stat().st_size > MAX_AUDIO_BYTES or not valid_mp3(path.read_bytes()):
            invalid.append(name)
    return {
        "audioRoot": str(audio_root),
        "mappedFileCount": len(files),
        "missingCount": len(missing),
        "invalidCount": len(invalid),
        "enableLocalTestAudio": enabled,
        "status": "pass" if not enabled or (files and not missing and not invalid) else "needs-review",
    }


def main() -> int:
    source = CONFIG.read_text(encoding="utf-8")
    enabled = bool(re.search(r"\benableLocalTestAudio\s*:\s*true\b", source))
    content = MANIFEST.read_text(encoding="utf-8")
    prefix = "module.exports = "
    if not content.startswith(prefix):
        raise ValueError("exam audio manifest format invalid")
    files = json.loads(content[len(prefix):])["files"]
    result = audit_audio(EXAM_AUDIO_ROOT, files, enabled)
    print(json.dumps(result, ensure_ascii=False))
    if result["status"] != "pass":
        print("- 开启题库音频前，清单内每个 MP3 都必须在本地且通过校验")
        return 1
    print("local audio policy: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
