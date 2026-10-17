"""Validate local MP4 test assets without copying or decoding them."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MEDIA_ROOT = Path(r'D:\project\weixin\media\video')


def inspect(path):
    if not path.exists():
        return {'path': str(path), 'exists': False, 'validContainerHint': False}
    with path.open('rb') as handle:
        header = handle.read(64)
    return {
        'path': str(path),
        'exists': True,
        'sizeBytes': path.stat().st_size,
        'validContainerHint': b'ftyp' in header,
    }


def main():
    assets = [inspect(MEDIA_ROOT / f'video{i}.mp4') for i in range(1, 7)]
    result = {
        'mediaRoot': str(MEDIA_ROOT),
        'assets': assets,
        'status': 'pass' if all(item['exists'] and item['sizeBytes'] > 0 and item['validContainerHint'] for item in assets) else 'needs-review',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['status'] == 'pass' else 1)


if __name__ == '__main__':
    main()
