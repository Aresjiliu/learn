# 首发教材词汇映射审核模板

文件 `first-wave-mapping-review.json` 是首发教材待复核词条的独立审核模板，目前覆盖《东方教材大学俄语3》和《俄语专业大纲综合》。它不是已批准映射表，不会被运行时内容 API 自动读取。

## 审核填写规则

- `pending`：尚未判断，不能进入运行时映射。
- `approved`：确认教材词与主词典原型一致；必须填写 `selectedPrototype`、`dictionaryId` 和 `reviewNote`。
- `rejected`：候选原型不成立，保留教材内容，但不提供主词典补充能力。
- `needs-more-data`：需要补充词典、词形或上下文数据后再判断。

教材已有释义应继续保留。审核只确认“是否关联主词典”，不能覆盖教材释义，也不能修改原始教材或主词典导出。

审核完成后运行 `D:\software\anaconda3\python.exe -B scripts/export_approved_mapping_runtime.py`，只会导出 `approved` 且字段完整的记录到 `data/content_samples/mapping_decisions.js`；`pending`、`rejected` 和 `needs-more-data` 不会进入运行时。

对于 7 条 `ambiguous-word-form` 记录，可先查看自动生成的 [`first-wave-candidate-report.md`](first-wave-candidate-report.md)。该报告把审核模板候选与现有词形索引合并展示；标记为“ID 未提供 / 需核对”的候选只能作为人工复核线索，不能直接批准。

阶段检查会验证报告与审核模板的记录数、候选原型和 `pending` 状态一致；修改审核模板或词形索引后，应重新运行 `python scripts/build_first_wave_candidate_report.py` 更新报告。

阶段检查还会比较审核模板和运行时模块中的 `approved` 数量；审核后若未重新导出，检查会失败，不允许带着过期映射继续验收。
