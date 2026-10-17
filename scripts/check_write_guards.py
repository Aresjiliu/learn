"""Verify that Mini Program network writes stay behind the read-only guard."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = (ROOT / "pages", ROOT / "services", ROOT / "utils")
WRITE_RE = re.compile(r"method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]")
failures = []
request_entrypoints = []

for scan_root in SCAN_ROOTS:
    for path in scan_root.rglob("*.js"):
        text = path.read_text(encoding="utf-8")
        relative = path.relative_to(ROOT).as_posix()
        if "wx.request" in text:
            request_entrypoints.append(relative)
        if WRITE_RE.search(text) and "enableRemoteWrites" not in text:
            failures.append(f"{relative}: 写请求缺少 enableRemoteWrites 门禁")
        if "fetch(" in text or "XMLHttpRequest" in text:
            failures.append(f"{relative}: 发现绕过统一请求层的网络入口")

if request_entrypoints != ["utils/request.js"]:
    failures.append(f"wx.request 入口异常: {request_entrypoints}")

request_source = (ROOT / "utils/request.js").read_text(encoding="utf-8")
if "method !== 'GET' && !config.enableRemoteWrites" not in request_source:
    failures.append("utils/request.js: 缺少非 GET 远程写入阻断")

config_source = (ROOT / "config.js").read_text(encoding="utf-8")
if not re.search(r"enableRemoteWrites\s*:\s*false", config_source):
    failures.append("config.js: 当前开发配置必须保持 enableRemoteWrites=false")

if failures:
    for failure in failures:
        print(f"FAIL: {failure}")
    raise SystemExit(1)

print(f"write guards: PASS (wx.request={request_entrypoints[0]}, remote writes disabled)")
