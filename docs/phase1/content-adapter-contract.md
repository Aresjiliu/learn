# 内容适配层契约

当前实现位于 `services/content.js`，只负责纯数据转换，不负责网络请求、数据库写入或用户数据处理。

## 词汇匹配

`classifyWordMatch(bookWord, dictionaryWords, wordForms)` 返回：

- `exact`：标准化后完全相同，优先使用主词典释义、词性和音频。
- `relaxed`：仅存在大小写、重音或 `ё/е` 差异；保留教材原词展示。
- `wordForm`：通过词形关系回溯到主词典原型；不覆盖教材释义。
- `unmatched`：进入人工复核，不自动删除或合并。

`prepareCourseWords` 会额外返回 `matchConfidence`、`dictionaryId`、`dictionaryWord` 和 `meaningSource`。释义优先级为“教材原释义 > 主词典释义 > 缺失”，因此主词典只能补充空白，不覆盖教材已有内容。

审核后的独立映射可作为第四个参数传入 `prepareCourseWords(words, dictionaryWords, wordForms, decisions)`；第五个可选参数 `{bookName}` 用于给缺少教材标识的在线词条补齐课程身份。只有 `decisionStatus=approved`、教材和词典标识一致、且 `dictionaryId` 与 `selectedPrototype` 能在当前主词典中同时验证的记录，才会生成 `matchTier=reviewed`；其他状态全部忽略。审核记录不会覆盖教材释义。

标准化会统一空白和大小写、清除组合重音，同时保留俄语字母 `ё`，避免错误改变词义。

## 题库放行

`selectPracticeQuestions(questions, options)` 的默认规则与阶段 0 报告一致：

- 题干和正确答案都存在，才进入基础练习候选集；
- 若题目带有选择项，正确答案必须对应一个非空选项；选项缺失或答案越界的题目进入人工复核；
- 试卷至少 5 题，且答案完整率不低于 80%，才标记 `practice-ready`；
- 解析缺失不阻断练习，题目以 `hasAnalysis=false` 标记；
- 解析完整率达到 80% 的试卷标记 `analysis-ready`。
- 无选项文本答案超过 80 个字符时暂不进入练习池，保留在质检报告中等待人工确认。

服务返回 `questions` 和按试卷聚合的 `papers`，页面不得根据空字段自行放宽规则。

`papers` 额外返回 `qualityStatus`、`reviewReasons`，整体返回 `summary`；`needs-review` 试卷不会进入练习题候选集，候选题会标记 `qualityStatus=practice-only` 或 `analysis-ready`。

练习页根据当前题目的非空 `a_item` 至 `e_item` 动态渲染选项，不再固定显示空的 D 选项。摘要中的 `answerReadyTextQuestions`/`answerReadyChoiceQuestions`统计全部分组中的可答题，不等同于最终放行候选题数量。

若题目没有任何非空选项但有标准答案，适配器生成 `answerMode=text`，练习页使用文本输入并按 `normalizePracticeAnswer`（去首尾空格、俄语小写、`ё/е` 归一）判分；选择题生成 `answerMode=choice`。

放行题目会生成标准化 `answerKey`（去空格并转小写）；判分和正确选项高亮必须使用该字段，不直接比较原始 `right_result`。

`normalizePracticeResponse(response, options)` 是 API 响应入口：原始响应需存在 `data.questions` 数组；已由本地回退服务标准化的 `{questions, papers}` 结果可直接透传，避免页面二次解析为空；其他错误响应返回空候选集。

当前练习页使用 `data/content_samples/exam_practice_sample.json` 作为本地开发数据源。该样本只用于页面和交互验证，正式发布前必须替换为通过同一适配器处理的接口数据。

课程详情的本地词汇样本使用 `data/content_samples/dictionary_words.json` 提供主词典匹配键；展示仍优先采用教材释义，主词典只补充映射层级和后续可用的音频/释义来源。

课程词汇接口可在单条教材词汇中返回 `dictionary` 内嵌对象；`prepareCourseWords` 会优先使用该对象作为映射补充，因此不要求小程序为每个词逐条请求词典。内嵌对象仍需包含 `sourceId`、`word` 和可选的 `matchTier`/释义字段。

## API 响应适配

`services/adapters.js` 负责把阶段 1 契约字段转换成当前页面模型：课程统一为 `title`、`cover_image`、`wordCount`；词典统一为 `word_meaning_all`、`word_character`、`audioUrl`；题目统一为 `question_content`、`right_result`、`analysis`。页面不应直接判断旧字段和新字段。

成功响应同时兼容旧格式 `code=200` 和阶段 1 格式 `{data, meta}`；包含 `error` 或缺失 `data` 的响应不得进入内容页面。课程目录和词典搜索的本地模拟服务均返回 `page`、`page_size`、`total`，词典搜索同时支持俄语词形和释义关键词。

内容 API 关闭时，词典详情服务直接返回本地只读样本；内容 API 请求异常且开启本地回退时也返回本地样本，不会因为详情页复用服务而误发网络请求。

词典入口当前由 `services/dictionary.js` 提供离线小样本查询；开启本地内容 API 时，`/dictionary/search` 和 `/dictionary/{word_id}` 使用已校验主词典导出，页面模型保持不变。生产部署应由后端提供分页搜索，不把完整词典打入小程序包。

词典搜索分页参数为 `page` 和 `page_size`（1-100），响应 `meta` 返回 `page`、`page_size` 和 `total`；页面只能渲染当前页，不能假设搜索结果一次返回完整词典。

词典搜索页维护当前页和 `hasMore` 状态，在线接口按页追加结果；离线小样本没有分页元数据时，按页大小保守判断是否还有下一页。

词典详情优先顺序：主词典确定词条身份和音频/来源，教材词汇提供面向学习者的释义、词性和例句；两者冲突时不自动覆盖教材原文。

## 内容 API 开关

`services/content-api.js` 已准备 `/api/v1/dictionary/search`、`/api/v1/dictionary/{word_id}`、`/api/v1/exams` 和 `/api/v1/exams/{paper_id}` 入口，但 `config.js` 中 `enableContentApi` 默认是 `false`。完成后端部署、合法域名、响应样例和真机验证后再打开；关闭时页面继续使用本地样本，不会产生生产请求。

课程列表另接入 `/api/v1/books`，适配器会将响应中的 `books` 转成页面模型的 `courses`，保留原始字段并补齐 `title`、`cover_image`、`wordCount`。

`/api/v1/books/{book_id}/words` 的本地联调实现会使用已校验主词典导出和词形表生成只读内嵌映射；这只是内容服务的装配层示例，生产部署时应由后端批量联表或预计算，禁止在小程序端循环请求词典。

词形运行时只自动注入唯一原型；多原型词形保持待复核，避免把歧义映射误当成确定答案。当前小程序本地样本的预计算索引位于 `data/content_samples/book_word_forms.json`。

词典详情在线请求失败时必须回退到 `getLocalDictionaryDetail`；详情页不直接依赖生产响应中的教材字段，避免主词典空释义导致页面不可用。

练习会话仅保存题目 ID、答题结果和得分到微信本地存储；正式接入用户学习进度 API 前，不同步用户身份或答题明细。

视频断点使用独立的 `video_progress_v1` 本地存储；本地测试无 token 时只写本地，存在 token 时才触发既有服务端进度接口。

练习页通过 `paperId` 选择在线试卷；未传入 `paperId` 时始终使用本地样本，避免在开发阶段请求不确定的生产试卷。

试卷目录使用 `/api/v1/exams?page&page_size`，仅返回试卷质量摘要；点击试卷后再请求 `/api/v1/exams/{paper_id}` 获取题目，避免首屏加载全量题库。关闭内容 API 时只展示可验证的本地测试试卷。

`normalizeExamPapersResponse` 兼容 `paper_uuid/paper_name/question_count/practice_ready` 等旧字段，并将 `0/1`、布尔值和字符串布尔值统一为页面可用字段。

题目可携带 `questionType`、`originalTextUuid`、`audioUrl`、`translate` 和 `point`。只有绝对 HTTP(S) 音频地址会标记为 `audioPlayable=true`；相对地址仅保留为内容元数据，避免本地测试误把不存在的文件当作可播放资源。

音频覆盖率不参与基础文字练习放行；试卷是否含听力、题型分布和音频覆盖率由阶段 0 选题报告单独统计。

请求层默认关闭调试日志；本地排查问题时可临时打开 `enableDebugLog`，不得在共享代码或生产配置中开启，也不得记录 token、完整响应或请求体。
