"""Check the running local test media server and byte-range behavior."""

import json
import os
import urllib.request


URL = os.environ.get('TEST_MEDIA_URL', 'http://127.0.0.1:18090/video/video1.mp4')


def main():
    head_request = urllib.request.Request(URL, method='HEAD')
    with urllib.request.urlopen(head_request, timeout=5) as response:
        head = {
            'status': response.status,
            'contentType': response.headers.get('Content-Type'),
            'contentLength': response.headers.get('Content-Length'),
        }

    range_request = urllib.request.Request(URL, headers={'Range': 'bytes=0-1023'})
    with urllib.request.urlopen(range_request, timeout=5) as response:
        body = response.read()
        ranged = {
            'status': response.status,
            'contentType': response.headers.get('Content-Type'),
            'contentLength': response.headers.get('Content-Length'),
            'contentRange': response.headers.get('Content-Range'),
            'acceptRanges': response.headers.get('Accept-Ranges'),
            'bytesRead': len(body),
        }

    result = {'url': URL, 'head': head, 'range': ranged}
    expected_total = head['contentLength']
    result['status'] = 'pass' if (
        head['status'] == 200
        and head['contentType'] == 'video/mp4'
        and ranged['status'] == 206
        and ranged['bytesRead'] == 1024
        and ranged['acceptRanges'] == 'bytes'
        and ranged['contentRange'] == f'bytes 0-1023/{expected_total}'
    ) else 'needs-review'
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['status'] == 'pass' else 1)


if __name__ == '__main__':
    main()
