"""Validate app.json fields that commonly fail in WeChat DevTools."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ALLOWED_TABBAR_KEYS = {"color", "selectedColor", "backgroundColor", "borderStyle", "list", "position", "custom"}
ALLOWED_TABBAR_ITEM_KEYS = {"pagePath", "text", "iconPath", "selectedIconPath"}


def main():
    config_path = ROOT / "app.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    failures = []
    tabbar = config.get("tabBar", {})
    failures.extend(f"tabBar contains unsupported key: {key}" for key in tabbar if key not in ALLOWED_TABBAR_KEYS)
    for index, item in enumerate(tabbar.get("list", [])):
        failures.extend(f"tabBar.list[{index}] contains unsupported key: {key}" for key in item if key not in ALLOWED_TABBAR_ITEM_KEYS)
        for field in ("iconPath", "selectedIconPath"):
            value = item.get(field)
            if value and not (ROOT / value).exists():
                failures.append(f"tabBar.list[{index}].{field} missing: {value}")
    if failures:
        print("\n".join(failures))
        raise SystemExit(1)
    print(f"app config: PASS ({len(config.get('pages', []))} pages)")


if __name__ == "__main__":
    main()
