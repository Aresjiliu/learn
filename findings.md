# 调研发现

## 2026-10-14

- 当前工作目录是微信小程序项目，根目录包含 `app.js`、`app.json`、`app.wxss`、`pages/`、`utils/` 和 `config.js`。
- 已存在的内容库导入产物可用于本地分析和测试，但不构成后端技术路线决定。
- 现有 API 契约应降级为候选数据访问模型，待仓库和后端复用评估后再收敛。
- `learn` 已有课程列表、详情、视频、收藏、我的课程和个人中心，但缺少词典、题库、音频和真实支付闭环。
- `learn/config.js` 当前使用 `127.0.0.1:8000`，只能作为本地开发配置，不能作为真机或生产配置。
- `7500km-android` 是业务流程和接口字段的主要参考，不应直接迁移 Android 实现。
- `Russion1` 与 `Wordsearch` 的俄语搜索、词形、重音、历史和会员流程最值得提取。
- `weixin` 具备课程后端原型，但订单、支付、登录和生产配置不完整，不能直接承接正式收入。
- `Russion_Stt` 适合后续独立为发音评测服务；RAG 和语音项目暂不作为小程序基础工程。
- Android API 文档显示旧系统使用多服务地址、签名参数和响应加密；这些机制不能直接放进小程序，必须先验证可访问性和合规性。
- `weixin` 已有课程、章节、视频、进度、收藏和订单路由，但订单视图会直接将订单置为已支付，不能直接用于正式支付。
- 首个垂直切片确定为“课程列表 → 课程详情 → 免费首节播放 → 关联词汇展示”，暂不依赖支付和复杂登录。
- 本地教材库包含 31 本教材、63,783 条教材词汇和 15,370 个去重单词；其中 62,773 条可精确匹配主词典，匹配率约 98.4%。
- 教材表包含封面相对路径，但封面文件未随本轮数据库导入；`learn` 仅有 UI 图片。
- `weixin/media/video/` 有 6 个本地 MP4、约 1.68 GB，暂只能作为试听页面验证素材，不能直接视为生产课程媒体。
- Android 小型 MP3 资源主要是字母发音或演示音频，尚未发现完整课程音频资产。
- 已从本地隔离库生成 `data/content_samples/` 页面验证样本：教材元数据、1,247 词样本和 7,836 词样本，未包含用户数据。
- 已补充外部 skill 和 GitHub 调研；没有发现可直接替换当前俄语课程业务的成熟仓库。
- `eoeac/lingosnake` 最值得借鉴学习核心组织方式；官方 `wechat-miniprogram/miniprogram-demo` 最值得借鉴工程、云函数和测试规范；`davyzhong/miniprogram-learning-diagnostic` 最值得借鉴 AI 学习闭环状态模型。
- 已安装并读取 `wechat-miniprogram-skill`；Skyline、CloudBase 和低安装量自动化测试 skill 暂不安装，避免提前锁定技术路线。
- 业务价值最高的组合不是单一课程页面，而是“教材词表—主词典—词形—例句—题库—学习记录”的关联网络；应优先建设可持续复习和考试闭环。
- 产品拆分建议为：P0 小程序内容入口；P1 词典与词汇学习、题库与考试；P2 低价订阅/课程包商业化和 AI 增值服务。
- 完整计划书已写入 `docs/plan/business-value-and-development-plan.md`，明确了数据三层、适配层路线、5 个实施阶段、验收指标和风险门。
- 两个仓库已落盘：`lingosnake-main` 和 `miniprogram-demo-master`。LingoSnake 执行 `npm run prepare; npm test` 后全部测试通过；未执行准备步骤时仅因生成数据文件缺失而失败。
- 技术路线已从候选收敛为：原生微信小程序 + 原生 JavaScript + 适配层 + MySQL/既有内容服务；不采用 Taro、Uni-app、TypeScript、Skyline 或 CloudBase 作为第一版主链路。
- LingoSnake 的核心价值是可测试的复习调度、题目生成、词形关系、会话锁和多教材进度；其英语字段、纯本地存储和整套页面不能直接复制。
- 官方示例的核心价值是组件写法、原生登录/支付调用边界、隐私协议页面和工程验证参考；其综合演示页面、云函数、分包和 Skyline 结构不应搬入业务项目。
- GitHub 深度调研报告已写入 `docs/research/github-deep-dive.md`；重点结论是播放器、音频会话、发音评测、学习状态一致性、支付和弱网是主要难点。
- 可重点参考 `Tencent/iHearing` 的小程序口语测评示例、`wechat-miniprogram/lottie-miniprogram` 的动画适配、`jin-yufeng/mp-html` 的富文本/音视频、`wechat-miniprogram/miniprogram-component-plus` 的视频事件模型和官方 `miniprogram-automator` 测试方案。
- `miniprogram-component-plus` 已归档，腾讯播放器插件只适用于腾讯视频资源；它们只能参考，不能直接作为现有课程 MP4 的生产方案。
- 推荐自建 `components/media-player`、`services/media/audio.js` 和 `services/media/recorder.js` 薄封装；复杂 Canvas/粒子特效不进入首发。
- 内容质量报告发现：主词典 166,260 行规范化后 165,998 词；教材词汇 63,783 行规范化后 15,379 词，其中 438 个教材-单词组合重复；按去重词统计与主词典匹配率为 88.4323%。这与历史按明细行统计的约 98.4% 不同，需统一匹配口径后才能建立可靠质量指标。
- 内容缺陷包括教材词汇缺失重音 1,721 条、缺失释义 1,031 条、例句缺失字段 5 条、题目缺失答案 724 条、缺失解析 3,207 条；题库不能在未经清洗的情况下全量开放。
