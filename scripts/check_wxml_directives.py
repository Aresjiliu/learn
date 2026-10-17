"""Check WXML directive combinations that are easy to break in DevTools."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def opening_tags(text):
    # Keep the matcher deliberately narrow: it validates opening tags only and
    # leaves full WXML parsing to WeChat DevTools.
    return re.findall(r"<(?!/|!|\?)[A-Za-z][\w-]*(?:\s[^<>]*?)?/?\s*>", text, re.DOTALL)


def main():
    errors = []
    for path in sorted((ROOT / "pages").glob("**/*.wxml")):
        for number, tag in enumerate(opening_tags(path.read_text(encoding="utf-8")), start=1):
            if "wx:for" in tag and "wx:key" not in tag:
                errors.append(f"{path.relative_to(ROOT)}: opening tag near block {number} has wx:for without wx:key")
            if "wx:for" in tag and ("wx:if" in tag or "wx:elif" in tag or "wx:else" in tag):
                errors.append(f"{path.relative_to(ROOT)}: opening tag near block {number} mixes wx:for with conditional directive")
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    print("wxml directives: PASS")


if __name__ == "__main__":
    main()
