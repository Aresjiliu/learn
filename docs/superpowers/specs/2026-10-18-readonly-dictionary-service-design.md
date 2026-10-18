# 只读词典服务与检索索引设计

## 目标与依据

让小程序通过独立 HTTPS 内容服务查询完整俄中词典，而不是依赖本机 HTTP 或八词样本。已校验导出有 166,260 行；旧 `id` 有 164 组冲突，不能单独作为词条键。当前开发服务每次遍历约 16.4 万条词，实测常见查询约 335 ms；它继续只用于样本联调。

## 方案与边界

选择“只读导出 → 可重建 SQLite 索引 → FastAPI 查询服务 → TLS 终止代理 → 小程序”。不让小程序直连 MySQL；不修改生产库；不把原始导出、索引、私有音频或凭据提交 Git。索引由离线命令构建、校验后原子发布；运行服务只读打开，不在请求期间导入 CSV。FastAPI/Uvicorn 只绑定内网或回环地址，HTTPS、证书、限流和访问日志由反向代理承担；未验证域名和证书前不切换生产配置。

词条主键使用 `dict:<旧id>:<原词 NFC 的 SHA-256 前 16 位>`；保留 `sourceId` 和来源表供追溯。若同一键对应不同内容，构建失败并输出冲突计数，不静默覆盖。释义从 `XJSY` 提取，原始词形和词性保留；无释义的结果明确标注。旧 `sourceId` 详情路径只用于兼容无冲突记录，有歧义时返回明确错误，不任取一条。

搜索分层排序：规范化俄语精确 → 前缀 → 词形候选 → 子串 → 中文释义；`ё/е` 与重音差异可检索，但展示原词，同层优先输入的原拼写。去重音时必须保留独立字母 `й`，不能误折叠为 `и`。精确/前缀用普通索引，长度至少三字符的子串及中文释义用 FTS5 trigram；一至两字中文通过短语索引查询，俄语短词只做精确、前缀和词形查询。词形表有约 262 万行，多原型词形返回候选并标记歧义，即使其中某个原型暂缺主词典词条也不得标成唯一；不自动选第一项。排序必须稳定，分页上限 100，空查询和过长输入返回可理解错误。

## 接口与验证

保持 `/api/v1/dictionary/search?q=&page=&page_size=` 与 `/api/v1/dictionary/{id}`；响应沿用 `data.words`/`data.word` 和 `meta.source/page/page_size/total`，新增稳定 `id`、`sourceId`、`matchTier`、`ambiguous`。健康接口报告索引版本及就绪状态，不泄漏本机路径。服务故障时客户端明确提示“仅离线样本”，不能把样本显示为完整结果；只有已校验的 HTTPS 音频 URL 才能显示播放入口。

以真实导出和临时夹具测试重复 ID、`е/ё`、中文释义、歧义词形、排序、分页和恶意输入；记录冷/热查询 p50/p95、索引大小、构建耗时。目标是在目标服务器同等资源下热查询 p95 ≤150 ms；未达标不得启用生产词典。跑完整 `scripts/check_phase1.ps1`，再做开发者工具与真机域名/弱网验收。此规格不包含支付、用户同步或媒体迁移。

## 工程约定

生成：`D:\software\anaconda3\python.exe -B scripts/build_dictionary_index.py --source data/remote_7500km/ey_data__x_7500km_russian_index_new_test.csv.gz --output data/generated/dictionary.sqlite`；测试：`D:\software\anaconda3\python.exe -B scripts/test_dictionary_index.py`；全量门禁：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`。`content_server/` 放只读查询与 HTTP 层，`scripts/` 放生成器及 `unittest` 测试，`docs/operations/` 放运行手册。

Python 使用四空格与 `snake_case`，SQL 始终参数绑定，例如 `connection.execute('SELECT word FROM entries WHERE id = ?', (entry_id,))`；客户端保持 ES2018 与现有命名。始终校验输入、记录索引版本并运行测试；变更生产域名、证书或导出批次须先审核；绝不提交原始导出、索引、私钥或用户资料。部署平台尚未确定，因此部署脚本只提供可复核示例，不宣称已上线。
