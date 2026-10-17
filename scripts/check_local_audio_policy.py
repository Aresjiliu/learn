"""Keep local exam audio playback disabled until mapped audio files exist."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config.js"
EXAM_AUDIO_ROOT = Path(r"D:\project\weixin\media\exam_audio")


def main() -> int:
    source = CONFIG.read_text(encoding="utf-8")
    enabled = bool(re.search(r"\benableLocalTestAudio\s*:\s*true\b", source))
    files = sorted(
        path for path in EXAM_AUDIO_ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in {".mp3", ".wav", ".m4a", ".aac", ".ogg"}
    ) if EXAM_AUDIO_ROOT.exists() else []
    result = {
        "audioRoot": str(EXAM_AUDIO_ROOT),
        "mappedFileCount": len(files),
        "enableLocalTestAudio": enabled,
        "status": "pass" if files or not enabled else "needs-review",
    }
    print(json.dumps(result, ensure_ascii=False))
    if not files and enabled:
        print("- 没有本地 exam_audio 文件时不得开启 enableLocalTestAudio")
        return 1
    print("local audio policy: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
