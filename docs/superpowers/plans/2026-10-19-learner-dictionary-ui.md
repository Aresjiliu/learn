# 轻量词典体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development，逐切片实施并做规格/质量双审。

**Goal:** 落实已确认的轻量查词与渐进展开，修复真实截图中的重叠/混排/信息拥挤，并衔接词本和离线复习。

**Architecture:** 保留现有原生页面、呈现服务和Vant。先只改展示与交互，不改变内容API/词条ID/音频身份；收藏/复习以真实服务独立交付。

**Tech Stack:** JS ES2018、WXML/WXSS、Vant1.11.7、现有Node行为测试与微信本地编译。

当前DevTools使用本工作目录，沿用已授权原位开发；不切换或重置用户工作树。G0课程/媒体修复独立收尾，写集不与本UI片重叠。新截图每阶段验收，不把静态检查当渲染通过。

当前检查点：Task1源码/测试、规格/质量和完整phase1已通过，35个WXML/WXS及25个WXSS根离线编译通过；真实搜索页/窄屏验收仍缺，按审查Important门禁保留工作树、不合并UI。Task2/3未开始。G0已独立提交，不等待UI截图才保存安全修复。

## Task 1：无叠层搜索与干净结果

**Modify:** `pages/dictionary/search/search.{js,wxml,wxss,json}`、`components/dictionary-entry/index.{js,wxml,wxss}`、`services/dictionary-presentation.js`，词典详情WXSS仅字体回退。**Tests:** `scripts/test_dictionary_layout.js`、`scripts/test_dictionary_presentation.js`、`scripts/test_dictionary_audio_visibility.js`、`scripts/test_dictionary_identity_contract.js`、`scripts/test_ui_contract.js`及实际引用的搜索Page测试。

- [ ] 先补并执行失败用例：简明词性有精确映射才显示、原wordClass完整保留、未知词性隐藏；行式结果不重复“词头匹配/主词典/可听发音”，但词形歧义和稳定ID保持。例：`assert.strictEqual(presentDictionaryEntry({word_character:'名 非动 单 阴 1格'}).shortWordClass,'名词')`。
- [ ] 搜索改Vant正常流插槽。保留`bind:change`/`bind:search`，使用`use-left-icon-slot/use-right-icon-slot/use-action-slot`，清除按钮与action在对应槽位，不在输入上叠绝对定位按钮。若插槽运行验证失败，再有证据地退回局部原生input，而非换UI库。
- [ ] 字体指定系统中文无衬线回退，范围只在词典页面/组件/原生按钮与输入；图标字体不覆盖。正文和俄文同基线，列表释义两行视觉截断、原始全文不删。
- [ ] 开发音频/离线样本限制移到页级提示：聚合当前结果`audioDevelopmentOnly`，所有输入改变/清空/新搜索/失败均不残留上批状态；追加分页以合并后的结果聚合。来源与音频元数据仍保留在模型和详情。
- [ ] 运行：`node scripts/test_dictionary_presentation.js`、`node scripts/test_dictionary_layout.js`、`node scripts/test_ui_contract.js`、音频可见性/身份测试，逐项检查退出码。迁移旧静态断言为新结构/行为，不删除竞态、历史写失败、ID/音频安全断言。
- [ ] 规格→质量审查；本地编译和390/375/320宽实际截图，测量图标/输入/清除/搜索区互不相交；未取得证据不勾选视觉。按明确文件集提交，不混入G0。

## Task 2：详情渐进展开

**Modify:** `services/dictionary-presentation.js`、详情四件套、对应详情呈现/Page/布局测试。须在Task1模型写入结束后开始，避免并改。

- [ ] 先测试长原文折叠/展开后全文不变、短文无多余展开、有例句最多2条且可全部访问、换词重置展开状态；HTML按纯文本，空/坏例句alias仍恢复。
- [ ] 结构化义项未接入前不拆数字/标点。用约8行可展开容器显示原文，长文本展开后完整可复制；例句前2条＋查看更多。若内容溢出无法可靠测量，宁可先完整显示并明确记录，不做截断后无出口。
- [ ] 头部简明词性；原始详细词性/来源置资料区。发音仍使用已双审selector、attempt隔离和严格ID回退，不为了样式重写播放器。
- [ ] 不新增假收藏/AI/变格入口。运行详情呈现、发音Page25项、native15项、生命周期与身份回归，独立双审；实机验证展开/复制/长词/安全区/失败提示。

## Task 3：真正词本与到期复习

该子项目沿已批准规格另立精确存储/调度实施计划，不与Task1/2界面改动混提交；依赖和交付边界已明确，不以“以后再做”替代整体目标。

- [ ] 词本服务按稳定dict ID保存，教材未匹配词使用来源独立key；存储可注入、版本迁移失败留旧数据、容量与写失败测试先行；保存成功才显示已加入。
- [ ] 词本页面离线摘要可达，搜索显示真实数量，详情保存/移除与列表同步；不依赖登录、不虚构统计，说明本机清缓存边界。
- [ ] 独立假时钟调度器，测试忘记/模糊/记住/跳过、跨天与重复提交；接词本→到期队列→复习→重启恢复。算法和存储不得放进UI组件。

## Integration gate

- [ ] 完整`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`，失败逐项处理；节点状态/模拟行为/原生编译/实际截图/真机证据分别记录。
- [ ] 课程媒体G0、词典UI、词本与复习各有独立提交/风险清单；不提交截图、资源、导出、凭据或工具依赖。网络不可用保存本地提交，恢复后核对远端再推送。
- [ ] 总体G4–G7仍按产品路线推进；UI通过不等于整个goal完成。
