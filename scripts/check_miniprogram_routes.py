"""Check app pages and static page references without starting WeChat DevTools."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_RE = re.compile(r"/pages/[A-Za-z0-9_/-]+")


def page_exists(route):
    page = ROOT / route.lstrip('/')
    return (page.with_suffix('.js')).exists() and (page.with_suffix('.wxml')).exists()


def main():
    app = json.loads((ROOT / 'app.json').read_text(encoding='utf-8'))
    routes = set('/' + page for page in app.get('pages', []))
    references = set()
    for wxml in ROOT.glob('pages/**/*.wxml'):
        references.update(PAGE_RE.findall(wxml.read_text(encoding='utf-8')))

    missing_app_pages = sorted(route for route in routes if not page_exists(route))
    missing_references = sorted(route for route in references if route not in routes and not page_exists(route))
    result = {
        'appPageCount': len(routes),
        'missingAppPages': missing_app_pages,
        'referencedRoutes': sorted(references),
        'missingReferencedRoutes': missing_references,
        'status': 'pass' if not missing_app_pages and not missing_references else 'needs-review',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(1 if result['status'] != 'pass' else 0)


if __name__ == '__main__':
    main()
