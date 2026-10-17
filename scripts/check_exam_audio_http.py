"""Read-only smoke test for every cached exam audio URL on the local server."""

import json
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
manifest_source = (ROOT / "data/content_samples/exam_audio.js").read_text(encoding="utf-8")
files = json.loads(manifest_source.removeprefix("module.exports = "))["files"]
base = "http://127.0.0.1:18090/exam_audio/"

for name in files:
    with urlopen(Request(base + name, method="HEAD"), timeout=5) as response:
        assert response.status == 200, name
        assert response.headers.get_content_type() == "audio/mpeg", name
        assert int(response.headers["Content-Length"]) > 1024, name
    with urlopen(Request(base + name, headers={"Range": "bytes=0-1023"}), timeout=5) as response:
        assert response.status == 206, name
        assert int(response.headers["Content-Length"]) == 1024, name
        assert len(response.read()) == 1024, name

print(f"exam audio HTTP: PASS ({len(files)} MP3 files)")
