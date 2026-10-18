# 小程序技术路线与产品开发计划

## 目标

当前执行切片（2026-10-18）：依据用户提供的 `learn/ui` 和 `Russion1/ui` 重建词典体验。新的持续 goal 已创建为 active；此前发音服务成果保留，UI 第一轮调整被用户明确否定，不能以旧规格或静态测试视为验收。

### 本轮推进顺序

- [x] U1：逐图审查当前与参考设计，读取 Russion1 对应代码，建立视觉/功能复用证据。
- [x] U2：正式Vant1.11.7与icons3.0.1核验锁定，预编译闭包与离线字体、双MIT、包体预算门禁和双审完成；M0已提交推送，页面视觉仍独立验收。
- [x] U3：搜索—词条详情设计规格与 M0–M5 分片计划已形成，用户已确认白底/紧凑搜索/黑正文/珊瑚红方向；不代表已实现。
- [ ] U4：M1搜索/历史/行式结果已实现并通过双审、完整回归及本地原生模板样式编译；M2详情重建与新版页面多尺寸截图尚未完成。
- [ ] U5：稳定 ID 本地生词本、迁移/去重、到期复习，打通教材学习链路。
- [ ] U6：回归、审查、安全版本控制、部署门禁；不提前宣称生产完成。

本轮依据：`docs/research/2026-10-18-dictionary-ui-rebuild.md`、`docs/superpowers/specs/2026-10-18-dictionary-experience-rebuild-design.md`、`docs/superpowers/plans/2026-10-18-dictionary-experience-rebuild.md`。优先 M0→M1→M2，再 M3 数据与 M4 学习闭环；原有资产/服务成果保留。

在不预设新 API 或新框架的前提下，盘点俄语教育资产的业务价值，确定微信小程序的开发基线、可复用仓库、后端复用策略和分阶段商业化开发路线。

## 阶段

- [x] 阶段 1：扫描并分类 D:\project 下的 7500km、俄语、HarmonyOS 相关项目。
- [x] 阶段 2：评估现有微信小程序、Android、后端和 HarmonyOS 的功能逻辑与可复用程度。
- [x] 阶段 3：比较技术路线，形成选型建议和风险清单。
- [x] 阶段 3.5：完成业务价值分析、产品拆分和完备开发计划书。
- [x] 阶段 3.6：完成视频、音频、动效、发音评测、长列表和自动化测试的 GitHub 深度调研。
- [ ] 阶段 4：完成内容/媒体放行基线后，建设学习核心适配层并完成首个功能切片（进行中）。

## 当前决策边界

- `docs/phase1/api-contract.md` 仅作为候选数据模型，不代表已确定的后端接口。
- 在技术路线确定前，不新增后端 API，不迁移用户数据，不修改生产服务。
- 当前确定基线为原生 `learn`；后端确定采用适配层优先，具体部署仍需真实接口和媒体验证。
- 首个切片使用“旧接口优先 + 本地样本回退”的方式验证页面，不代表已确定后端路线。
- 完整业务与开发计划见 `docs/plan/business-value-and-development-plan.md`。
- 当前代码审查、版本控制、视频、音频和 UI 修复顺序见 `docs/plan/2026-10-18-development-audit.md`。
- 新下载仓库的模块级复用和目标目录见 `docs/architecture/selected-framework-and-reuse.md`。
- GitHub 深度调研和复用优先级见 `docs/research/github-deep-dive.md`。
- 内容与媒体生产基线设计和执行计划见 `docs/superpowers/specs/2026-10-14-content-media-foundation-design.md`、`docs/superpowers/plans/2026-10-14-content-media-foundation.md`。

## 验收标准

- 项目分类有路径、技术栈、状态和证据。
- 至少比较直接复用、适配层、独立服务三种路线。
- 明确推荐的小程序代码基线和首个垂直功能切片。
