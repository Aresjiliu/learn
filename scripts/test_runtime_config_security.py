import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.check_runtime_config import validate_config


unsafe_content = validate_config(
    "baseUrl: 'https://api.example.com', contentApiBaseUrl: 'http://content.example.com', enableContentApi: true, enableLocalTestMedia: false, enableLocalSampleFallback: false, enableRemoteWrites: false",
    '{}',
)
assert any('contentApiBaseUrl 必须使用 HTTPS' in item for item in unsafe_content['failures'])

unsafe_writes = validate_config(
    "baseUrl: 'http://api.example.com', contentApiBaseUrl: 'https://content.example.com', enableContentApi: false, enableLocalTestMedia: false, enableLocalSampleFallback: false, enableRemoteWrites: true",
    '{}',
)
assert any('baseUrl 必须使用 HTTPS' in item for item in unsafe_writes['failures'])
print('runtime config security tests: PASS')
