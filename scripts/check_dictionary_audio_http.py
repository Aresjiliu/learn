"""Read-only real-asset smoke: stable word -> detail -> verified MP3 bytes."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(base_url: str, manifest_path: Path) -> dict:
    origin = urlsplit(base_url)
    if origin.scheme != 'http' or origin.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise ValueError('smoke is restricted to an explicit local development server')
    opener = build_opener(NoRedirect())
    def fetch(path, method='GET', headers=None):
        url = base_url.rstrip('/') + path
        response = opener.open(Request(url, method=method, headers=headers or {}), timeout=10)
        with response:
            body = response.read(2 * 1024 * 1024 + 1)
            assert len(body) <= 2 * 1024 * 1024
            return response.status, response.headers, body
    def get_json(path):
        status, headers, body = fetch(path)
        assert status == 200
        return json.loads(body)
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    entry = manifest['entries'][0]
    health = get_json('/health')
    assert health['audioDevelopmentOnly'] and health['audioCatalogCurrent']
    search = get_json('/api/v1/dictionary/search?' + urlencode({'q': entry['word']}))
    matches = [word for word in search['data']['words'] if word['id'] == entry['entryId']]
    assert matches, 'audited exact word must be in first search page'
    detail = get_json('/api/v1/dictionary/' + quote(entry['entryId'], safe=''))
    word = detail['data']['word']
    assert matches[0]['audio_url'] == word['audio_url']
    assert word['audioDevelopmentOnly'] and word['audioSource'] == 'textbook'
    url = urlsplit(word['audio_url'])
    assert (url.scheme, url.hostname, url.port) == (origin.scheme, origin.hostname, origin.port)
    assert re.fullmatch(r'/api/v1/dictionary/audio/[0-9a-f]{32}\.mp3', url.path)
    status, headers, body = fetch(url.path)
    assert status == 200 and len(body) == entry['bytes']
    assert hashlib.sha256(body).hexdigest() == entry['sha256']
    status, headers, empty = fetch(url.path, method='HEAD')
    assert status == 200 and not empty and int(headers['Content-Length']) == len(body)
    end = min(1023, len(body) - 1)
    status, headers, partial = fetch(url.path, headers={'Range': f'bytes=0-{end}'})
    assert status == 206 and partial == body[:end + 1]
    assert headers['Content-Range'] == f'bytes 0-{end}/{len(body)}'
    try:
        fetch('/api/v1/dictionary/audio/' + '0' * 32 + '.mp3')
        raise AssertionError('unlisted media must not be served')
    except HTTPError as error:
        assert error.code == 404
    return {'status': 'pass', 'audioCatalogEntries': health['audioCatalogEntries'],
            'contentVersion': health['contentVersion'], 'rangeBytes': len(partial),
            'entryId': entry['entryId'], 'sha256': entry['sha256']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:18092')
    parser.add_argument('--manifest', type=Path, default=Path('data/generated/dictionary-audio-development.json'))
    args = parser.parse_args()
    print(json.dumps(check(args.base_url, args.manifest), ensure_ascii=True))
