# 俄语7500小程序主链路 UI 改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页、课程详情、视频、题库和词典改造成统一的教材/考试型产品界面，并保持现有本地内容适配、权限判断、学习进度和只读安全边界。

**Architecture:** 保留现有 `services/`、`utils/request.js` 和页面 JS 业务逻辑；新增一套轻量 WXSS 视觉令牌与状态样式，按页面重构 WXML 信息层级。页面只消费现有规范化数据，使用 `local-sample`、`pending`、`error` 等明确状态，不新增后端接口或生产写入。

**Tech Stack:** 原生微信小程序 WXML/WXSS/JavaScript、现有 Node 回归脚本、PowerShell 阶段门禁、Python 本地内容/媒体服务。

---

## 文件地图与边界

- Create: `styles/design-tokens.wxss` — 颜色、间距、圆角、阴影、文字层级和通用状态类。
- Modify: `app.wxss` — 引入全局视觉令牌，保持现有全局基础样式。
- Modify: `pages/index/index.wxml`, `pages/index/index.wxss`, `pages/index/index.js` — 首页信息架构、状态标签、继续学习入口和课程卡片。
- Modify: `pages/course/detail/detail.wxml`, `pages/course/detail/detail.wxss`, `pages/course/detail/detail.js` — 课程详情、章节和词汇分区。
- Modify: `pages/course/video/video.wxml`, `pages/course/video/video.wxss` — 播放器、播放状态和章节列表。
- Modify: `pages/exam/list/list.wxml`, `pages/exam/list/list.wxss`, `pages/exam/practice/practice.wxml`, `pages/exam/practice/practice.wxss` — 题库目录、答题状态和复盘。
- Modify: `pages/dictionary/search/search.wxml`, `pages/dictionary/search/search.wxss`, `pages/dictionary/detail/detail.wxml`, `pages/dictionary/detail/detail.wxss` — 词典搜索、来源标签和详情状态。
- Create/Modify: `scripts/test_ui_contract.js` — 页面结构、状态文案、事件绑定和样式令牌静态契约。
- Modify: `scripts/check_phase1.ps1` — 纳入 UI 契约测试。
- Modify: `docs/phase1/acceptance-status.md`, `progress.md` — 记录代码验收与开发者工具验收的区别。

### Task 1: 建立视觉令牌和 UI 状态契约

**Files:**
- Create: `styles/design-tokens.wxss`
- Modify: `app.wxss`
- Create: `scripts/test_ui_contract.js`
- Modify: `scripts/check_phase1.ps1`

- [x] **Step 1: Write the failing contract test**

在 `scripts/test_ui_contract.js` 中读取令牌和目标页面文件，断言以下契约：令牌包含主色、背景、文字色、错误色、间距和卡片圆角；首页包含 `continue-card`、`content-status`、`course-card`；详情页包含 `chapter-section`、`word-summary`；视频页包含 `player-state`、`locked-state`；题库和词典页面包含错误/空状态入口。

- [x] **Step 2: Run the contract test**

Run: `node scripts/test_ui_contract.js`

Expected: FAIL because `styles/design-tokens.wxss` and the new structural classes do not yet exist.

- [x] **Step 3: Add the minimal shared visual layer**

创建 `styles/design-tokens.wxss`，定义固定值：主色 `#1f5f8b`、浅蓝 `#eaf3f8`、背景 `#f5f7f9`、正文 `#1f2933`、次级文字 `#667085`、考试橙 `#d97706`、错误红 `#c2413b`、卡片圆角 `20rpx`、页面边距 `32rpx`。在 `app.wxss` 增加 `@import "styles/design-tokens.wxss";`，不引入第三方组件库。

- [x] **Step 4: Run the contract test and syntax gate**

Run: `node scripts/test_ui_contract.js`

Expected: PASS for the shared token assertions; page structure assertions remain pending until their page tasks are complete.

- [x] **Step 5: Add the UI contract to the phase gate**

在 `scripts/check_phase1.ps1` 的 JavaScript 测试区加入 `node scripts/test_ui_contract.js`，并运行：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`。

Expected: 当前既有测试全部 PASS；若 UI 契约仍按页面分阶段，应先让契约只检查已完成的令牌，最后再启用完整断言。

## Task 2: 重构首页主入口

**Files:**
- Modify: `pages/index/index.wxml`
- Modify: `pages/index/index.wxss`
- Modify: `pages/index/index.js`
- Modify: `scripts/test_ui_contract.js`

- [x] **Step 1: Define the view model without changing services**

在 `pages/index/index.js` 保留现有 `courses`、`categories`、`courseLoading` 和 `courseLoadError`，新增默认状态字段：`hasLocalProgress: false`、`contentMode: 'local-sample'`、`contentModeLabel: '本地演示内容'`。课程接口返回后根据 `meta.source` 或配置计算标签；没有真实进度时不显示继续学习卡片。

- [x] **Step 2: Add the home page structural contract**

在 `scripts/test_ui_contract.js` 增加断言：首页必须包含搜索绑定 `handleSearch`、练习路由、词典路由、`course-card`、`content-status`、`course-state` 和课程点击绑定 `navigateToCourse`；不得依赖旧的大面积宣传 Banner 作为主要内容入口。

- [x] **Step 3: Rebuild the WXML hierarchy**

将首页 WXML 调整为：页面标题与简短说明、搜索卡、快捷入口、可选继续学习卡、教材课程分区、考级题库入口、分类横向标签、课程卡片、加载/错误/空状态。课程卡片显示 `title`、`wordCount`、章节或内容状态，价格在 `local-sample` 时显示“免费演示”，不显示“立即购买”。所有按钮保留现有事件或明确跳转 URL。

- [x] **Step 4: Replace the page WXSS**

使用令牌重写首页样式：页面边距统一为 `32rpx`；搜索卡高度 `88rpx`；快捷入口使用等宽操作卡；课程卡使用白底、`20rpx` 圆角、轻阴影和固定封面比例；分类使用横向滚动标签；加载、失败和空状态使用统一状态卡。删除固定头部覆盖内容的布局，避免截图中的大块空白和广告主导首屏。

- [x] **Step 5: Run focused tests**

Run: `node scripts/test_index_network_states.js; node scripts/test_ui_contract.js; node --check pages/index/index.js`

Expected: PASS；首页分类/搜索请求序列测试保持通过，契约确认所有入口仍有绑定。

## Task 3: 重构课程详情和视频播放

**Files:**
- Modify: `pages/course/detail/detail.wxml`
- Modify: `pages/course/detail/detail.wxss`
- Modify: `pages/course/video/video.wxml`
- Modify: `pages/course/video/video.wxss`
- Modify: `scripts/test_course_detail_states.js`, `scripts/test_course_video_navigation.js`, `scripts/test_ui_contract.js`

- [x] **Step 1: Preserve and expose the existing detail view model**

继续使用 `course`、`chapters`、`wordSummary`、`hasPreview`、`loadError` 和 `rowKey`。在 JS 中只补充展示字段：`contentModeLabel`、`courseStats` 和每个视频的 `statusLabel`；试听权限仍调用现有 `isPlayableWithoutPurchase`。

- [x] **Step 2: Rebuild detail WXML**

按封面/课程身份、主行动按钮、课程摘要、章节目录、关联词汇排列。目录使用 `chapter-section` 和 `rowKey`；锁定、试听、待接入状态分别绑定 `video.canPreview`、购买权限和 URL；词汇统计保留 `wordSummary` 四项指标，词条继续调用 `openWordDetail`。

- [x] **Step 3: Rebuild video WXML/WXSS**

播放器容器固定 16:9；`loadError` 使用 `player-state`，`playbackError` 使用可重试的 `player-state error`，无 URL 显示媒体待接入；章节列表保留在播放器下方，当前视频高亮，锁定视频显示 `locked-state`。不改动视频事件方法和本地进度服务。

- [x] **Step 4: Run focused media tests**

Run: `node scripts/test_course_detail_states.js; node scripts/test_course_video_navigation.js; node scripts/test_video_page_states.js; node scripts/test_video_access_policy.js`

Expected: PASS；权限、试听、下一节、错误和卸载保护行为不回归。

## Task 4: 统一题库与词典页面

**Files:**
- Modify: `pages/exam/list/list.wxml`, `pages/exam/list/list.wxss`
- Modify: `pages/exam/practice/practice.wxml`, `pages/exam/practice/practice.wxss`
- Modify: `pages/dictionary/search/search.wxml`, `pages/dictionary/search/search.wxss`
- Modify: `pages/dictionary/detail/detail.wxml`, `pages/dictionary/detail/detail.wxss`
- Modify: `scripts/test_exam_list_states.js`, `scripts/test_practice_load_states.js`, `scripts/test_dictionary_search_states.js`, `scripts/test_dictionary_detail_lifecycle.js`, `scripts/test_ui_contract.js`

- [x] **Step 1: Rebuild exam list and practice states**

试卷卡片显示题型、题量、解析/音频状态和 `content-status`；`canPractice=false` 使用禁用视觉和审核原因。练习页将选择题选项、填空输入、音频待接入、提交反馈和复盘列表分成独立卡片，保留现有 `selectAnswer`、`handleTextInput`、`submitAnswer` 和会话恢复逻辑。

- [x] **Step 2: Rebuild dictionary states**

搜索页使用统一搜索卡、结果卡和分页按钮，区分初始提示、无结果、查询失败和加载中。详情页突出俄语词形、词性、释义、例句和音频状态；教材词和主词典使用来源标签，保留现有兜底和请求卸载保护。

- [x] **Step 3: Run focused tests**

Run: `node scripts/test_exam_list_states.js; node scripts/test_practice_load_states.js; node scripts/test_dictionary_search_states.js; node scripts/test_dictionary_detail_lifecycle.js; node scripts/test_ui_contract.js`

Expected: PASS；题库判分、进度恢复、词典来源和错误状态测试均不变绿转红。

## Task 5: 视觉验收、回归和文档

**Files:**
- Modify: `docs/phase1/acceptance-status.md`
- Modify: `progress.md`
- Read: `docs/phase1/manual-acceptance-checklist.md`

- [x] **Step 1: Run the complete quality gate**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`

Expected: `phase1 checks: PASS`，包括 JavaScript、WXML、路由、资源、题库质量、映射和写入保护检查。

- [x] **Step 2: 准备本地服务并完成 API/媒体检查**

分别启动：`D:\software\anaconda3\python.exe scripts/serve_content_api.py` 和 `D:\software\anaconda3\python.exe scripts/serve_test_media.py`，完成本地 API 与媒体服务检查。此步骤不包括微信开发者工具 GUI 编译或页面验收；完成后恢复 `enableContentApi=false`，关闭服务。

- [ ] **Step 3: Validate the main flow in DevTools**

逐项记录首页搜索/分类、课程详情、免费试听、章节切换、词汇跳转、题库入口、词典搜索和错误/空状态。记录开发者工具真实编译结果；不把 CLI `open` 或静态门禁当作真机验收。

- [x] **Step 4: Update evidence**

在 `docs/phase1/acceptance-status.md` 记录页面视觉验收、未验收项目和当前配置；在 `progress.md` 记录文件变更、命令结果和任何未解决问题。明确 `enableRemoteWrites=false` 未改变。

- [x] **Step 5: 记录非Git检查证据（未创建Git checkpoint）**

当前工作区无 `.git` 元数据，不提交，也未创建 Git checkpoint。计划文件清单、`docs/phase1/acceptance-status.md` 与 `progress.md` 记录，以及全量 `check_phase1.ps1` PASS 输出属于检查证据材料，不等同可恢复的版本控制快照。

## 剩余未验收项（2026-10-17）

- 微信开发者工具 GUI 编译尚未验收。
- 页面视觉与交互尚未在开发者工具中验收。
- 真机主链路尚未验收。
- 真机视频渲染与播放尚未验收；本地媒体服务的 HTTP Range 验证不等同于页面或真机播放验收。

## 已完成的代码门禁

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1` 最终结果：`phase1 checks: PASS`。这是代码与静态质量门禁结果，不代表上述 GUI、页面或真机项目通过。
