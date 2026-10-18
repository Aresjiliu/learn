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

## 接口与错误

- `GET /health`：验证 v4 元数据、内容表和索引可读取；返回内容版本和词条数量。缺失、损坏、旧版本或空内容均返回 503。
- `GET /api/v1/content/manifest`：只声明 `dictionary` 能力。
- `GET /api/v1/dictionary/search?q=汽车&page=1&page_size=20`：俄中分层搜索；每页 1–100，词形候选保留歧义，分页须维持相同内容版本。
- `GET /api/v1/dictionary/<稳定id>`：唯一词条；无冲突旧 ID 兼容，重复旧 ID 返回 409。未找到返回 404，无效输入返回 400。

原始音频哈希不转为播放地址。服务仅 GET 内容读取；日志只记录方法、路由模板、状态和耗时，不记录搜索词、token 或原始词典数据。

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
