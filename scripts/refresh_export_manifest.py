"""Refresh local export hashes without contacting the remote database."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


root = Path("data/remote_7500km")
manifest_path = root / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
for record in manifest["tables"]:
    path = root / record["file"]
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    record["sha256"] = digest.hexdigest()
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Refreshed hashes for {len(manifest['tables'])} local exports")

