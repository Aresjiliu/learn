# 词典发音服务 Implementation Plan

**Goal:** 实际打通教材发音到完整词典详情的本地开发链路，不更改生产放行状态。

**Architecture:** 离线生成已解码目录，服务端白名单验证并返回字节；小程序沿用现有播放器。

**Tech Stack:** Python 标准库、现有 SoundFile/NumPy 离线环境、FastAPI、原生小程序。

## Task 1：目录生成与只读读取

- [ ] 先新增 `scripts/test_dictionary_audio_catalog.py`，临时索引和 MP3 夹具验证明确开发门禁、文件边界、SHA-256、目录格式、离线生成解码拒绝与来源保留；运行观察模块缺失失败。
- [ ] 新建 `content_server/audio_catalog.py`，实现 `AudioCatalog(manifest_path, index_path, root, base_url, development_enabled)`、`decorate(word)`、`read_file(filename)`；默认不开启，复制私有索引并核对 SHA，查询和音频同批次，退出清理。
- [ ] 新建 `scripts/build_development_audio_catalog.py`，调用现有审计并完整解码受限字节，生成开发目录到 `data/generated/`；生产标识保持 false。

## Task 2：HTTP 与小程序链路

- [ ] 扩展 `scripts/test_dictionary_http.py`：未开启目录不返回音频，开启后搜索/详情一致、版本可区分，媒体 HEAD/Range/未知或坏文件行为明确。
- [ ] `content_server/app.py` 接收显式音频参数与环境开关，元数据带目录版本；只对白名单提供媒体。
- [ ] 将现有 `parse_range` 移入 `content_server/media_range.py` 并让开发媒体脚本继续复用，保持现有媒体测试。
- [ ] 小程序词典使用扬声器按钮、来源标签与失败重试状态；先补页面行为断言，再修改页面。

## Task 3：真实联调与交付

- [ ] 生成真实开发音频目录，记录解码成功/失败和覆盖数量；不提交目录或 MP3。
- [ ] 在独立本机端口启动新服务，验证真实搜索→详情→HEAD/Range 的内容哈希；运行完整阶段门禁。
- [ ] 独立审查、修复、提交并核对 GitHub 远端；明确页面/真机/HTTPS 未验收项，继续 A4/B1，不标记综合目标完成。
