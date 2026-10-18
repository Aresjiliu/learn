"""Estimate the files visible to the Mini Program packer after packOptions.ignore."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main():
    project = json.loads((ROOT / "project.config.json").read_text(encoding="utf-8"))
    ignored = project.get("packOptions", {}).get("ignore", [])
    ignored_folders = [Path(item["value"]) for item in ignored if item.get("type") == "folder"]
    ignored_files = {Path(item["value"]) for item in ignored if item.get("type") == "file"}

    included = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if relative in ignored_files or any(relative == folder or folder in relative.parents for folder in ignored_folders):
            continue
        included.append((relative, path.stat().st_size))

    forbidden = [relative for relative, _ in included if str(relative).replace("\\", "/").startswith((
        "ui/", "node_modules/", "content_server/", "data/remote_7500km/", "data/generated/", "docs/", "scripts/", "tasks/", "lingosnake-main/", "miniprogram-demo-master/"
    )) or (str(relative).replace("\\", "/").startswith("data/content_samples/") and relative.suffix.lower() == ".json")]
    if forbidden:
        print("预计运行时包仍包含禁止路径:")
        print("\n".join(str(path) for path in forbidden[:20]))
        raise SystemExit(1)

    included_paths = {str(relative).replace("\\", "/") for relative, _ in included}
    required = {
        "app.js",
        "app.json",
        "config.js",
        "services/course.js",
        "services/content-api.js",
        "services/dictionary.js",
        "services/exam.js",
        "data/content_samples/book_1_words.js",
        "data/content_samples/dictionary_words.js",
        "data/content_samples/exam_papers.js",
        "pages/index/index.js",
        "pages/exam/list/list.js",
    }
    missing = sorted(required - included_paths)
    if missing:
        print("预计运行时包缺少核心文件:")
        print("\n".join(missing))
        raise SystemExit(1)

    total = sum(size for _, size in included)
    if total > int(1.8 * 1024 * 1024):
        print("预计运行时包超过项目 1.8 MiB 预算，请检查开发目录排除与组件依赖")
        raise SystemExit(1)
    print(json.dumps({
        "includedFiles": len(included),
        "estimatedBytes": total,
        "estimatedMiB": round(total / 1024 / 1024, 3),
        "status": "pass",
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
