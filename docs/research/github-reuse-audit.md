# GitHub 与开发 Skill 调研

## 调研范围

截至 2026-10-14，检索了 skills.sh、GitHub 公开仓库和官方微信小程序示例。关键词包括：微信小程序、课程、词汇训练、词典、题库、音频学习、AI 学习诊断。重点查看了 README、目录结构、许可证和公开架构说明；没有下载外部仓库代码。

## Skills

### 已安装

- [`gourdbaby/wechat-miniprogram-skill`](https://skills.sh/gourdbaby/wechat-miniprogram-skill/wechat-miniprogram-skill)：原生 JavaScript 小程序开发、WXML/WXSS、性能和兼容性建议，约 1.4K installs。已安装并读取；安装器的 PromptScript 全局适配步骤失败，但 skill 文件已落盘。

### 暂不安装

- Skyline 组件相关 skill：当前项目是原生旧式 WXML/WXSS，尚未决定迁移 Skyline。
- CloudBase 小程序 skill：检索结果约 186 installs，但当前后端路线尚未决定采用云开发。
- 自动化测试 skill：检索到的 WeApp 自动化 skill 安装量很低，先使用微信开发者工具和现有静态检查，待测试方案明确后再评估。

## 可复用仓库

### 1. [`eoeac/lingosnake`](https://github.com/eoeac/lingosnake)

MIT；原生微信小程序词汇训练，约 2 stars。目录把平台无关学习逻辑放在 `src/core/`，页面放在 `src/pages/`，并让 Node 测试复用同一套核心模块。可借鉴间隔复习、错题本、学习会话锁、数据准备脚本和测试组织。与本项目不同：英文、公开样本数据、规模较小，不能直接复用俄语数据模型。

### 2. [`wechat-miniprogram/miniprogram-demo`](https://github.com/wechat-miniprogram/miniprogram-demo)

MIT；官方示例，约 7.2K stars。包含原生组件、云函数、测试目录、npm 构建和隐私/授权示例。适合作为工程规范、构建脚本、云函数和小程序原生能力参考，不应替换业务代码。

### 3. [`davyzhong/miniprogram-learning-diagnostic`](https://github.com/davyzhong/miniprogram-learning-diagnostic)

Apache-2.0；AI 学习诊断小程序。其流程把识别、诊断、针对性练习、验证试卷和掌握状态串成闭环；英文词汇模块包含口语识别、听写、错词聚合和双维掌握度。可借鉴未来俄语题库/发音训练的状态模型，但视觉识别和英语数据不适合直接迁移。

### 4. [`storyandwine/CourseSelectionWeapp`](https://github.com/storyandwine/CourseSelectionWeapp)

MIT；微信云开发课程表项目。可参考课程详情组件、云函数拆分、文件上传、订阅消息和课程数据组织。它依赖云开发且业务简单，不作为当前后端基线。

### 5. [`coderwhy/LearnMiniProgram`](https://github.com/coderwhy/LearnMiniProgram)

MIT；约 3.3K stars，偏教程和原生小程序基础工程。适合查阅页面、组件、服务层和登录流程的演进，不包含可直接复用的教育业务。

## 结论

当前最合理的组合仍是：`learn` 作为微信前端基线，`7500km-android`/`Russion1` 提供业务逻辑和字段参考，LingoSnake 提供学习核心模块组织方式，官方示例提供工程规范。暂不迁移 Skyline、CloudBase 或任何跨端框架，也不直接复制外部仓库代码。
