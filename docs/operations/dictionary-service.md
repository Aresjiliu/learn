# 只读词典服务运行手册

## 本机环境与启动

Python 3.12，SQLite 必须支持 FTS5 `trigram`。项目独立环境位于 Git 和小程序打包均排除的 `data/generated/`；不要使用混装的 Anaconda Web 依赖。

```powershell
D:\software\anaconda3\python.exe -m venv data/generated/content-venv
data\generated\content-venv\Scripts\python.exe -m pip install --index-url https://pypi.org/simple -r content_server/requirements-dev.txt
data\generated\content-venv\Scripts\python.exe -m pip check
```

先执行完整索引构建命令（见设计规格，必须同时传主词典与词形导出）。已有经验证的 `data/generated/dictionary.sqlite` 可直接启动：

```powershell
$env:DICTIONARY_INDEX_PATH = (Resolve-Path data/generated/dictionary.sqlite).Path
data\generated\content-venv\Scripts\python.exe -B -m uvicorn content_server.app:app_from_env --factory --host 127.0.0.1 --port 18092 --no-access-log --log-level info --limit-concurrency 32 --timeout-keep-alive 5
```

另开终端运行 `data\generated\content-venv\Scripts\python.exe -B scripts/check_indexed_dictionary_http.py`，然后在微信开发者工具重新编译。当前 `config.js` 的词典单独指向 18092；课程/题库仍走已审核本地样本。旧 `scripts/serve_content_api.py` 的 18091 端口保留为课程/题库开发夹具。

完整检查为 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`。HTTP 测试使用独立环境；可通过 `CONTENT_PYTHON` 显式指定其他兼容解释器。受限沙箱可能阻断 Python 内部回环 socket，此时需执行权限审核，不以超时当作通过。开发 HTTP 地址只适用于开发者工具；手机上的回环地址不指向开发机。

## 教材发音本地接入

离线目录生成器使用 Python 3.12、SoundFile 0.13.1、NumPy 2.4.4（本机已存在），HTTP 服务不需要安装这两项。其他开发机请在独立音频工具环境安装相同版本，不改变内容服务环境；完整解码依赖其 libsndfile 的 MP3 支持。

```powershell
D:\software\anaconda3\python.exe -B scripts/build_development_audio_catalog.py --export data/remote_7500km/production_7500km_com__n_study_book_word.csv.gz --index data/generated/dictionary.sqlite --cache-dir audio/wordaudio --output data/generated/dictionary-audio-development.json
```

生成器重新执行严格原词审计，保留歧义拒绝规则，读取校验后的同一批字节完整解码，失败不进入目录。目录及 MP3 不进入 Git/小程序包。当前生成 1,082 个词条映射、0 条解码拒绝；这是可本地联调的来源绑定发音，不是语义听审或生产发布白名单。

在启动服务的同一终端显式配置以下内容，再执行上面的 Uvicorn 命令：

```powershell
$env:DICTIONARY_AUDIO_MANIFEST = (Resolve-Path data/generated/dictionary-audio-development.json).Path
$env:DICTIONARY_AUDIO_ROOT = (Resolve-Path audio/wordaudio).Path
$env:DICTIONARY_AUDIO_BASE_URL = 'http://127.0.0.1:18092'
$env:DICTIONARY_ENABLE_DEV_AUDIO = '1'
```

此模式只接受回环 HTTP 基址；默认关闭，未显式开启时不提供词典音频。首次加载把索引复制到服务私有临时目录，对复制字节计算 SHA 与目录核对；查询和音频绑定同一私有只读批次，不采用运行中被更新的原始文件。切换批次须重新生成目录、重启并烟测，退出时清理副本；额外临时空间约 478MB。健康字段 `servedSnapshotFixed=true` 表示固定批次，`audioCatalogCurrent` 指该服务副本存在，不表示追踪原始文件的最新状态。缺失、目录外、超限或哈希变化的 MP3 不返回可播放地址。媒体从核验后的内存字节响应，避免校验后重新打开路径。

运行 `data\generated\content-venv\Scripts\python.exe -B scripts/check_dictionary_audio_http.py` 检查真实搜索、详情、HEAD、Range 与完整文件哈希。小程序保持现有 18092 地址；例如查询 `камера` 应得到本地教材发音字段。播放页增加扬声器与可见重试状态，但实际视觉、iOS/Android 音频及 HTTPS 合法域名仍须单独验收。生产服务不要设置这些开发音频变量；本实现不会将开发目录自动升级为生产放行。

## 接口与错误

- `GET /health`：验证 v4 元数据、内容表和索引可读取；返回内容版本和词条数量。缺失、损坏、旧版本或空内容均返回 503。
- `GET /api/v1/content/manifest`：默认只声明 `dictionary`；显式开发音频模式额外声明 `dictionary-audio-development`。
- `GET /api/v1/dictionary/search?q=汽车&page=1&page_size=20`：俄中分层搜索；每页 1–100，词形候选保留歧义，分页须维持相同内容版本。
- `GET /api/v1/dictionary/<稳定id>`：唯一词条；无冲突旧 ID 兼容，重复旧 ID 返回 409。未找到返回 404，无效输入返回 400。

原始音频哈希不直接转为播放地址；开发模式只有已解码目录中的词条可获得白名单媒体 URL。`GET/HEAD /api/v1/dictionary/audio/<文件名>` 支持单 Range，未知或失效文件返回 404，超范围返回 416。服务不提供内容写入；日志只记录方法、路由模板、状态和耗时，不记录搜索词、token 或原始词典数据。

## 本地开发者工具自动化

开发者工具需已登录并在“设置 → 安全设置”开启服务端口。以下为本机已核实的 CLI 路径与实例端口；其他机器先确认安装位置和当前端口，不强制退出已有实例：

```powershell
& 'D:\software\微信web开发者工具\cli.bat' islogin --port 24586
& 'D:\software\微信web开发者工具\cli.bat' auto --project 'D:\project\learn' --port 24586 --auto-port 9420 --trust-project
npm install --prefix data/generated/wechat-tools --ignore-scripts --registry=https://registry.npmjs.org miniprogram-automator@0.13.0
node scripts/check_dictionary_devtools.js
```

`--port` 是 IDE 服务端口，`--auto-port` 是自动化 WebSocket 端口，不能混用。烟测读取模拟器状态、搜索、点击详情并保存截图；不调用 preview/upload，不发布代码，结束时只断开连接，不关闭 IDE。当前 `auto` 返回成功，但模拟器 `systemInfo()` 无响应并触发 45 秒超时，故尚无页面操作或视觉通过结论。CLI 成功和后端烟测不能代替截图及真机验收。自动化工具仅安装在忽略目录，不是小程序运行依赖。

## HTTPS 部署与更新

在独立 Linux 服务上安装 `content_server/requirements.txt`，上传应用包和验证后的版本化索引；运行账号只需读取该索引。Nginx 与 systemd 配置例在 `content_server/deploy/`，域名、证书和目录必须替换并用 `nginx -t` 校验。Uvicorn 监听回环，由代理提供 TLS、限流和连接数约束。示例配置尚未部署。

更新时构建新的 `dictionary-<批次>.sqlite`，保留旧文件；核对输出行数、两份来源哈希、`PRAGMA integrity_check`、聚焦测试与基准。更换 `DICTIONARY_INDEX_PATH` 后重启服务，再跑 HTTP 烟测。不要覆盖正在服务的文件；健康状态和详情版本必须一致。回滚时恢复旧索引路径并重启，重新运行烟测。备份包含版本化索引、构建报告和来源哈希，恢复演练纳入发布验收。

对真实域名还须验证证书链、微信 request 合法域名、目标服务器延迟、弱网与真机搜索/详情，再切换生产配置。仅有本机 200 响应不能证明这些项目完成。当前 `enableContentApi=false`、`enableRemoteWrites=false`；商品、支付与用户数据不在这个服务范围。

## 依赖与观测

`requirements.in` / `requirements-dev.in` 记录直接依赖；对应 `.txt` 文件固定此次解析出的传递依赖。更新时在新环境重新解析、检查并测试，不修改全局环境。当前测试仍使用 httpx 的兼容 TestClient 路径，Starlette 有开发期迁移提示；不影响本轮合约结果，迁移到新测试客户端单列后续维护项。

2026-10-18 已核对这组依赖的官方 PyPI 许可证和已知漏洞标记，当前未列出已知漏洞；这不替代发布前持续依赖审计。进程日志可观测 4xx/5xx 和请求耗时，生产告警、日志留存与备份恢复仍需目标环境实测。
