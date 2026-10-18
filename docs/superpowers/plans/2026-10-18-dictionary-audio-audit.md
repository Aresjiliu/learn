# 词典发音资源审计 Implementation Plan

> 按测试先行实施，独立检查规格与质量；遵循既有持续推进授权，不重复请求常规方案批准。

**Goal:** 产出可追溯、不会自动误配发音的真实资产候选统计。

**Architecture:** `scripts/audit_dictionary_audio.py` 只读读取教材导出、SQLite 和音频缓存，复用 `content_server/dictionary_normalization.py` 与既有 MP3 检查器；不增加运行时依赖。

**Tech Stack:** Python 标准库、SQLite v4、既有 gzip 与 MP3 资产。

## Task 1：夹具与离线审计

- [x] 新增 `scripts/test_dictionary_audio_audit.py`；临时 CSV 使用 `id,word,change_form_sound`，SQLite 使用 `entries(id,word,audio_ref)`，MP3 使用现有测试双帧夹具。
- [x] 运行 `D:\software\anaconda3\python.exe -B scripts/test_dictionary_audio_audit.py`，确认模块缺失导致失败。
- [x] 实现 `audit_audio(export_path, index_path, cache_dir)`，按严格原词分组全部合法来源，唯一哈希且缓存结构通过才输出候选；歧义、损坏和缺失分开计数。
- [x] 增加 `write_report(report, output, inputs, cache_dir)`，输出不能位于缓存目录或覆盖输入，且只能留在忽略目录，使用临时文件原子替换。CLI 接受显式路径，默认只输出汇总。
- [x] 运行 9 个定向测试，确认保留 `ё/е`、`й/и`，重复 ID/非法字段不静默覆盖，报告不修改资产。补充 WAL 源库无辅助文件和输入中途替换的失败回归，使用私有快照并核对哈希后转绿。路径逃逸通过模拟解析目标覆盖，未声称执行了 Windows 实体符号链接测试。

## Task 2：真实资产与审查

- [x] 实际运行审计到 `data/generated/dictionary-audio-candidates.json`；报告标记 `publicationReady=false`、结构候选而非语义验证。
- [x] 更新 `findings.md`、`progress.md` 及 `docs/phase1/` 的统计记录；加入阶段门禁。额外完整解码 1,122 文件均成功；完整 `check_phase1.ps1` 通过。
- [x] 独立规格/质量检查，修复 WAL 副作用与来源哈希错配；质量复审确认闭环，9 个夹具与完整阶段回归通过，生成报告被 Git 忽略。
- [ ] 提交源码与汇总文档并核对远端哈希。

## 后续边界

本机完整解码已另行验证；来源抽样听审、可发布白名单、HTTPS 媒体服务、词典 API 及页面播放接入仍是 A3 后续步骤，不得将仅候选审计完成标为 A3 完成。
