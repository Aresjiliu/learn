# 视频内播控：GitHub调研与改进建议

调研日期：2026-10-20。状态：调研完成，推荐交互待确认；未修改播放器源码。范围限当前微信原生小程序、自有MP4和既有media-player，不迁移框架、媒体托管或进度数据。

## 当前问题

用户截图中视频原生控制条与下方学习控制卡分离。倍速、重听、自动下一节不随视频全屏进入，页面级ActionSheet也尚未证明在原生全屏中可用。现有33项行为测试只能证明事件与命令边界，不能证明控制层布局和全屏触达。

## 核验过的来源与复用边界

1. [微信官方miniprogram-demo](https://github.com/wechat-miniprogram/miniprogram-demo)：已读取video/video.wxml、video/video.js、cover-view/cover-view.wxml及根LICENSE。MIT，可依法保留声明后复用必要示例。视频示例使用原生video与VideoContext；不是现成带倍速面板的课程播放器。cover-view示例目前提示同层渲染下建议使用view，不能把旧教程“只能cover-view”当全部平台现状。复用原生调用/事件模式，具体覆盖层类型以目标基础库与真机验证决定。
2. [tvfe/txv-miniprogram-plugin](https://github.com/tvfe/txv-miniprogram-plugin)：已读README。2.1.0说明底部左右扩展位、控制条显隐联动，但左右扩展位仅全屏显示；仅支持腾讯视频已上架资源，接入需申请插件。参考播控分区与显隐交互，不接插件、不复制未核验授权的实现。
3. [vhall/VHYun_player_miniprogram_SDK](https://github.com/vhall/VHYun_player_miniprogram_SDK)：已读README。封装seek/playbackRate/全屏等方法，初始化依赖其token/accountId/aid/appId，并不是独立通用皮肤；顶层未见明确LICENSE，不复制源码。仅参考原生命令分层，不增加云服务依赖。
4. [bytedance/xgplayer](https://github.com/bytedance/xgplayer)：查看仓库说明，属于HTML5播放器；交互可作参考，不能直接装进当前WXML作为原生播放器。为使用它而引入web-view会扩大本次范围，不推荐。

源码定位：官方demo的`miniprogram/packageComponent/pages/media/video/video.{js,wxml}`及`pages/view/cover-view/cover-view.wxml`；根[MIT许可](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/LICENSE)。本轮没有下载运行第三方代码或安装依赖。

## 三种路径

- 推荐：保留原生video内核，在现有media-player内建设统一自定义播控；复用官方API示例、现有保存/实例防护和成熟播控交互。可控制布局，不绑定云厂商；需增加触摸进度、显隐、全屏适配测试。
- 轻量备选：保留原生控制条，旁边叠加倍速/设置入口。成本小，但不能任意向系统控制条插槽，重叠、显隐和不同平台留位仍难统一。
- 整体替换：腾讯视频或微吼SDK。资源/账户前提不匹配，无法仅凭GitHub公开仓库即无成本复用，不采用。

## 推荐交互（待确认）

- 移除视频下方大按钮卡。视频底部为低高度半透明控制层，白色图标，不继续使用页面珊瑚红大按钮。
- 左侧播放/暂停与时间；进度条独立一行；右下角为回退10秒、前进10秒、当前倍速、设置、全屏。小屏收拢两个跳转按钮进设置或全屏展开，避免挤压进度和字幕。
- 倍速在视频内打开面板，五档不变；自动下一节放设置内，默认关闭，显示真实开关状态。正常播放闲置约3秒收起，暂停/错误/操作面板时保持可见。
- 全屏仍使用同一原生视频实例，控制层必须作为视频内部可随全屏显示的结构验证；不使用页面absolute兄弟节点冒充全屏覆盖。覆盖类型先做最小实机验证，不预设view或cover-view必然跨端成功。
- 保留session身份、错误/后台作废、恢复快照、写失败限频和原媒体URL保护。新控件向页面发带不可变sessionId的意图，页面继续负责持久化、自动下一节与课程访问控制，不形成第二套进度服务。
- 前进/回退目标夹在0与已知duration之间；时长未知不伪造上限/百分比。拖动预览不写记录，原生时间事件确认后才更新真实位置。

## 实施顺序与验收

先验证视频内覆盖及普通/全屏→拆播控组件与纯格式/定位函数→接原生播放/进度/倍速/设置→移除外置卡→行为双审/全回归/原生编译→开发工具及iOS/Android实测。每步保留旧身份、访问与存储回归，未实测不能称全屏可用。

检查320/375/390宽、横屏、安全区、字幕遮挡、触摸/显隐计时器、拖动取消、同视频重试、快速切集、隐藏后迟到面板事件、未知时长、API失败。复制上游实质代码前须固定提交与保留许可；当前只作模式参考。

## 检索边界与不确定性

关键词覆盖微信小程序video/custom controls/cover-view/fullscreen/倍速及上述仓库。GitHub公开API返回共享出口限流，已停止API重试；微信video与cover-view官方网页本轮直开失败，因此不声称读到了其完整正文。未使用浏览器会话cookie搜索，不要求用户提供凭据。未确认各候选最新release日期与包体，未把搜索抓取时间当维护日期。尚未找到经本项目iOS/Android验证、可直接替换且无需适配的完整原生皮肤。
