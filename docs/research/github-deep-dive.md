# GitHub 深度调研：难点、可复用模块与加分能力

更新时间：2026-10-14

## 1. 评估结论

当前最难的不是页面绘制，而是媒体权限与断点、学习状态一致性、俄语语音评测、内容安全、支付权益和弱网体验。外部项目适合提供局部实现和验证思路，不适合整仓替换。第一版应减少依赖，优先把高风险能力封装为本项目自己的薄组件。

评级说明：A=可直接作为参考或小范围复用；B=可借鉴但需重写/验证；C=不建议进入第一版。

## 2. 高难度模块与参考项目

| 模块 | 难度 | 主要问题 | GitHub 参考 | 建议 |
|---|---:|---|---|---|
| 视频课程播放器 | 高 | 合法域名、鉴权、断点续播、清晰度、横竖屏、iOS/Android 差异、播放失败重试 | [`miniprogram-component-plus`](https://github.com/wechat-miniprogram/miniprogram-component-plus) 的 `video-swiper`；[`txv-miniprogram-plugin`](https://github.com/tvfe/txv-miniprogram-plugin) | A/B：保留原生 `video`，自建 `media-player` 封装；只有确认使用腾讯视频托管时才评估插件 |
| 录音与音频播放 | 高 | 静音开关、系统中断、缓存、进度同步、文件格式、权限拒绝 | [`w-components`](https://github.com/wangzongming/w-components)；[`mp-html`](https://github.com/jin-yufeng/mp-html) audio 扩展 | B：借鉴 UI 和事件模型，底层统一使用 `InnerAudioContext`，许可证需单独核查 |
| 发音评测 | 很高 | 录音质量、噪声、音素/重音/流畅度、服务费用、结果解释 | [`Tencent/iHearing`](https://github.com/Tencent/iHearing)；本地 `D:\project\Russion_Stt` | A/B：先验证插件可用性和俄语支持；俄语专属能力走现有独立服务，不在小程序内做 DSP |
| 间隔复习与题目生成 | 中高 | 断网、跨设备、补学、重复答题、服务端与客户端冲突 | 本地 `lingosnake-main/src/core`；[`eterplan`](https://github.com/omigeft/eterplan) | A：以 LingoSnake 为核心，改成俄语字段并增加服务端事件记录 |
| 富文本课程/解析 | 中 | HTML 安全、图片/音视频、锚点、长内容渲染 | [`mp-html`](https://github.com/jin-yufeng/mp-html) | A：题目解析、课程介绍、AI 报告使用；必须白名单过滤 HTML |
| 学习动效/反馈 | 中 | Canvas 性能、动画销毁、包体、低端设备兼容 | [`lottie-miniprogram`](https://github.com/wechat-miniprogram/lottie-miniprogram)；[`mp-progress`](https://github.com/lucaszhu2zgf/mp-progress) | A/B：仅用于完成反馈、徽章、圆环进度；核心交互优先用 WXSS 动画 |
| 长词表/题库列表 | 中高 | 数万条数据、setData 体积、图片和滚动卡顿 | [`wechat-long-list-chunk`](https://github.com/zhanghaoxu/wechat-long-list-chunk)；官方 `recycle-view` 思路 | B：先服务端分页+本地索引；只有真机出现卡顿才引入虚拟列表 |
| E2E 与 UI 回归 | 中高 | 开发者工具连接、页面等待、媒体和网络 mock、截图基线 | 官方 `miniprogram-automator`；[`mpx-e2e`](https://github.com/mpx-ecology/mpx-e2e) | A：原生项目直接使用官方 Automator；MPX 工具只参考 mock/等待设计 |

## 3. 视频与音频的具体方案

### 视频：自建课程播放器组件

新建 `components/media-player/`，内部使用原生 `video`，对外只暴露：`src`、`poster`、`startTime`、`previewSeconds`、`autoplay`、`controls` 和 `bindprogress/bindended/binderror`。组件内部负责：

1. 播放前向服务端请求临时地址或播放令牌。
2. `timeupdate` 节流上报进度，退出页面时保存断点。
3. 首节试听限制、已购权益和服务端返回的可播放范围。
4. `waiting/error` 状态、重试按钮、无网络提示和横屏回收。
5. 进入/离开页面时创建和销毁上下文，避免多个播放器同时播放。

`video-swiper` 适合短视频连续滑动，不适合课程章节播放器；该仓库已归档，只取事件设计。腾讯播放器插件只适用于腾讯视频资源，不能解决现有 MP4 资产的托管和授权问题。

### 音频：统一音频会话管理器

新建 `services/media/audio.js`，维护单例 `InnerAudioContext`，支持播放、暂停、停止、倍速、进度、结束、系统中断和错误回收。词典单词音频、例句音频、答题反馈音效都通过该管理器进入，避免每个页面重复创建上下文。录音功能单独放到 `services/media/recorder.js`，不与播放逻辑混合。

## 4. 值得加入的加分模块

### 内容智能层

- 词形图：使用 `e_change_word` 生成原型—变形关系图。
- 教材覆盖分析：展示单词在教材、词频、题库中的出现范围。
- 内容引用链：AI 回答必须返回教材/词典/题目来源。
- 课程自动质检：检查缺失重音、重复释义、无效音频、孤立词和题目无答案。

### 学习增长层

- 每日任务、连续学习、阶段徽章和复习提醒。
- 教材完成度、错题类型、词汇掌握度和考试预测分数。
- A/B 测试首屏推荐、免费试听长度、低价套餐和分享文案。
- 只在用户授权后同步学习事件；用户身份与内容分析分离。

### 工程质量层

- 纯逻辑：沿用 LingoSnake 的 Node.js 断言测试。
- 页面回归：使用官方 `miniprogram-automator` 做课程试听、查词、答题和错误状态冒烟测试。
- 性能：记录首屏耗时、接口耗时、视频首帧、音频播放失败率和 setData 数据量。
- 兼容：至少覆盖 iOS、Android、弱网、旧基础库和系统静音状态。

## 5. 不建议当前复用的项目/方案

- 已归档的 `miniprogram-component-plus`：可读源码，但不直接作为生产依赖。
- 低星或无持续维护的虚拟列表、录音组件：先复制思路，确认许可证、基础库和真机兼容性后再用。
- 腾讯视频插件：若课程不是腾讯视频资源，接入成本不会解决核心媒体资产问题。
- CloudBase/云开发课程示例：当前已有 MySQL、内容库和后端原型，迁移会引入第二套数据权限和运维体系。
- 粒子/复杂 Canvas 特效：小程序跨线程绘制和低端机性能风险高，不能作为首发卖点。

## 6. 推荐落地顺序

1. 先完成自有 `media-player` 和 `audio-manager`，解决课程和词典的基础播放。
2. 把 LingoSnake 调度/题型核心改造成俄语模块，并加入服务端事件。
3. 接入 `mp-html` 前先建立 HTML 白名单和内容清洗流程。
4. 用 Lottie/圆环进度做有限的学习反馈，不引入全局动画框架。
5. 建立 Automator 冒烟测试后，再开发支付和发音评测。
6. 最后根据真实留存数据加入 AI 解释、计划和报告。

## 7. 参考仓库与许可证记录

目前优先参考：LingoSnake（MIT）、官方微信示例（MIT）、`lottie-miniprogram`（MIT）、`mp-html`（MIT）、`Tencent/iHearing`（MIT）。`w-components`、部分录音/虚拟列表项目在本轮未完成许可证核验，不能直接复制到生产代码。所有复用内容应在仓库内建立第三方清单并保留原许可证。
