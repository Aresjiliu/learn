# Visual Baseline and Reliable Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一既有页面视觉，交付真实续学与可控、失败安全的视频学习体验。

**Architecture:** 保留内容适配、课程身份和只读保护。在playback-progress增加受保护快照API，播放器内部管理VideoContext及播放实例，页面管理用户行为；首页读取同一快照。只建设本机记录，不声称账号云同步。

**Tech Stack:** 原生JS/WXML/WXSS、Vant1.11.7现有闭包、Node VM行为测试、微信原生VideoContext/ActionSheet。

批准规格：`docs/superpowers/specs/2026-10-19-visual-playback-batch-design.md`。原地工作树，不覆盖既有未提交UI。实施代理不自行提交/推送；主代理在审查与视觉门禁后精确暂存。规格审查通过才做质量审查。

## Task 1：安全本机播放记录

Files: `services/playback-progress.js`；新 `scripts/test_playback_records.js`；保留 `scripts/test_playback_progress.js` 与现有recent/navigation回归。

- [ ] 写行为RED：同videoId不同courseId不串；0位置覆盖旧值；数字0有效；有限非负时间校验；读/写异常、未知版本、损坏、容量200、输入/返回引用、v1归属和不写读路径。
- [ ] 运行 `node scripts/test_playback_records.js`，确认缺API/行为导致FAIL而非夹具拼写问题。
- [ ] 新接口按规格返回对象：

```js
const result = savePlaybackRecord(storage, {
    courseId: 'book-a', videoId: 'video-a', position: 42,
    duration: 300, courseTitle: '大学俄语', videoTitle: '第一课'
})
assert.strictEqual(result.ok, true)
assert.strictEqual(getPlaybackRecord(storage, 'book-a', 'video-a').record.position, 42)
assert.strictEqual(getPlaybackRecord(storage, 'book-b', 'video-a').record, null)
```

- [ ] 保留旧签名正常语义，异常显式false/默认值；不写回v1。深拷贝后修改/写入，避免wx返回对象被原地污染。
- [ ] 聚焦运行新旧记录测试、`test_resume_video_navigation.js`、`test_video_pause_progress.js`。独立规格、质量审查，修复后重跑；完整注册由主代理统一完成。

## Task 2：播放实例与学习控制

Files: `components/media-player/media-player.{js,wxml,wxss}`、`pages/course/video/video.{js,wxml,wxss,json}`；可新增单职责 `services/playback-preferences.js`；新行为测试 `scripts/test_video_learning_controls.js`、`scripts/test_media_player_session.js`。

- [ ] 读当前Page/Component VM测试，写RED覆盖切集先存A、旧A/重试旧事件拒绝、后台/退出、保存失败仍可播放/重试原身份、媒体时间非法。
- [ ] 记录通过Task1API读写；切片生成新sessionId并让实例级节点携带不可变身份（不能仅在事件到达时读可变当前属性）。统一切集/下一节/重试路径，不散落多个不一致状态重置。
- [ ] 写RED覆盖实际VideoContext.playbackRate调用、五档选择、无效档位/失败、重建重新应用、seek(0或current-10)、自动下一节开关；用真实组件方法，mock仅wx原生边界。
- [ ] 实现原生选择和组件命令，命令应用后才更新展示；API可用性/异常反馈及偏好读写失败不打断播放。保留字幕无时间轴不伪实现。
- [ ] 运行新测试及所有`test_video_*.js`、`test_media_player.js`、记录/课程导航/购买门禁。旧静态断言随等价新契约迁移，不删除原身份/权限/凭据断言。独立规格审查→质量审查。

## Task 3：统一视觉与真实首页续学

执行写集拆分：3a全局token/导航/非首页旧品牌样式；3b首页JS/WXML/WXSS与续学测试。与播放器任务无文件交集，允许并行；`test_ui_contract.js`仅3a改token期望，其余断言迁移由主代理集成，避免相互覆盖。

Files: `styles/design-tokens.wxss`、`app.wxss`、`app.json`；`pages/index/index.{js,wxml,wxss}`；各页WXSS中的旧品牌蓝及共享面板；词典阅读样式/业务保留。Tests: 新`test_visual_baseline.js`、新`test_home_resume_record.js`，现有`test_learning_home_ui.js`、`test_ui_contract.js`、`test_index_network_states.js`。

- [ ] 写RED检查白导航/一致底栏、非图片蓝品牌遗留、共享视觉token、真实record展现、无记录/损坏/请求失败、课程身份与恢复路由、卸载/快速刷新不setData；不靠正则宣称真实渲染。
- [ ] 实现暖灰底/白面板/细线/受控强调，正文系统字体；替换局部品牌蓝为语义token，保留告警/错误。必要现有tab图标先检验像素，不擅自引入远程图。
- [ ] 首页续学卡放在快捷入口前，调用getRecentPlayback，展示真实标题/时间；服务未给标题则明确回退文字，不造完成百分比。保持原搜索/分类/加载/失败/重试行为；不接支付。
- [ ] 首页/视频先成为样板，其余已有页去品牌冲突；词典白色正文不被全局底色污染。看实际字体，不因CSS含font-family而宣布字体正确。
- [ ] 运行新旧UI/首页/导航/媒体测试，独立规格和质量审查；真实开发工具截图/窄屏/真机仍分别记门禁。

## Task 4：集成与交付

- [ ] 在`scripts/check_phase1.ps1`注册每个新测试，一项失败即停止；保留隔离构建夹具，不污染live miniprogram_npm。
- [ ] 运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1` 并检查最终退出码；环境失败先诊断，不降门禁。
- [ ] 运行现有忽略目录内离线编译脚本，明确仅原生语法验证；按可用权限只读查看DevTools，不通过preview/upload替代本地编译。
- [ ] `git diff --check`、检查仅预期源码/文档变更，不暂存用户ui/数据/媒体/凭据。源码未视觉验收则保留工作树，记录已验证与未验证。
- [ ] 更新task_plan/progress/findings；本批不能被写成购买/账号/云同步已完成，不将总goal标完成。
