# 只读词典服务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从已拥有的主词典和词形导出构建可重建、可审计、可分页的只读查询服务，并在验收后接入小程序。

**Architecture:** `scripts/build_dictionary_index.py` 负责离线构建；`content_server/dictionary_store.py` 只读查询；`content_server/app.py` 提供 FastAPI 契约；原 `scripts/serve_content_api.py` 保留为开发样本服务。部署代理独立提供 HTTPS，不把数据库或凭据放进小程序。

**Tech Stack:** Python 3.12 `csv/gzip/sqlite3`、SQLite FTS5、FastAPI/Uvicorn、原生微信小程序 JavaScript。

---

## 文件地图

- `scripts/build_dictionary_index.py`：导入、键生成、索引元数据和构建校验。
- `content_server/dictionary_store.py`：只读连接、分层检索与详情，不处理 HTTP。
- `content_server/app.py`：健康、词典搜索/详情、输入校验和统一响应。
- `scripts/test_dictionary_index.py`、`scripts/test_dictionary_store.py`、`scripts/test_dictionary_http.py`：小夹具到真实导出、API 契约与性能检查。
- `services/content-api.js`、`pages/dictionary/search/search.wxml`：稳定键优先跳详情；旧样本仍可用。
- `docs/operations/dictionary-service.md`：部署前置、索引更新、回滚、密钥与域名门禁。

### Task 1：稳定键和字典索引

- [x] 用 `unittest` 临时 CSV/GZIP 夹具写失败测试：相同旧 ID 不同词生成不同 `dict:` 键，重复键冲突时失败；缺词拒绝、释义提取和 `ё/е` 归一化可重复。
- [x] 运行 `D:\software\anaconda3\python.exe -B scripts/test_dictionary_index.py`，确认因模块缺失而失败。
- [x] 实现流式导入到临时 SQLite，建立 `entries(id PRIMARY KEY, source_id, word, normalized_word, meaning, word_class, audio_ref)` 与精确/前缀索引；生成后 `PRAGMA integrity_check`，检查行数并原子替换目标 `.sqlite`。
- [x] 运行聚焦测试并用真实导出构建 Git 忽略的索引；核对 166,260 行、主键唯一、来源批次哈希和构建时长。失败不得覆盖已有索引。
- [x] 只提交源码、测试和无敏感数据的计数报告；提交 `feat(dictionary): build readonly index`。

Task 1 验证记录：真实导出 166,260 行、旧 ID 重复 164 条、索引 47,247,360 字节、SHA-256 为 `800b8ddc93a53f2dd80c5fa5e12510ac5b4f34f45c388db767945a916b6d8586`；本机 `PRAGMA integrity_check=ok`。生成物在 `data/generated/`，Git 与小程序打包均排除。完整阶段门禁通过；这不证明 Task 2/3 或 HTTPS 真机验收完成。

### Task 2：俄中搜索与词形候选

- [x] 在 `scripts/test_dictionary_store.py` 先写失败用例：精确/前缀/子串/中文释义顺序、短查询、稳定分页、缺失详情、旧 ID 冲突，以及一词形多原型不得自动归原。
- [x] 运行 `D:\software\anaconda3\python.exe -B scripts/test_dictionary_store.py`，确认因查询模块缺失而失败；后续 `й/и` 和缺失原型歧义用例均先红后绿。
- [x] 在构建器增加 FTS5 trigram 与 `forms(form_normalized, prototype_strict, prototype_normalized, source_id)`；对 262 万行词形导出流式导入并建立查询索引。严格原型键保留 `ё/е` 差异，查询层只读打开，使用参数绑定、分页上限 100 和稳定二级排序。
- [x] 聚焦测试通过后，在真实索引上记录俄语与中文查询的本机热查询 p50/p95、索引大小和结果质量；目标服务器冷/热查询与链路延迟留作部署验收，不以本机结果替代。
- [x] 提交 `feat(dictionary): add ranked readonly search`，不提交 `.sqlite` 或导出。

Task 2 本机记录：[可复跑基准](../../phase1/dictionary-index-benchmark-2026-10-18.json)包含构建命令、来源哈希、进程首次/热查询 p50/p95 与口径。最终词典 166,260 行、词形—严格原型配对 2,619,728 条、歧义词形 58,926 个、索引 478,396,416 字节，`integrity_check=ok`，构建 40.113 秒。已修复 `й/и` 误合并和 `все/всё` 原型误合并；这些数字不证明 HTTPS、目标服务器或真机性能达标。

### Task 3：独立 HTTP 服务与客户端兼容

- [ ] 先写 `/health`、搜索、详情、错误输入、缺索引、只读权限的失败 HTTP 测试；旧开发服务契约继续保持通过。
- [ ] 实现 `content_server/app.py`，仅从显式索引路径启动；缺索引时就绪检查失败。增加依赖版本文件与部署配置示例，Uvicorn 绑定回环地址，代理承担 HTTPS/限流/日志。
- [ ] 更新客户端结果键为 `id || sourceId`，保留旧样本路径；扩展 Node 契约测试验证重复词条路由不碰撞、服务故障提示不伪装完整结果。
- [ ] 跑 HTTP、Node 聚焦测试与 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`，再用开发者工具检查搜索/详情/错误态；真机 HTTPS 待真实域名与证书就绪后单独记录。
- [ ] 提交 `feat(dictionary): serve indexed search` 并核对远端提交哈希。

## 发布边界

未完成目标环境的 HTTPS 域名、证书、服务资源及真机验证前，`enableContentApi=false`、`enableRemoteWrites=false` 保持原状；Task 1–3 的代码通过不等于生产上线。
