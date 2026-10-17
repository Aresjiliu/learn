"""Behavior checks for the local, read-only media server."""

from io import BytesIO
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.serve_test_media import RangeMediaHandler, parse_range


class MemoryConnection:
    def __init__(self, request):
        self.input = BytesIO(request)
        self.output = bytearray()

    def makefile(self, mode, buffering=None):
        return self.input

    def sendall(self, data):
        self.output.extend(data)


class AbortOnBodyConnection(MemoryConnection):
    def __init__(self, request):
        super().__init__(request)
        self.aborted = False

    def sendall(self, data):
        if self.output:
            self.aborted = True
            raise ConnectionAbortedError(10053, 'client aborted')
        super().sendall(data)


class MediaServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name) / 'legacy'
        cls.video_root = Path(cls.temp.name) / 'videos'
        (cls.root / 'audio').mkdir(parents=True)
        (cls.root / 'audio' / 'sample.mp3').write_bytes(b'0123456789')
        (Path(cls.temp.name) / 'secret.mp3').write_bytes(b'secret')
        cls.video_root.mkdir()
        for number in range(1, 7):
            (cls.video_root / f'video{number}.mp4').write_bytes(b'fake-mp4')
        cls.handler = type('TestMediaHandler', (RangeMediaHandler,), {
            'root': cls.root, 'video_root': cls.video_root})
        cls.video_only_handler = type('TestVideoOnlyHandler', (RangeMediaHandler,), {
            'root': None, 'video_root': cls.video_root})

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def request(self, path, method='GET', byte_range=None, handler=None):
        headers = [f'{method} {path} HTTP/1.0', 'Host: localhost']
        if byte_range is not None:
            headers.append(f'Range: {byte_range}')
        data = ('\r\n'.join(headers) + '\r\n\r\n').encode('ascii')
        connection = MemoryConnection(data)
        (handler or self.handler)(connection, ('127.0.0.1', 0), object())
        head, body = bytes(connection.output).split(b'\r\n\r\n', 1)
        lines = head.decode('iso-8859-1').split('\r\n')
        status = int(lines[0].split()[1])
        fields = dict(line.split(': ', 1) for line in lines[1:])
        return status, fields, body

    def test_parse_range(self):
        self.assertEqual(parse_range('', 100), (200, 0, 99))
        self.assertEqual(parse_range('bytes=0-1023', 4096), (206, 0, 1023))
        self.assertEqual(parse_range('bytes=100-', 4096), (206, 100, 4095))
        self.assertEqual(parse_range('bytes=-50', 100), (206, 50, 99))
        self.assertEqual(parse_range('bytes=0-9999', 100), (206, 0, 99))
        with self.assertRaises(ValueError):
            parse_range('bytes=100-50', 100)

    def test_full_legacy_audio_response(self):
        status, headers, body = self.request('/audio/sample.mp3')
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-Length'], '10')
        self.assertEqual(body, b'0123456789')

    def test_bounded_range_writes_only_declared_bytes(self):
        status, headers, body = self.request('/audio/sample.mp3', byte_range='bytes=2-4')
        self.assertEqual(status, 206)
        self.assertEqual(headers['Content-Range'], 'bytes 2-4/10')
        self.assertEqual(headers['Content-Length'], '3')
        self.assertEqual(body, b'234')

    def test_client_abort_while_writing_range_body_is_expected(self):
        request = (b'GET /audio/sample.mp3 HTTP/1.0\r\n'
                   b'Host: localhost\r\nRange: bytes=2-4\r\n\r\n')
        connection = AbortOnBodyConnection(request)
        self.handler(connection, ('127.0.0.1', 0), object())
        self.assertTrue(connection.aborted)
        self.assertIn(b'HTTP/1.0 206', connection.output)

    def test_comma_separated_ranges_are_ignored(self):
        for value in ('bytes=2-4,6-8', 'bytes=2-4,garbage'):
            with self.subTest(range=value):
                status, headers, body = self.request(
                    '/audio/sample.mp3', byte_range=value)
                self.assertEqual(status, 200)
                self.assertNotIn('Content-Range', headers)
                self.assertEqual(headers['Content-Length'], '10')
                self.assertEqual(body, b'0123456789')

    def test_out_of_bounds_range(self):
        status, headers, body = self.request('/audio/sample.mp3', byte_range='bytes=8-99')
        self.assertEqual(status, 206)
        self.assertEqual(headers['Content-Range'], 'bytes 8-9/10')
        self.assertEqual(headers['Content-Length'], '2')
        self.assertEqual(body, b'89')
        status, _, _ = self.request('/audio/sample.mp3', byte_range='bytes=10-11')
        self.assertEqual(status, 416)

    def test_suffix_range(self):
        status, headers, body = self.request('/audio/sample.mp3', byte_range='bytes=-3')
        self.assertEqual(status, 206)
        self.assertEqual(headers['Content-Range'], 'bytes 7-9/10')
        self.assertEqual(body, b'789')

    def test_default_video_root_points_to_project_videos(self):
        self.assertEqual(
            RangeMediaHandler.video_root,
            Path(__file__).resolve().parents[1] / 'videos')

    def test_video_alias_uses_configured_video_root(self):
        for handler in (self.video_only_handler, self.handler):
            for number in range(1, 7):
                with self.subTest(handler=handler.__name__, video=number):
                    video = self.video_root / f'video{number}.mp4'
                    status, headers, body = self.request(
                        f'/video/video{number}.mp4', method='HEAD', handler=handler)
                    self.assertEqual(status, 200)
                    self.assertEqual(headers['Content-Type'], 'video/mp4')
                    self.assertEqual(headers['Content-Length'], str(video.stat().st_size))
                    self.assertEqual(body, b'')

    def test_traversal_cannot_escape_either_media_root(self):
        for path in ('/../secret.mp3', '/%2e%2e/secret.mp3',
                     '/video/../scripts/serve_test_media.py',
                     '/video/%2e%2e/scripts/serve_test_media.py',
                     '/video/%5c..%5cscripts%5cserve_test_media.py'):
            with self.subTest(path=path):
                status, _, _ = self.request(path)
                self.assertEqual(status, 404)


if __name__ == '__main__':
    unittest.main()
