"""Validate the checked-in Mini Program development configuration.

This is intentionally a static check: it never contacts an API or changes
configuration. It catches the most common mistake before device testing:
using loopback URLs outside the WeChat DevTools-only profile.
"""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config.js"
PRIVATE_CONFIG = ROOT / "project.private.config.json"


def read_flag(source: str, name: str):
    match = re.search(rf"\b{name}\s*:\s*(true|false)", source)
    return None if match is None else match.group(1) == "true"


def read_string(source: str, name: str):
    match = re.search(rf"\b{name}\s*:\s*['\"]([^'\"]*)['\"]", source)
    return None if match is None else match.group(1)


def validate_config(config: str, private_config: str = ""):
    failures = []

    base_url = read_string(config, "baseUrl")
    media_url = read_string(config, "devMediaBaseUrl")
    content_url = read_string(config, "contentApiBaseUrl")
    content_enabled = read_flag(config, "enableContentApi")
    dictionary_enabled = read_flag(config, "enableLocalDictionaryApi")
    media_enabled = read_flag(config, "enableLocalTestMedia")
    audio_enabled = read_flag(config, "enableLocalTestAudio")
    fallback_enabled = read_flag(config, "enableLocalSampleFallback")
    remote_writes = read_flag(config, "enableRemoteWrites")

    for name, value in (("baseUrl", base_url), ("devMediaBaseUrl", media_url), ("contentApiBaseUrl", content_url)):
        if not value or not re.match(r"^https?://", value):
            failures.append(f"{name} 必须是 http(s) URL")

    loopback = (base_url or "").find("127.0.0.1") >= 0 or (base_url or "").find("localhost") >= 0
    loopback = loopback or (media_url or "").find("127.0.0.1") >= 0 or (media_url or "").find("localhost") >= 0
    loopback = loopback or (content_url or "").find("127.0.0.1") >= 0 or (content_url or "").find("localhost") >= 0

    if loopback and not (media_enabled and not content_enabled and fallback_enabled):
        failures.append("发现回环地址时，必须保持本地媒体开启、内容 API 关闭且允许样例回退")
    if content_enabled and fallback_enabled:
        failures.append("内容 API 开启时不应默认启用样例回退；发布前需明确关闭或改为受控降级")
    if content_enabled and not (content_url or "").lower().startswith("https://"):
        failures.append("enableContentApi 开启时 contentApiBaseUrl 必须使用 HTTPS")
    if dictionary_enabled and not content_enabled and not loopback:
        failures.append("enableLocalDictionaryApi 仅供回环地址的本机调试使用")
    if remote_writes and not (base_url or "").lower().startswith("https://"):
        failures.append("enableRemoteWrites 开启时 baseUrl 必须使用 HTTPS")
    if loopback and remote_writes:
        failures.append("回环地址联调时必须关闭 enableRemoteWrites，避免误写后端")
    if '"urlCheck": false' not in private_config and loopback:
        failures.append("使用回环地址进行 DevTools 调试时，project.private.config.json 应显式设置 urlCheck=false")
    if (content_enabled or remote_writes) and '"urlCheck": false' in private_config:
        failures.append("内容 API 或远程写入开启时，project.private.config.json 不得保留 urlCheck=false")

    return {
        "baseUrl": base_url,
        "devMediaBaseUrl": media_url,
        "contentApiBaseUrl": content_url,
        "enableContentApi": content_enabled,
        "enableLocalDictionaryApi": dictionary_enabled,
        "enableLocalTestMedia": media_enabled,
        "enableLocalTestAudio": audio_enabled,
        "enableLocalSampleFallback": fallback_enabled,
        "enableRemoteWrites": remote_writes,
        "failures": failures,
    }


def main():
    config = CONFIG.read_text(encoding="utf-8")
    private_config = PRIVATE_CONFIG.read_text(encoding="utf-8") if PRIVATE_CONFIG.exists() else ""
    result = validate_config(config, private_config)
    failures = result["failures"]
    print(f"baseUrl={result['baseUrl']}")
    print(f"devMediaBaseUrl={result['devMediaBaseUrl']}")
    print(f"contentApiBaseUrl={result['contentApiBaseUrl']}")
    print(f"enableContentApi={result['enableContentApi']}, enableLocalTestMedia={result['enableLocalTestMedia']}, enableLocalTestAudio={result['enableLocalTestAudio']}, enableLocalSampleFallback={result['enableLocalSampleFallback']}")
    print(f"enableRemoteWrites={result['enableRemoteWrites']}")
    print("runtime config: OK" if not failures else "runtime config: FAILED")
    for failure in failures:
        print(f"- {failure}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
