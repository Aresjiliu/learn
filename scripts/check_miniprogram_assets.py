"""Check statically referenced local image assets and page files."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMAGE_RE = re.compile(r'["\'](/images/[A-Za-z0-9_./-]+)["\']')


def main():
    references = []
    source_paths = list(ROOT.glob('pages/**/*.wxml')) + list(ROOT.glob('pages/**/*.js')) + list(ROOT.glob('services/**/*.js'))
    for path in source_paths:
        text = path.read_text(encoding='utf-8')
        for reference in IMAGE_RE.findall(text):
            if '{{' not in reference:
                references.append({'file': str(path.relative_to(ROOT)), 'reference': reference})

    missing = [item for item in references if not (ROOT / item['reference'].lstrip('/')).exists()]
    result = {
        'staticReferences': references,
        'missing': missing,
        'status': 'pass' if not missing else 'needs-review',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if not missing else 1)


if __name__ == '__main__':
    main()
