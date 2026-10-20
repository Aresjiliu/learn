# Integrated Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development，TDD实施，规格→质量双审。

**Goal:** 将外置学习控件迁入视频，形成普通/全屏一致且失败安全的一体化播控。

**Architecture:** 原生video及内部覆盖层由media-player拥有；页面只维护课程权限、进度与偏好。沿用不可变session事件与既有本机记录，不新增播放器SDK或存储格式。

**Tech Stack:** JS/WXML/WXSS、VideoContext、cover-view、自定义触摸进度、Node行为测试。

规格已由用户确认推荐方案后整理：`docs/superpowers/specs/2026-10-20-integrated-player-design.md`。保持当前原地工作树与DevTools，不覆盖历史未提交修改。

## Task 1：组件内播控（子代理）

写集：`components/media-player/media-player.{js,wxml,wxss,json}`、`scripts/test_media_player_session.js`、新`scripts/test_media_player_controls.js`。不修改页面/全局样式/进度服务。

- [ ] 先写并运行 `node scripts/test_media_player_controls.js`：缺控件方法/真实命令导致RED。真实组件实例只替换wx原生边界与计时器，不给生产组件加测试专用API。
- [ ] 保留现有setPlaybackRate/seekTo/pause与事件不可变身份，增加组件data及必要方法。行为示例：

```js
instance.onTimeUpdate({ detail: { currentTime: 7, duration: 80 } })
instance.rewindTenSeconds()
assert.deepStrictEqual(commands.pop(), ['seek', 0])
instance.forwardTenSeconds()
assert.deepStrictEqual(commands.pop(), ['seek', 17])
```

- [ ] video内部cover-view一套播控、进度触摸、五档倍速面板和自动下一节设置；关闭重复原生控制UI。实际pause/play/seek/playbackRate/requestFullScreen调用失败不伪确认；清理计时器，面板/拖动阻止自动隐藏；无效/未知duration不伪进度。
- [ ] 实施契约：autoNext属性；`autonextchange`含不可变sessionId与boolean value。新组件测试涵盖触摸测量迟到/取消/销毁、全屏请求/回调、计时器晚到、失败速率、非法事件；更新原测试夹具提供真实data/setData，保留旧断言。
- [ ] 运行新旧组件测试及页面33项，反馈必要接线改变；冻结写集后规格审查→质量审查。不得自行提交/推送。

## Task 2：页面接线（主代理，与Task1写集分离）

写集：`pages/course/video/video.{js,wxml,wxss}`、`scripts/test_video_learning_controls.js`、新`scripts/test_integrated_player_page.js`，测试注册`scripts/check_phase1.ps1`。

- [ ] 先RED：

```js
const old = event(page, { value: true })
select(page, 'B')
page.onAutoNextChange(old)
assert.strictEqual(page.data.autoNext, false)
page.onAutoNextChange(event(page, { value: true }))
assert.strictEqual(page.data.autoNext, true)
```

- [ ] 最小新增守卫接线：

```js
onAutoNextChange: function(e) {
    if (!this.acceptsEvent(e)) return
    this.toggleAutoNext(e)
}
```

- [ ] media-player传`auto-next="{{autoNext}}"`并绑`bindautonextchange="onAutoNextChange"`；删外置learning-controls卡及专属样式，保留learning-feedback保存错误与重试。旧外置视图正则改新等价接线契约，其他身份/凭据/失败/后台测试不删。
- [ ] 注册两项新测试，全组件/页面/记录回归；随后独立规格→质量审查。

## Task 3：集成与视觉验收

- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`最终退出0；测试期间源码SHA一致。
- [ ] 忽略目录内原生编译36/26基线不得退化；确认本地媒体18090服务，不以CLI preview上传代替本地编译。
- [ ] 真实工具截图检查普通/全屏控件，面板/字幕/安全区；320/375/390宽与iOS/Android未实测则保留未验收。全屏不成立先诊断原生子节点，不宣称兼容。
- [ ] 更新progress/task_plan/验收记录、精确diff检查；不提交用户ui/媒体/数据/凭据。视觉未验收源码保留工作树，非交易目标不扩大为支付/发布。
