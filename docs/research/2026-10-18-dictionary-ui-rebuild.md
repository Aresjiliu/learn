# 词典体验重建：截图、代码与组件证据

日期：2026-10-18。状态：调研/设计；不是页面已改好或视觉验收通过。

## 1. 对比结论

已查看当前 `D:/project/learn/ui/词典1.png`、`词典2.png`、`词典3.png`，以及参考 `D:/project/Russion1/ui/首页.png`、`首页+搜索历史.png`、`搜词+俄语键盘.png`、`搜索结果1.png`、`搜索结果2.png`、`搜索结果3.png`。当前词典2/3视觉相同，没有本轮详情页截图。

| 层面 | 当前问题 | 参考价值与处理 |
|---|---|---|
| 查词入口 | 重复页面标题、口号、大卡片和查询按钮；初始页没有可用学习内容 | 保留一个紧凑搜索框；历史、示例查询及真实生词本入口取代装饰性空态 |
| 结果密度 | 单个结果占据很高卡片，释义和例句混在摘要里 | 按匹配类型分清词头/词性/摘要；行式列表，精确匹配置前，不伪造热搜 |
| 详情 | 平铺一段释义，缺乏词义、例句与形态边界 | 词头—可信重音—词性—发音—收藏；按真实数据提供义项/例句/变格 |
| 字体/颜色 | 当前截图中文呈衬线效果，蓝导航与深蓝按钮、灰卡片不协调 | 词典作用域采用系统无衬线、白底、深色正文、少量强调色；不据截图推断真机字体 |
| 学习闭环 | 无本地生词本、搜索历史和复习入口 | 先本地可用再账号同步；不复制会员遮挡或未实现的工具入口 |
| 验收方法 | 正则验证只能证明标记存在，不能证明视觉质量 | 实际运行截图与用户基准对比，行为测试单列，不再混为一谈 |

## 2. 已核实的数据链路限制

- `D:/project/learn/scripts/build_dictionary_index.py:33` 的 `extract_meaning` 只取 `XJSY[].cy` 并用换行拼接。
- `D:/project/learn/content_server/dictionary_store.py:62` 的 `_word` 返回平面 `word_meaning_all`，没有分义项例句、重音或变格详情。
- `D:/project/Russion1/entry/src/main/ets/models/SearchModels.ets` 已定义 `XJSYItem.cy/lj`、`zywz`、`changes`、`EESY`、相关词等模型；模型存在不能当作本地数据覆盖证据。
- 因此需分两片：先重建现有字段可支持的搜索/详情体验；再从已有自有导出生成结构化详情批次。不得先显示无数据的“专业释义”等标签。
- 查询索引、详情扩展和音频目录必须明确内容批次；改 SQLite 字节后必须重建与其 SHA 绑定的音频目录，不能破坏既有快照一致性。

## 3. 成熟基础组件选型

| 方案 | 官方证据 | 本项目判断 |
|---|---|---|
| Vant Weapp | [README](https://github.com/youzan/vant-weapp)、[Search](https://github.com/youzan/vant-weapp/blob/dev/packages/search/README.md)、[Tab](https://github.com/youzan/vant-weapp/blob/dev/packages/tab/README.md)、[Icon](https://github.com/youzan/vant-weapp/blob/dev/packages/icon/README.md) | 推荐首轮原生适配；只注册实际使用组件，锁定发布版本，保留 MIT 许可 |
| TDesign MiniProgram | [README](https://github.com/Tencent/tdesign-miniprogram)、[MIT](https://github.com/Tencent/tdesign-miniprogram/blob/develop/LICENSE) | 原生和 npm 路线可行；本轮备选，不与 Vant 混装 |
| WeUI MiniProgram | [README](https://github.com/wechat-miniprogram/weui-miniprogram)、[MIT](https://github.com/wechat-miniprogram/weui-miniprogram/blob/master/LICENSE) | 适合微信规范参考，但不能单独解决俄语词典信息结构；不再增加第二套基础依赖 |

Vant 官方最低基础库 2.6.5，本项目当前 3.17.4；这只满足声明的版本下限，不等于已在本项目完成兼容测试。官方源码 `package.json` 当前声明 1.11.8；npm 发布物未安装或校验，不能将源码分支当作已锁定依赖。包体增量必须实测，不能以“页面按需注册”推断构建物必然裁剪。旧源码/工具环境不得进入上传包。

建议映射：Search 用于搜索/清空；Icon 用于搜索、清除、发音、收藏；Tab 用于有数据的详情分区；Loading/Skeleton 用于等待；Dialog 用于清空历史/删词确认。只在实际用到时加入后续组件。

### 接入陷阱

1. Search `change` 的内容是 `event.detail`，原生 input 是 `event.detail.value`；适配在页面入口，不污染内容服务。
2. Tab 首次隐藏时可能拿到零宽，需条件挂载或显示后 resize；不盲目开启吸顶/动画。
3. Icon 是字体图标；检查字体实际来源，冷启动/断网不能让清除与发音入口消失。必要时用经许可本地图形，而不是远程图标 URL。
4. 业务仓库仍为 JavaScript/WXML/WXSS；安装已编译的原生发布物，不引入 Vue、Taro 或 TypeScript 业务工程。
5. 组件替换后，现有测试需验证事件、状态与路由，不能继续用旧 HTML 标签字符串约束新组件实现。

## 3.1 Russion1 静态代码复用清单

独立子代理只读审计，主代理复核生词本占位、历史写入及形容词分支后确认：参考截图优于当前实现，但参考代码也不是完整生产基线。

| 功能 | 本地证据 | 复用决策 |
|---|---|---|
| 搜索历史 | `D:/project/Russion1/entry/src/main/ets/services/DatabaseService.ets:96`，查询见 `:170` | 借用同词更新时间、倒序取20条、单删和清空；改微信缓存，实际裁剪存储，并区分重复与写失败 |
| 释义/例句 | `D:/project/Russion1/entry/src/main/ets/pages/SearchResultPage.ets:579` | 复用 `XJSY[].cy/lj` 分义项；列表用 `showSY`，详情不再混成一段字符串 |
| 词组/词形 | 同页 `:489`，模型 `D:/project/Russion1/entry/src/main/ets/models/SearchModels.ets:241` | 复用 CZDY、SHAPE、ressian 的信息分区；先检查自有导出覆盖，不猜内容 |
| 变格 | 结果页 `:778`、`:829`、`:911`、`:1009` | 借名词/动词字段分组；不复制仅看 `_zy` 导致隐藏、只选一个宾格形式及仅取 changes[0] 的缺陷；形容词实际仍为开发中 |
| 发音 | 结果页 `:143` | 借切词停止/离页释放规则；继续用 learn 已验证的音频目录，不回退硬编码 HTTP 或把任意 sound 当已验证 URL |
| 生词本 | 结果页 `:477`、首页 `D:/project/Russion1/entry/src/main/ets/pages/Index.ets:333` | 按钮/入口仍为未实现占位，“近期新增68”写死；仅借视觉设计，本地存储、去重、复习需真实开发 |
| 中文搜索 | `D:/project/Russion1/entry/src/main/ets/services/SearchService.ets:83`、`:124` | 不迁移“中文取最多5词再串行俄语查词”；保留 learn 本地只读排序搜索，避免吞异常造成假无结果 |
| 专业/俄俄 | 结果页 `:262`、`:1019` | 专业依赖额外服务，关系词无跳转；不照图承诺已有全量内容。原请求签名/解密和日志不迁入小程序 |

## 4. 本轮未做的事

未下载整仓、未安装 npm 包、未复制 ArkUI UI、未改源数据或生产数据、未上传小程序。TDesign 站点抓取超时后改读官方 GitHub；npm 注册表网页及部分源码路径未返回，未将抓取失败当作组件不存在。图片目录 7 张图共 627,850 字节，应排除出小程序包；原文件保留。
