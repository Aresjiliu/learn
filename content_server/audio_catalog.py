"""Explicit development-only, source-bound pronunciation whitelist."""

import hashlib
import json
import math
import re
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

MAX_AUDIO_BYTES = 2 * 1024 * 1024
KIND = 'dictionary-audio-development-catalog'


def validate_sources(sources: dict) -> None:
    if (not isinstance(sources, dict) or any(
            not re.fullmatch(r'[0-9a-f]{64}', str(sources.get(key, '')))
            for key in ('dictionarySha256', 'textbookSha256'))):
        raise ValueError('missing source snapshot provenance')


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def validate_entry(entry: dict) -> None:
    if not isinstance(entry, dict):
        raise ValueError('invalid audio entry')
    if (not re.fullmatch(r'dict:[0-9]+:[0-9a-f]{16}', str(entry.get('entryId', '')))
            or not re.fullmatch(r'[0-9a-f]{32}\.mp3', str(entry.get('filename', '')))
            or not re.fullmatch(r'[0-9a-f]{64}', str(entry.get('sha256', '')))
            or not isinstance(entry.get('word'), str) or not entry['word'].strip()
            or entry.get('source') != 'textbook-strict-word'
            or type(entry.get('bytes')) is not int or not 0 < entry['bytes'] <= MAX_AUDIO_BYTES):
        raise ValueError('invalid audio identity or file metadata')
    ids = entry.get('textbookIds')
    if (not isinstance(ids, list) or not 1 <= len(ids) <= 1000
            or any(not isinstance(value, str) or not re.fullmatch(r'[0-9]+', value) for value in ids)):
        raise ValueError('invalid textbook provenance')


def validate_decode(info: dict) -> None:
    if (not isinstance(info, dict) or type(info.get('frames')) is not int
            or type(info.get('sampleRate')) is not int or not 8000 <= info['sampleRate'] <= 96000
            or not 0 < info['frames'] <= 30 * info['sampleRate']
            or type(info.get('channels')) is not int or info['channels'] not in (1, 2)
            or type(info.get('durationSeconds')) not in (int, float)
            or not math.isfinite(info['durationSeconds'])
            or abs(info['durationSeconds'] - info['frames'] / info['sampleRate']) > 0.001
            or not isinstance(info.get('decoder'), str) or not 1 <= len(info['decoder']) <= 128):
        raise ValueError('invalid complete-decode evidence')


def read_verified_file(root: Path, entry: dict) -> bytes | None:
    target = root / entry['filename']
    try:
        if target.resolve().parent != root or not target.is_file():
            return None
        with target.open('rb') as stream:
            data = stream.read(MAX_AUDIO_BYTES + 1)
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            return None
        return data
    except OSError:
        return None


class AudioCatalog:
    def __init__(self, manifest_path: Path, index_path: Path, root: Path,
                 base_url: str, development_enabled: bool = False):
        parsed = urlsplit(base_url)
        if (development_enabled is not True or parsed.scheme != 'http'
                or parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ('', '/') or parsed.port == 0):
            raise ValueError('development audio requires explicit loopback HTTP configuration')
        self.root = Path(root).resolve()
        if not self.root.is_dir():
            raise ValueError('audio root is unavailable')
        with Path(manifest_path).open('rb') as stream:
            raw = stream.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError('audio catalog is too large')
        manifest = json.loads(raw)
        if (not isinstance(manifest, dict) or manifest.get('kind') != KIND
                or manifest.get('schemaVersion') != 1 or manifest.get('developmentOnly') is not True
                or manifest.get('publicationReady') is not False
                or manifest.get('verification') != 'decoded-source-linked'
                or not isinstance(manifest.get('sources'), dict)):
            raise ValueError('audio catalog type or dictionary snapshot mismatch')
        validate_sources(manifest['sources'])
        entries = manifest.get('entries')
        if not isinstance(entries, list) or len(entries) > 20000:
            raise ValueError('invalid audio entries')
        self.entries = {}
        self.files = {}
        for entry in entries:
            validate_entry(entry)
            validate_decode(entry.get('decode'))
            if entry['entryId'] in self.entries:
                raise ValueError('duplicate audio entry ID')
            previous = self.files.get(entry['filename'])
            if previous and (previous['sha256'], previous['bytes']) != (entry['sha256'], entry['bytes']):
                raise ValueError('conflicting audio file metadata')
            self.entries[entry['entryId']] = entry
            self.files[entry['filename']] = entry
        self.version = hashlib.sha256(raw).hexdigest()[:16]
        self.base_url = base_url.rstrip('/')
        # Query and audio must both use this private immutable batch, never the mutable source.
        self._temporary = tempfile.TemporaryDirectory(prefix='learn-dictionary-audio-')
        self.index_path = Path(self._temporary.name) / 'dictionary.sqlite'
        try:
            digest = hashlib.sha256()
            size = 0
            with Path(index_path).open('rb') as source, self.index_path.open('xb') as target:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    size += len(chunk)
                    if size > 2 * 1024 ** 3:
                        raise ValueError('dictionary snapshot exceeds 2 GiB limit')
                    digest.update(chunk)
                    target.write(chunk)
            if digest.hexdigest() != manifest['sources']['dictionarySha256']:
                raise ValueError('audio catalog dictionary snapshot mismatch')
        except BaseException:
            self._temporary.cleanup()
            raise

    def close(self) -> None:
        self._temporary.cleanup()

    def is_current(self) -> bool:
        return self.index_path.is_file()

    def read_file(self, filename: str) -> bytes | None:
        if not self.is_current():
            return None
        entry = self.files.get(filename)
        data = read_verified_file(self.root, entry) if entry else None
        return data if self.is_current() else None

    def decorate(self, word: dict) -> dict:
        result = {**word, 'audio_url': ''}
        entry = self.entries.get(str(word.get('id', '')))
        if entry and entry['word'] == word.get('word'):
            result.update(audioSource='textbook', audioDevelopmentOnly=True)
            if self.read_file(entry['filename']) is not None:
                result.update(audio_url=self.base_url + '/api/v1/dictionary/audio/' + entry['filename'],
                              audioPending=False)
            else:
                result.update(audioPending=True)
        return result
