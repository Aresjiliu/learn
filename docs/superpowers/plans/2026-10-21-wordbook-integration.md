# 本机生词本接入 Implementation Plan

> **For agentic workers:** 使用已批准轻量词典规格逐切片实现，测试先行，规格与质量分别复核。

**Goal:** 将已有受保护词本内核接入微信存储、详情保存/移除和可访问的离线摘要列表，不增加假收藏或云同步承诺。

**Architecture:** 保留 `services/wordbook.js` 的身份与快照白名单。新增微信适配，每个同步操作先新建内核读取当前快照，防止跨页面旧内存覆盖。页面只传明确来源和稳定ID，缺身份不得按词头伪造。

**Tech Stack:** 原生JS/CJS、WXML/WXSS、既有Vant、Node行为测试。沿既定原位开发，不重置/切换工作树。

## Task 1：微信存储适配

Files: 新增 `services/wordbook-wx.js`、`scripts/test_wordbook_wx.js`，注册 `scripts/check_phase1.ps1`。

- [x] 写测试并运行 `node scripts/test_wordbook_wx.js`，确认缺模块产生RED；实现后14/14，原core12/12均独立复跑通过。
- [x] `createWxWordbook(platform, now)` 使用固定游客键 `wordbook_guest_v1`，公开 `inspect/add/remove`，不读token或账号；`inspect()`返回 `{records, readOnly, reason}`。
- [x] 每次操作用 `getStorageInfoSync().keys` 判断是否真的不存在，再读取值；存在但值为空字符串/null/undefined均按损坏只读，不覆盖。信息/读取失败明确报 `WORDBOOK_READ_FAILED`，不得回空本。
- [x] 调用现有core，写入仅白名单快照。双实例连续新增/删除、配额/读取失败、未知版本、损坏/缺失、数字零教材来源和不保存URL/token已测试。
- [x] 测试及独立规格/质量通过，完整10754 PASS，已按明确两文件独立提交；门禁注册与现有未提交集成集分别管理。同步交错调用不冒称跨进程原子或平台部分写入恢复。

示例契约：
```js
const book = createWxWordbook(wx)
const view = book.inspect()
book.add({sourceType: 'dictionary', entryId: 'dict:181123:c6612fa04f6e73bc', headword: 'камера', summary: '房间'})
book.remove('dict:181123:c6612fa04f6e73bc')
```

## Task 2：详情真实操作与身份

状态：已实现，entry9/9、action27/27及旧音频/身份回归通过；规格与质量审查均无阻断。组件非法属性selector已改为动态BEM，不重复正常状态文字。实际工具已验证保存→词本1词→展开摘要→确认移除，回到详情刷新另行记录。

Files: 新增 `components/wordbook-action/index.{js,wxml,wxss,json}`、`services/wordbook-entry.js`、`scripts/test_wordbook_entry.js`、`scripts/test_wordbook_action.js`；详情仅注册组件并传词条/教材来源。存储行为封装在独立学习动作组件，复用在其他可靠词条入口，不重写详情的发音/异步链路。

- [ ] 测试先行：稳定dict ID可保存、非稳定样本ID不伪造；教材必须同时有collectionId/sourceId（支持0）；无身份隐藏保存动作但仍可读/听音。
- [ ] core仅额外导出既有纯快照验证函数供呈现桥使用，不复制其身份生成规则；原core测试保持。新组件`pageLifetimes.show`重新读取，`observers`对换词刷新，无需向所有旧Page VM注入新的存储依赖。
- [ ] 每次用户操作调用真实适配；写成功才更新“已加入”。错误保留旧状态并提示可重试，未知版本不显示权威数量。页面onShow刷新当前保存状态，新词/卸载保护保留。
- [ ] 摘要只保存显式简明文本；超过core限制明确失败，不静默截断源释义。教材来源信息只在有可靠上下文时传递，不从俄文字串推测关联。
- [ ] 跑现有详情/音频/身份回归及新增真实平台存储边界测试，独立双审，不修改音频匹配规则。

## Task 3：列表与入口

状态：已实现第16页与搜索/详情入口；Page12/12、最大合法摘要字节分批、旧modal跨hide/show失效、读错总数未知均已验证。完整52913最终PASS，原生38/28通过。当前仅常规模拟器实看，窄屏/真机/重新启动模拟器保持与实际断网仍未测；保存操作仅证明本机词本，不等于复习完成或云同步。

Files: 新增 `pages/wordbook/wordbook.{js,wxml,wxss,json}`；修改 `app.json`、词典搜索入口；测试 `scripts/test_wordbook_page.js`。

- [ ] 写Page行为测试：读错/损坏/未知版本、真实计数、离线摘要、重新进入、删除失败、分页和稳定详情链接。
- [ ] 默认每次视图传20条，不全量setData；白底行式列表与现有token，未知版本不冒称0词，不清空/重置任何用户数据。
- [ ] 搜索页提供“本机生词本”入口，游客可访问，文案说明仅本机、清缓存可能丢失。详情不可在线获取时，列表摘要仍能阅读；不将摘要冒充全量离线词典。
- [ ] 完整phase1、原生模板样式编译、实际GUI保存→列表→移除→重进；真机未测单独登记，不宣称生产完成。

复习算法/到期调度属于下一切片，词本存在不等于复习已完成。账号命名空间与游客数据迁移另立明确契约，不自动归属下一位登录用户。
