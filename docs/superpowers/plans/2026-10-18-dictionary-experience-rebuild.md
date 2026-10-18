# 词典体验重建 Implementation Plan

> **For agentic workers:** 使用 `subagent-driven-development` 分片实施并分别做规格和代码审查。用户已选择子代理驱动，不重复询问执行方式。

**Goal:** 以 Russion1 的词典信息层次重建查词体验，随后打通真实生词本和复习，而不是再次仅调整卡片间距。

**Architecture:** 原生页面 + 一套 Vant 基础组件 + 俄语呈现适配器 + 注入本地存储的历史/词本服务。保留现有只读内容服务与音频控制器；结构化数据升级独立发布批次。

**Tech Stack:** JavaScript ES2018、WXML、WXSS、Vant Weapp 发布物、Node 行为测试、现有 Python 内容工具、微信开发者工具。

设计依据：`D:/project/learn/docs/superpowers/specs/2026-10-18-dictionary-experience-rebuild-design.md`；调研证据：`D:/project/learn/docs/research/2026-10-18-dictionary-ui-rebuild.md`。状态：用户已通过视觉方向，M0与M1历史服务开始实施，不将旧版测试当成本版验收。

## M0：组件与构建基线（先做，小切片）

修改 `D:/project/learn/project.config.json`、`scripts/check_pack_options.py`、`scripts/check_runtime_package.py`、`AGENTS.md`；新增 `package.json`、`package-lock.json`、`docs/architecture/ui-components.md`，不覆盖旧配置。

- [x] 打包门禁增加 ui/ 和 node_modules/ 排除断言，先红后绿；保留用户 ui/ 原文件。
- [x] 官方 npm 1.11.8 返回404；核对实际发行版1.11.7元数据后锁精确版本/integrity，不以 dev 分支作发布物。
- [x] 安装 @vant/weapp@1.11.7 与构建字体开发依赖 @vant/icons@3.0.1，均核验 MIT/integrity并禁生命周期，不运行上游脚本。
- [x] CLI build-npm 扫描旧工具目录报错，手动映射后仍复现；改为官方预编译发布物的可复现依赖闭包拷贝。47个运行/许可文件；污染目录清理和三层链接拒绝测试先红后绿。
- [x] 保留双 MIT，图标字体改官方内嵌WOFF2；47文件94,242字节，当前预计包1.229MiB，新增1.8MiB门禁。冷启动原生字体与页面编译不计在此代码级勾选内。
- [ ] 运行打包门禁、组件文件解析及微信真实编译，离线冷启动确认图标不缺失；更新 AGENTS 的 npm 安装/构建方式。验证后单独提交 `build(ui): add verified native component baseline`。

## M1：搜索首页、结果与历史（首个用户可见切片）

历史服务、呈现适配、词条组件与搜索页面已实现，13组Page行为及历史13项通过，独立规格/质量审查通过。触摸区和异常路由回归已补，完整phase1及本地WXML/WXSS编译通过；多尺寸实际词典截图仍未完成，下面复合任务待截图验收后才整体勾选。

新增 `D:/project/learn/services/dictionary-history.js`、`services/dictionary-presentation.js`、`components/dictionary-entry/`、`scripts/test_dictionary_history.js`、`scripts/test_dictionary_presentation.js`、`scripts/test_dictionary_component_events.js`。修改 `pages/dictionary/search/search.{js,wxml,wxss,json}`、`scripts/check_phase1.ps1` 及现有词典测试。复用已存在的搜索竞态保护，不重新写网络层。

- [ ] 历史逻辑先红后绿。服务接口 `createDictionaryHistory(storage)`；storage 为 `read()/write(records)`；实例方法 `list()/record(query)/remove(key)/clear()`。记录模型 `{key, query}`，数组顺序即最近优先，无需伪造访问次数。有效输入 1–64 字符、NFC 规范化、去首尾空格、俄语小写作为键，保留 ё/й 和重音；只接受数组中合法记录，最多 20 条。写失败抛明确错误，页面捕获提示。

```javascript
let persisted = []
const history = createDictionaryHistory({
    read: () => persisted,
    write: records => { persisted = records }
})
history.record('камера')
history.record(' дом ')
history.record('КАМЕРА')
assert.deepStrictEqual(history.list().map(item => item.query), ['КАМЕРА', 'дом'])
history.record('все')
history.record('всё')
assert.strictEqual(history.list().filter(item => /^вс/.test(item.key)).length, 2)
history.clear()
assert.deepStrictEqual(history.list(), [])
```

- [ ] `node scripts/test_dictionary_history.js` 先因缺模块失败，实现后覆盖上述示例及非法数组、空记录、超长、20条裁剪、移除、不吞写失败、重启恢复；不能只写静态源码断言。
- [ ] 呈现适配器先测真实平面字段：`presentDictionaryEntry(word)` 返回 `{headword, wordClass, summary, meaningBlocks, examples, availableSections}`；旧文本仅清理换行/空白用于摘要，`meaningBlocks` 不猜义项。记录 `matchTier/ambiguous` 在行模型中，不改变源排序或 ID。
- [ ] Search 事件显式归一化，测试组件事件和原生事件均取到相同值：

```javascript
const searchValue = event => typeof event.detail === 'string'
    ? event.detail
    : String(event.detail && event.detail.value || '')
assert.strictEqual(searchValue({ detail: 'дом' }), 'дом')
assert.strictEqual(searchValue({ detail: { value: 'дом' } }), 'дом')
```

- [ ] WXML 使用真实 Search 组件，移除重复标题、口号卡片和装饰性空态；历史行具有单删/清空真实处理，示例查询明确标为“试试查这些”。结果改行式两行摘要、词性、匹配说明，不把每条“主词典”做大标签。不新增假热搜或生词本占位。
- [ ] 请求成功（包括明确无结果）后写历史，网络失败不记录；清空输入终止旧结果，重新查询撤下旧词列表；加载更多只使用已提交查询，失败保留列表。清空历史确认后才写存储。历史保存失败不撤销已成功的搜索结果。
- [ ] 复跑 `node scripts/test_dictionary_search_states.js`、`node scripts/test_dictionary_identity_contract.js` 和新增三脚本；旧标签约束只在行为等价证据下更新。拍摄空首页/历史/俄语精确/中文/词形歧义/无结果/异常八组状态，390宽与320宽均检查。代码与视觉审查后单独提交 `feat(dictionary): rebuild search and local history`。

## M2：详情视觉重建（只使用当前真实字段）

修改 `D:/project/learn/pages/dictionary/detail/detail.{js,wxml,wxss,json}`、呈现适配器及 `scripts/test_dictionary_audio_controls.js`、`scripts/test_dictionary_detail_lifecycle.js`；新增详情显示模型行为测试。

- [ ] 为无词性、无例句、长词、完整平面释义、有/无音频、失败重试写模型和 Page 测试，先观察失败。
- [ ] 应用局部系统字体与页面级白色导航。词头/词性/声音图标为头部，正文按真实数据分区；没有结构化义项时原文完整展示，不先加“专业释义/变格”等空标签。
- [ ] 接入 Vant 声音图标或经过验证的本地图形，继续保留 88rpx 可点外层与无障碍名称；不改播放器生命周期。缺发音显示简短提示，播放失败有局部重试，开发音频来源仍可辨认。
- [ ] 重跑 12 项发音 Page 用例与 15 项原生事件隔离测试，并验证换词/切后台/返回。390/375/320宽详情截图必须包含长词、长释义和无音频；失败状态不挤出正文。通过后提交 `feat(dictionary): rebuild readable entry detail`。

## M3：结构化详情数据（与 M1/M2 分离的后端切片）

范围 `D:/project/learn/scripts/build_dictionary_index.py`、`content_server/dictionary_store.py`、`content_server/app.py`、对应 Python 合约/索引测试；不读取生产写接口。

- [ ] 对本地自有导出只读统计 `XJSY.cy/lj`、`zywz`、词性、SHAPE、CZDY、EESY、changes 字段实际类型和覆盖；给出缺失率，不由 Russion1 的 interface 推断数据齐全。
- [ ] 独立设计并审查可替换详情批次；保持稳定 ID 不变，旧字段继续兼容。新增结构化义项、例句和已核验重音；原字段损坏则回退原始文本，不能输出猜测内容。
- [ ] 在临时夹具验证义项-例句归属、数组/字符串变体、恶意标记按文本显示、ID一致、空字段、源文件不改。重音位置先以已知词验证 0/1 基和组合字符，含歧义不着色。
- [ ] 新索引先离线验证，再重建音频目录 SHA 绑定并启动独立端口烟测；未通过前不替换当前服务。服务重启切批次后更新版本；查询/详情/音频均同批次，不自动读变化中的源文件。
- [ ] 有真实数据后再显示义项/例句/相关形式标签，变格表单独处理活物/非活物和多个变化；数据缺失隐藏栏目。通过接口与UI真实验证后提交，不合并支付或账号改动。

## M4：真实生词本 → 到期复习（分别立实施规格）

1. 词本：`D:/project/learn/services/wordbook.js`、`pages/wordbook/`，稳定 ID 去重，教材未匹配词使用带来源的独立 key，不误与主词典合并。记录摘要/来源/保存时间/复习状态；读旧版本先校验迁移，失败保留旧数据。添加/删除成功才刷新收藏态，容量满提示，不借用课程远程收藏接口。
2. 页面：词典详情能真实加入/取消，搜索首页工具区显示真实总数；词本支持筛选、详情、删除和离线摘要，未缓存完整内容时明确提示。
3. 复习：借鉴已核验 LingoSnake 的纯调度测试，独立设计正确/错误/跳过、到期日与事件去重；假时钟测试、跨天/重启恢复、会话重复提交不重复计数。先本地，账号同步独立阶段。
4. 出口：教材词 → 词典详情 → 加入词本 → 断网词本 → 到期复习 → 进度恢复有行为与实机证据。上述完成才出现“我的生词本/复习”入口，不显示写死统计。

## M5：统一回归、版本与生产差距收敛

- [ ] 补完旧轮 HEAD/Range HTTP 与媒体回归，运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`；权限错误单独记录，不改断言绕过。
- [ ] 微信本地编译、截图、冷启动、断网/弱网、背景音频和安全区验收；截图注明设备/基础库/内容版本。自动化超时则保留失败证据并用实际工具截图补齐，不以网页截图代替。
- [ ] 独立规格与代码审查通过后按切片精确暂存，检查无凭据、数据/音频/视频和工具目录进入提交；再提交并同步既有 GitHub，核对远端哈希。未经尝试不沿用“上轮权限仍不足”的结论。
- [ ] 词典闭环稳定后，再规划课程/练习/我的统一设计、视频倍速、审核内容发布；交易先服务端商品/订单/权益，再支付，不复制旧仓库“按钮成功即开课”。HTTPS、个人数据隐私、监控、备份恢复及目标服务器压测均单独门禁。

## 审查与执行顺序

主代理负责图像/设计和集成；实现代理按 M0、M1、M2 分片，数据审计可与不重叠前端工作并行。每片先失败用例、实现、规格审查、代码审查、测试与截图；没有当前渲染证据就不宣称 UI 验收通过。本轮已发视觉方向确认，实施状态不得提前勾选完成。
