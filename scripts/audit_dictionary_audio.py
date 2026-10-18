"""Audit owned pronunciation assets offline; never approve candidates for publication."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from collections import defaultdict
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from content_server.dictionary_normalization import normalize_strict_word
from cache_word_audio import HASH_RE, ID_RE, MAX_AUDIO_BYTES, valid_mp3


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def require_standalone_index(path: Path) -> None:
    with path.open('rb') as stream:
        header = stream.read(100)
    sidecars = [Path(str(path) + suffix) for suffix in ('-wal', '-shm', '-journal')]
    if (header[:16] != b'SQLite format 3\x00' or len(header) < 100
            or header[18:20] != b'\x01\x01' or any(item.exists() for item in sidecars)):
        raise ValueError('standalone snapshot required; WAL/live journal input is unsupported')


def audit_audio(export_path: Path, index_path: Path, cache_dir: Path) -> dict:
    export_path, index_path, cache_dir = map(Path, (export_path, index_path, cache_dir))
    if not export_path.is_file() or not index_path.is_file() or not cache_dir.is_dir():
        raise ValueError('export, index and cache directory must exist')
    # Never open the source through SQLite: even mode=ro can create WAL sidecars.
    require_standalone_index(index_path)
    original_hashes = [digest_file(export_path), digest_file(index_path)]
    generated = ROOT / 'data' / 'generated'
    generated.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='audio-audit-', dir=generated) as directory:
        copied_export = Path(directory) / 'words.csv.gz'
        copied_index = Path(directory) / 'dictionary.sqlite'
        shutil.copyfile(export_path, copied_export)
        shutil.copyfile(index_path, copied_index)
        if [digest_file(copied_export), digest_file(copied_index)] != original_hashes:
            raise ValueError('source changed while creating audit snapshot')
        require_standalone_index(copied_index)
        report = audit_snapshot(copied_export, copied_index, cache_dir)
    require_standalone_index(index_path)
    if [digest_file(export_path), digest_file(index_path)] != original_hashes:
        raise ValueError('source changed during audit; report rejected')
    report['sources'] = dict(zip(('textbookSha256', 'dictionarySha256'), original_hashes))
    return report


def audit_snapshot(export_path: Path, index_path: Path, cache_dir: Path) -> dict:
    export_path, index_path, cache_dir = map(Path, (export_path, index_path, cache_dir))
    if not export_path.is_file() or not index_path.is_file() or not cache_dir.is_dir():
        raise ValueError('export, index and cache directory must exist')
    groups = defaultdict(lambda: defaultdict(list))
    blocked = set()
    seen = set()
    summary = dict.fromkeys(('textbookRows', 'rowsWithAudio', 'invalidReferences',
                             'invalidWordRows', 'ambiguousDictionaryEntries',
                             'cachedValidFiles', 'missingFiles', 'invalidFiles',
                             'dictionaryEntries', 'dictionaryNativeCachedEntries'), 0)
    with gzip.open(export_path, 'rt', encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if not {'id', 'word', 'change_form_sound'}.issubset(reader.fieldnames or []):
            raise ValueError('textbook export lacks required columns')
        for row in reader:
            source_id = str(row['id'] or '').strip()
            if not ID_RE.fullmatch(source_id) or source_id in seen:
                raise ValueError('invalid or duplicate textbook ID')
            seen.add(source_id)
            summary['textbookRows'] += 1
            word = normalize_strict_word(row['word'])
            if not word or '\ufffd' in word:
                summary['invalidWordRows'] += 1
                continue
            sound = str(row['change_form_sound'] or '').strip()
            if not sound:
                continue
            summary['rowsWithAudio'] += 1
            if not HASH_RE.fullmatch(sound):
                summary['invalidReferences'] += 1
                blocked.add(word)
                continue
            groups[word][sound].append(source_id)
    if not summary['textbookRows']:
        raise ValueError('empty textbook export')

    verified = {}
    root = cache_dir.resolve()

    def inspect(sound: str) -> dict | None:
        if sound in verified:
            return verified[sound]
        verified[sound] = None
        target = root / (sound + '.mp3')
        if target.resolve().parent != root:
            summary['invalidFiles'] += 1
        elif not target.is_file():
            summary['missingFiles'] += 1
        elif not 0 < target.stat().st_size <= MAX_AUDIO_BYTES:
            summary['invalidFiles'] += 1
        else:
            with target.open('rb') as stream:
                data = stream.read(MAX_AUDIO_BYTES + 1)
            if len(data) > MAX_AUDIO_BYTES or not valid_mp3(data):
                summary['invalidFiles'] += 1
            else:
                verified[sound] = {'filename': target.name, 'bytes': len(data),
                                   'sha256': hashlib.sha256(data).hexdigest()}
                summary['cachedValidFiles'] += 1
        return verified[sound]

    for sounds in groups.values():
        for sound in sounds:
            inspect(sound)
    candidates = []
    native_candidates = []
    # This is our private, header-checked copy with no WAL and no other writer.
    with closing(sqlite3.connect(index_path.resolve().as_uri() + '?mode=ro&immutable=1', uri=True)) as connection:
        connection.execute('PRAGMA query_only=ON')
        metadata = dict(connection.execute('SELECT key, value FROM metadata'))
        if metadata.get('schema_version') != '4':
            raise ValueError('unsupported dictionary schema')
        for entry_id, original, native_sound in connection.execute('SELECT id, word, audio_ref FROM entries ORDER BY id'):
            summary['dictionaryEntries'] += 1
            key = normalize_strict_word(original)
            sounds = groups.get(key, {})
            if len(sounds) > 1:
                summary['ambiguousDictionaryEntries'] += 1
            elif len(sounds) == 1 and key not in blocked:
                sound, source_ids = next(iter(sounds.items()))
                asset = inspect(sound)
                if asset:
                    candidates.append({'entryId': entry_id, 'word': original,
                                       'textbookIds': sorted(source_ids, key=int),
                                       'source': 'textbook-strict-word', **asset})
            native_sound = str(native_sound or '').strip()
            if HASH_RE.fullmatch(native_sound):
                asset = inspect(native_sound)
                if asset:
                    summary['dictionaryNativeCachedEntries'] += 1
                    native_candidates.append({'entryId': entry_id, 'word': original,
                                              'source': 'dictionary-audio-ref', **asset})
    if not summary['dictionaryEntries']:
        raise ValueError('empty dictionary index')
    summary.update(sourceWordGroups=len(groups),
                   ambiguousWordGroups=sum(len(sounds) > 1 for sounds in groups.values()),
                   blockedWordGroups=len(blocked), candidateEntries=len(candidates))
    return {'schemaVersion': 1, 'publicationReady': False,
            'verification': 'mp3-structure-only', 'pronunciationReviewRequired': True,
            'summary': summary, 'candidates': candidates, 'nativeCandidates': native_candidates}


def write_report(report: dict, output: Path, inputs: list[Path], cache_dir: Path) -> None:
    output = Path(output).resolve()
    cache_dir = Path(cache_dir).resolve()
    if (ROOT / 'data' / 'generated').resolve() not in output.parents:
        raise ValueError('full report must stay in ignored data/generated')
    if output in {Path(item).resolve() for item in inputs} or output == cache_dir or cache_dir in output.parents:
        raise ValueError('report may not overwrite source assets')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=output.parent,
                                         suffix='.part', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        os.replace(temporary, output)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', type=Path, required=True)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--cache-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = audit_audio(args.export, args.index, args.cache_dir)
    if args.output:
        write_report(report, args.output, [args.export, args.index], args.cache_dir)
    print(json.dumps({'publicationReady': False, **report['summary']}, ensure_ascii=True))


if __name__ == '__main__':
    main()
