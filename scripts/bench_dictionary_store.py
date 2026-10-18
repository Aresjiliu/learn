"""Repeatable local process-cold and warm dictionary lookup measurements."""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import subprocess
import sys
import time
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from content_server.dictionary_store import DictionaryStore


DEFAULT_QUERIES = ('привет', 'всё', 'пойду', '汽车', '学')


def percentile_ms(seconds: list[float], percent: int) -> float:
    if not seconds or not 1 <= percent <= 100:
        raise ValueError('采样与百分位参数无效')
    ordered = sorted(seconds)
    return round(ordered[math.ceil(percent * len(ordered) / 100) - 1] * 1000, 3)


def benchmark(index: Path, queries: list[str], warm_repeats: int = 50,
              cold_repeats: int = 20) -> dict:
    if warm_repeats < 1 or cold_repeats < 1 or not queries:
        raise ValueError('查询列表与采样次数必须非空')
    index = Path(index).resolve()
    store = DictionaryStore(index)
    with closing(store.connect()) as connection:
        metadata = dict(connection.execute('SELECT key, value FROM metadata'))
    results = []
    for query in queries:
        process_cold = []
        for _ in range(cold_repeats):
            started = time.perf_counter()
            subprocess.run([
                sys.executable, '-B', str(Path(__file__).resolve()),
                '--index', str(index), '--single-query', query
            ], check=True, capture_output=True, text=True)
            process_cold.append(time.perf_counter() - started)
        warm = []
        for _ in range(warm_repeats):
            started = time.perf_counter()
            result = store.search(query)
            warm.append(time.perf_counter() - started)
        results.append({
            'query': query,
            'total': result['total'],
            'processColdP50Ms': percentile_ms(process_cold, 50),
            'processColdP95Ms': percentile_ms(process_cold, 95),
            'warmP50Ms': percentile_ms(warm, 50),
            'warmP95Ms': percentile_ms(warm, 95),
        })
    return {
        'indexBytes': index.stat().st_size,
        'schemaVersion': metadata['schema_version'],
        'sourceSha256': metadata['source_sha256'],
        'formsSourceSha256': metadata['forms_source_sha256'],
        'pythonVersion': sys.version.split()[0],
        'sqliteVersion': sqlite3.sqlite_version,
        'coldDefinition': '新 Python 进程启动、导入与查询；不清空操作系统文件缓存',
        'coldRepeats': cold_repeats,
        'warmRepeats': warm_repeats,
        'queries': results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--query', action='append')
    parser.add_argument('--warm-repeats', type=int, default=50)
    parser.add_argument('--cold-repeats', type=int, default=20)
    parser.add_argument('--single-query', help=argparse.SUPPRESS)
    arguments = parser.parse_args()
    if arguments.single_query is not None:
        DictionaryStore(arguments.index).search(arguments.single_query)
        return
    report = benchmark(arguments.index, arguments.query or list(DEFAULT_QUERIES),
                       arguments.warm_repeats, arguments.cold_repeats)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
