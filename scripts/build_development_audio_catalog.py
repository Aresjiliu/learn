"""Compile an explicitly local-only catalog from owned, source-linked audio."""

import argparse
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from content_server.audio_catalog import KIND, file_digest, read_verified_file, validate_decode, validate_entry, validate_sources
from audit_dictionary_audio import audit_audio, write_report


def decode_mp3(data: bytes) -> dict:
    # Offline tool dependency only; never imported by the content HTTP service.
    import numpy as np
    import soundfile as sf
    with sf.SoundFile(io.BytesIO(data)) as audio:
        frames, peak = 0, 0.0
        if audio.format != 'MP3' or audio.channels not in (1, 2):
            raise ValueError('unsupported pronunciation format')
        for block in audio.blocks(blocksize=8192, dtype='float32', always_2d=True):
            if not np.isfinite(block).all():
                raise ValueError('invalid PCM')
            frames += len(block)
            if frames > audio.samplerate * 30:
                raise ValueError('pronunciation exceeds duration limit')
            peak = max(peak, float(np.abs(block).max()))
        if frames <= 0 or peak == 0:
            raise ValueError('empty or silent pronunciation')
        return {'frames': frames, 'sampleRate': audio.samplerate, 'channels': audio.channels,
                'durationSeconds': frames / audio.samplerate,
                'decoder': 'soundfile-' + sf.__version__ + '/libsndfile-' + sf.__libsndfile_version__}


def compile_catalog(report: dict, index_path: Path, cache_dir: Path, decode=decode_mp3) -> dict:
    validate_sources(report.get('sources'))
    if (report.get('schemaVersion') != 1 or report.get('publicationReady') is not False
            or report.get('verification') != 'mp3-structure-only'
            or report.get('sources', {}).get('dictionarySha256') != file_digest(index_path)):
        raise ValueError('audit report does not match dictionary snapshot')
    root = Path(cache_dir).resolve()
    entries, rejected = [], []
    seen = set()
    decoded = {}
    for candidate in report.get('candidates', []):
        validate_entry(candidate)
        if candidate['entryId'] in seen:
            raise ValueError('duplicate audio entry ID')
        seen.add(candidate['entryId'])
        data = read_verified_file(root, candidate)
        if data is None:
            rejected.append(candidate['entryId'])
            continue
        try:
            key = candidate['sha256']
            if key not in decoded:
                evidence = decode(data)
                validate_decode(evidence)
                decoded[key] = evidence
            entries.append({**candidate, 'decode': decoded[key]})
        except (ValueError, RuntimeError):
            rejected.append(candidate['entryId'])
    if report['sources']['dictionarySha256'] != file_digest(index_path):
        raise ValueError('dictionary snapshot changed while compiling audio')
    return {'kind': KIND, 'schemaVersion': 1, 'developmentOnly': True,
            'publicationReady': False, 'verification': 'decoded-source-linked',
            'sources': report['sources'], 'entries': entries, 'rejectedEntryIds': rejected}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', type=Path, required=True)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--cache-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = audit_audio(args.export, args.index, args.cache_dir)
    catalog = compile_catalog(report, args.index, args.cache_dir)
    write_report(catalog, args.output, [args.export, args.index], args.cache_dir)
    print(json.dumps({'developmentOnly': True, 'publicationReady': False,
                      'entries': len(catalog['entries']), 'rejected': len(catalog['rejectedEntryIds'])}))


if __name__ == '__main__':
    main()
