"""Inventory local media and UI assets without copying or opening media content."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "phase0" / "media-inventory.json"
ASSET_ROOTS = [
    Path(r"D:\project\weixin\media"),
    ROOT / "images",
    ROOT / "static",
]
MEDIA_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
    ".mp4", ".m3u8", ".mov", ".webm", ".avi",
}


def record(path: Path) -> dict[str, object]:
    stat = path.stat()
    return {
        "path": str(path),
        "extension": path.suffix.lower(),
        "sizeBytes": stat.st_size,
        "modifiedTime": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "status": "local-test-only",
    }


def main() -> None:
    records: list[dict[str, object]] = []
    seen: set[str] = set()
    for root in ASSET_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in MEDIA_EXTENSIONS:
                continue
            key = str(path.resolve()).lower()
            if key in seen:
                continue
            seen.add(key)
            records.append(record(path.resolve()))

    records.sort(key=lambda item: str(item["path"]).lower())
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "roots": [str(root) for root in ASSET_ROOTS],
        "policy": "Local files are development evidence only; authorization and production availability are unverified.",
        "assets": records,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"assets={len(records)}")
    print(f"output={OUTPUT}")


if __name__ == "__main__":
    main()
