"""Serve local test media read-only with HTTP byte-range support."""

from __future__ import annotations

import argparse
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from content_server.media_range import parse_range


class RangeMediaHandler(BaseHTTPRequestHandler):
    root = None
    video_root = Path(__file__).resolve().parents[1] / 'videos'

    def do_HEAD(self):
        self._serve(send_body=False)

    def do_GET(self):
        self._serve(send_body=True)

    def _serve(self, send_body):
        relative = unquote(urlparse(self.path).path).lstrip('/')
        parts = relative.split('/')
        if (not relative or '\\' in relative or
                any(part in ('', '.', '..') for part in parts)):
            self.send_error(404, 'Media not found')
            return
        if parts[0] == 'video':
            root = self.video_root if len(parts) == 2 else None
            relative = parts[-1]
        else:
            root = self.root
        if root is None:
            self.send_error(404, 'Media not found')
            return
        root = root.resolve()
        target = (root / relative).resolve()
        if root not in target.parents or not target.is_file():
            self.send_error(404, 'Media not found')
            return

        size = target.stat().st_size
        range_header = self.headers.get('Range', '') if send_body else ''
        try:
            status, start, end = parse_range(range_header, size)
        except (ValueError, TypeError):
            self.send_error(416, 'Invalid range')
            return

        length = end - start + 1
        self.send_response(status)
        self.send_header('Content-Type', mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if send_body:
            try:
                with target.open('rb') as source:
                    source.seek(start)
                    remaining = length
                    while remaining:
                        chunk = source.read(min(64 * 1024, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                # Range clients may intentionally close after receiving enough data.
                pass

    def log_message(self, format, *args):
        print(f'{self.address_string()} - {format % args}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', help='optional root for legacy audio and other non-video paths')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=18090)
    args = parser.parse_args()
    root = Path(args.root).resolve() if args.root else None
    if root is not None and not root.is_dir():
        raise SystemExit(f'media root not found: {root}')
    RangeMediaHandler.root = root
    server = ThreadingHTTPServer((args.host, args.port), RangeMediaHandler)
    print(f'Serving video from {RangeMediaHandler.video_root} on http://{args.host}:{args.port}/video/')
    if root is not None:
        print(f'Serving other media from {root}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('Stopping media server')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
