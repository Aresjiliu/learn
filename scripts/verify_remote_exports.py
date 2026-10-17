from __future__ import annotations

import csv
import gzip
import hashlib
import json
from pathlib import Path


root = Path("data/remote_7500km")
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
bad: list[tuple[str, str]] = []
total_rows = 0
names = []

for record in manifest["tables"]:
    path = root / record["file"]
    names.append(record["table"])
    if not path.exists() or path.stat().st_size <= 0:
        bad.append((record["file"], "missing/empty"))
        continue

    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != record["sha256"]:
        bad.append((record["file"], "sha256 mismatch"))

    with gzip.open(path, "rt", encoding="utf-8", newline="") as source:
        reader = csv.reader(source)
        next(reader)
        rows = sum(1 for _ in reader)
    if rows != record["rows_exported"]:
        bad.append((record["file"], "row count mismatch"))
    total_rows += rows

user_like = [
    name for name in names
    if any(token in name.lower() for token in ("user", "order", "track", "log", "buy", "account"))
]
print(f"tables={len(manifest['tables'])}")
print(f"rows={total_rows}")
print(f"compressed_bytes={sum(path.stat().st_size for path in root.glob('*.csv.gz'))}")
print(f"bad={bad}")
print(f"user_like_tables={user_like}")
assert not bad
assert len(manifest["tables"]) == 19
assert total_rows == 3_776_217
assert not user_like

