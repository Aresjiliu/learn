"""Build a local textbook pronunciation cache from an owned, read-only export.

No remote address is stored here. Run with --source-base only when downloading.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import re
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
HASH_RE = re.compile(r"[0-9a-f]{32}\Z")
ID_RE = re.compile(r"[0-9]+\Z")
MAX_AUDIO_BYTES = 2 * 1024 * 1024


def valid_mp3(data: bytes) -> bool:
    """Require two consecutive MPEG Layer III frames, not just an ID3 label."""
    if len(data) < 8:
        return False
    offset = 0
    if data.startswith(b"ID3"):
        if len(data) < 10 or any(byte & 0x80 for byte in data[6:10]):
            return False
        offset = 10 + ((data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9])
        if data[5] & 0x10:
            offset += 10

    bitrates_mpeg1 = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
    bitrates_mpeg2 = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
    sample_rates = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}

    def frame_size(position: int) -> int:
        if position + 4 > len(data):
            return 0
        header = int.from_bytes(data[position:position + 4], "big")
        version = (header >> 19) & 3
        bitrate_index = (header >> 12) & 15
        rate_index = (header >> 10) & 3
        if header >> 21 != 0x7FF or version not in sample_rates or (header >> 17) & 3 != 1:
            return 0
        if bitrate_index in (0, 15) or rate_index == 3:
            return 0
        bitrate = (bitrates_mpeg1 if version == 3 else bitrates_mpeg2)[bitrate_index]
        rate = sample_rates[version][rate_index]
        return (144000 if version == 3 else 72000) * bitrate // rate + ((header >> 9) & 1)

    for position in range(offset, min(offset + 2048, len(data) - 7)):
        size = frame_size(position)
        if size and frame_size(position + size):
            return True
    return False


def collect_candidates(words_path: Path, export_path: Path) -> dict[str, str]:
    words = json.loads(words_path.read_text(encoding="utf-8"))["words"]
    allowed = set()
    for item in words:
        word_id = str(item["id"])
        if not ID_RE.fullmatch(word_id) or word_id in allowed:
            raise ValueError("invalid or duplicate textbook word ID")
        allowed.add(word_id)
    candidates = {}
    opener = gzip.open if export_path.suffix == ".gz" else open
    with opener(export_path, "rt", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or not {"id", "change_form_sound"}.issubset(reader.fieldnames):
            raise ValueError("export lacks id or change_form_sound")
        seen = set()
        for row in reader:
            word_id = str(row["id"] or "").strip()
            if word_id not in allowed:
                continue
            if word_id in seen:
                raise ValueError("duplicate export word ID")
            seen.add(word_id)
            sound_hash = str(row["change_form_sound"] or "").strip()
            if sound_hash:
                if not HASH_RE.fullmatch(sound_hash):
                    raise ValueError("unsafe sound hash for word ID " + word_id)
                candidates[word_id] = sound_hash
    return candidates


def _fetch(url: str, max_bytes: int) -> tuple[bytes, str]:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, msg, headers, newurl):
            raise ValueError("audio redirect is not allowed")

    request = urllib.request.Request(url, headers={"Accept": "audio/mpeg"})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
        length = response.headers.get("Content-Length")
        if length and int(length) > max_bytes:
            raise ValueError("audio too large")
        data = response.read(max_bytes + 1)
        return data, response.headers.get("Content-Type", "")


def cache_audio(candidates: dict[str, str], cache_dir: Path, source_base: str,
                fetch=_fetch, max_bytes: int = MAX_AUDIO_BYTES) -> dict:
    parts = urlsplit(source_base)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("--source-base must be a plain HTTP(S) directory URL")
    if max_bytes < 16:
        raise ValueError("max_bytes too small")
    cache_dir.mkdir(parents=True, exist_ok=True)
    summary = {"downloaded": 0, "skipped": 0, "failed": [], "bytes": 0}
    for word_id, sound_hash in candidates.items():
        if not ID_RE.fullmatch(str(word_id)) or not HASH_RE.fullmatch(sound_hash):
            raise ValueError("unsafe word ID or audio hash")
        destination = cache_dir / (sound_hash + ".mp3")
        if destination.is_file() and destination.stat().st_size <= max_bytes and valid_mp3(destination.read_bytes()):
            summary["skipped"] += 1
            continue
        temporary = None
        try:
            data, mime = fetch(source_base.rstrip("/") + "/" + sound_hash + ".mp3", max_bytes)
            if len(data) > max_bytes or not valid_mp3(data) or mime.split(";", 1)[0].lower().strip() not in {"audio/mpeg", "audio/mp3", "audio/mpeg3", "application/octet-stream"}:
                raise ValueError("invalid MP3 response")
            with tempfile.NamedTemporaryFile(mode="wb", dir=cache_dir, suffix=".part", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(data)
            os.replace(temporary, destination)
            summary["downloaded"] += 1
            summary["bytes"] += len(data)
        except (OSError, ValueError, urllib.error.URLError):
            summary["failed"].append(str(word_id))
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
    return summary


def build_index(candidates: dict[str, str], cache_dir: Path) -> dict[str, str]:
    index = {}
    for word_id, sound_hash in candidates.items():
        if not ID_RE.fullmatch(str(word_id)) or not HASH_RE.fullmatch(sound_hash):
            raise ValueError("unsafe word ID or audio hash")
        audio_file = cache_dir / (sound_hash + ".mp3")
        if audio_file.is_file() and audio_file.stat().st_size <= MAX_AUDIO_BYTES and valid_mp3(audio_file.read_bytes()):
            index[str(word_id)] = audio_file.name
    return index


def write_index(index: dict[str, str], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    content = "module.exports = " + json.dumps(index, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output_path.parent, suffix=".part", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
    os.replace(temporary, output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--words", type=Path, default=ROOT / "data/content_samples/book_1_words.json")
    parser.add_argument("--export", type=Path, default=ROOT / "data/remote_7500km/production_7500km_com__n_study_book_word.csv.gz")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "audio/wordaudio")
    parser.add_argument("--output", type=Path, default=ROOT / "data/content_samples/book_1_audio.js")
    parser.add_argument("--source-base", help="explicit source directory URL; omit for offline index-only mode")
    parser.add_argument("--limit", type=int, help="download only the first N candidate words for a smoke test")
    args = parser.parse_args()
    candidates = collect_candidates(args.words, args.export)
    summary = {"downloaded": 0, "skipped": 0, "failed": [], "bytes": 0}
    if args.source_base:
        if args.limit is not None and args.limit < 1:
            parser.error("--limit must be positive")
        selected = dict(list(candidates.items())[:args.limit]) if args.limit else candidates
        summary = cache_audio(selected, args.cache_dir, args.source_base)
    index = build_index(candidates, args.cache_dir)
    write_index(index, args.output)
    print(json.dumps({"candidates": len(candidates), "cached": len(index), **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
