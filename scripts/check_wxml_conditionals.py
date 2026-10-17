"""Validate same-level wx:if/wx:elif/wx:else chains in WXML files."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAG_RE = re.compile(r"<!--.*?-->|</?[^<>]+>", re.DOTALL)
OPEN_RE = re.compile(r"^<(?P<name>[A-Za-z][\w-]*)(?P<attrs>.*?)(?P<self>/?)>$", re.DOTALL)
CLOSE_RE = re.compile(r"^</(?P<name>[A-Za-z][\w-]*)\s*>$")


def directive(attrs, name):
    if name == "else":
        return bool(re.search(r"\bwx:else\b", attrs))
    return bool(re.search(rf"\bwx:{name}\s*=", attrs))


def check(path):
    errors = []
    stack = [{"name": "#root", "children": []}]
    for token in TAG_RE.findall(path.read_text(encoding="utf-8")):
        if token.startswith("<!--"):
            continue
        closing = CLOSE_RE.match(token)
        if closing:
            if len(stack) > 1:
                stack.pop()
            continue
        opening = OPEN_RE.match(token)
        if not opening:
            continue
        name = opening.group("name")
        attrs = opening.group("attrs")
        node = {"name": name, "if": directive(attrs, "if"), "elif": directive(attrs, "elif"), "else": directive(attrs, "else")}
        previous = stack[-1]["children"][-1] if stack[-1]["children"] else None
        if node["elif"] or node["else"]:
            if not previous or not (previous["if"] or previous["elif"]):
                errors.append(f"{path.relative_to(ROOT)}: wx:{'elif' if node['elif'] else 'else'} lacks a same-level wx:if/wx:elif predecessor")
        stack[-1]["children"].append(node)
        if not opening.group("self"):
            stack.append({"name": name, "children": []})
    return errors


def main():
    errors = []
    for path in sorted((ROOT / "pages").glob("**/*.wxml")):
        errors.extend(check(path))
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    print("wxml conditional chains: PASS")


if __name__ == "__main__":
    main()
