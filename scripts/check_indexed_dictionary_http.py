"""Read-only smoke check against the running indexed dictionary HTTP service."""

import argparse
import json
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import urlopen


def check(base_url):
    def get(path):
        try:
            with urlopen(base_url.rstrip('/') + path, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    status, health = get('/health')
    assert status == 200 and health['status'] == 'ok', health
    status, result = get('/api/v1/dictionary/search?' + urlencode({'q': 'привет', 'page_size': 2}))
    assert status == 200 and result['meta']['total'] > 1, result
    assert result['meta']['contentVersion'] == health['contentVersion']
    word = result['data']['words'][0]
    assert word['id'].startswith('dict:')
    status, detail = get('/api/v1/dictionary/' + quote(word['id'], safe=''))
    assert status == 200 and detail['data']['word']['id'] == word['id']
    status, second = get('/api/v1/dictionary/search?' + urlencode({'q': 'привет', 'page': 2, 'page_size': 2}))
    assert status == 200
    assert not ({item['id'] for item in result['data']['words']} & {item['id'] for item in second['data']['words']})
    for query in ('汽车', '学', 'пойду'):
        status, payload = get('/api/v1/dictionary/search?' + urlencode({'q': query}))
        assert status == 200 and payload['data']['words'], query
    status, invalid = get('/api/v1/dictionary/search?q=%25')
    assert status == 400 and invalid['error']['code'] == 'INVALID_ARGUMENT'
    print(json.dumps({'status': 'pass', 'contentVersion': health['contentVersion'],
                      'entryCount': health['entryCount'], 'searchTotal': result['meta']['total']}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:18092')
    check(parser.parse_args().base)
