"""Independent read-only dictionary HTTP API; configure an explicit snapshot path."""

import json
import logging
import os
import sqlite3
import time
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from .dictionary_store import AmbiguousLegacyId, DictionaryStore, SnapshotUnavailable

LOGGER = logging.getLogger('dictionary_api')
SOURCE = 'dictionary-index'


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message}})


def create_app(index_path: Path) -> FastAPI:
    store = DictionaryStore(index_path)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware('http')
    async def log_request(request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get('route')
        LOGGER.info(json.dumps({
            'event': 'http_request', 'method': request.method,
            'route': route.path if route else 'unmatched', 'status': response.status_code,
            'elapsedMs': round((time.perf_counter() - started) * 1000, 2),
        }))
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.exception_handler(RequestValidationError)
    @app.exception_handler(ValueError)
    async def invalid_argument(request, error):
        return error_response(400, 'INVALID_ARGUMENT', '查询词或分页参数无效')

    @app.exception_handler(AmbiguousLegacyId)
    async def ambiguous_id(request, error):
        return error_response(409, 'AMBIGUOUS_WORD_ID', '旧词条标识存在歧义，请从搜索结果重新进入')

    @app.exception_handler(SnapshotUnavailable)
    @app.exception_handler(sqlite3.Error)
    @app.exception_handler(OSError)
    async def unavailable(request, error):
        LOGGER.error('dictionary_unavailable (%s)', type(error).__name__)
        return error_response(503, 'CONTENT_UNAVAILABLE', '词典暂时不可用，请稍后重试')

    @app.exception_handler(HTTPException)
    async def http_error(request, error):
        return error_response(error.status_code, 'NOT_FOUND' if error.status_code == 404 else 'METHOD_NOT_ALLOWED',
                              '接口不存在' if error.status_code == 404 else '不支持此请求方法')

    def metadata(info):
        return {'source': SOURCE, 'contentVersion': info['contentVersion']}

    @app.get('/health')
    def health():
        return {'status': 'ok', 'service': 'dictionary-api', **store.snapshot_info()}

    @app.get('/api/v1/content/manifest')
    def manifest():
        info = store.snapshot_info()
        return {'data': {'contentVersion': info['contentVersion'], 'source': SOURCE,
                         'capabilities': ['dictionary']}, 'meta': metadata(info)}

    @app.get('/api/v1/dictionary/search')
    def search(q: str = Query(..., min_length=1, max_length=64),
               page: int = Query(1, ge=1, le=1000000), page_size: int = Query(20, ge=1, le=100)):
        info = store.snapshot_info()
        result = store.search(q, page, page_size)
        return {'data': {'words': result['words'], 'formCandidates': result['formCandidates']},
                'meta': {**metadata(info), 'page': page, 'page_size': page_size, 'total': result['total']}}

    @app.get('/api/v1/dictionary/{word_id}')
    def detail(word_id: str):
        info = store.snapshot_info()
        word = store.detail(word_id)
        if word is None:
            return error_response(404, 'CONTENT_NOT_FOUND', '词条不存在')
        return {'data': {'word': word}, 'meta': metadata(info)}

    return app


def app_from_env() -> FastAPI:
    value = os.environ.get('DICTIONARY_INDEX_PATH', '').strip()
    if not value:
        raise RuntimeError('必须设置 DICTIONARY_INDEX_PATH 指向已验证的只读索引')
    if not LOGGER.handlers:
        LOGGER.addHandler(logging.StreamHandler())
        LOGGER.setLevel(logging.INFO)
        LOGGER.propagate = False
    return create_app(Path(value))
