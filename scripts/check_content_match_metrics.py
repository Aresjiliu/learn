"""Check the two explicitly documented content-match metrics."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUALITY = ROOT / "docs/phase0/content-quality-report.json"
MAPPING = ROOT / "docs/phase0/book-dictionary-comparison.json"


def main() -> int:
    quality = json.loads(QUALITY.read_text(encoding="utf-8"))
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    direct = quality["bookWords"]
    tiered = mapping["summary"]
    failures = []
    expected_direct = direct["matchedDictionaryWords"] / direct["distinctNormalizedWords"]
    expected_tiered = tiered["coveredByAnyTier"] / tiered["distinctBookWords"]
    if round(expected_direct, 6) != direct["matchRate"]:
        failures.append("content-quality-report.json 的直接命中率与计数不一致")
    if round(expected_tiered, 6) != tiered["coverageRate"]:
        failures.append("book-dictionary-comparison.json 的三级覆盖率与计数不一致")
    if direct["matchRate"] == tiered["coverageRate"]:
        failures.append("直接命中率和三级覆盖率不应被写成同一个指标")
    if failures:
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(
        "content match metrics: PASS "
        f"(direct={direct['matchRate']:.6f}, tiered={tiered['coverageRate']:.6f})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
