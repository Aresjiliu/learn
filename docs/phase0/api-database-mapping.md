# 阶段 0：API—数据库映射

## 已有 API 能力

来源：`D:\project\Russion1\node_test` 的 `openapi.json`、`api/`、`utils/request.js`，以及 `D:\project\ruflo\backend/app.py`。

| 产品能力 | 旧 API/数据来源 | 新 API 归属 | 阶段 |
|---|---|---|---|
| 俄语查词 | `/search/russianv4`、主俄语索引 | `content/dictionary` | P0 |
| 中文释义 | `/search/chinesev4.do`、中文词典 | `content/dictionary` | P1 |
| 热词/推荐 | `/search/hot_words` | `content/recommendation` | P1 |
| 例句 | `/search/liju`、`liju_prod` | `content/example` | P0 |
| 专业词汇 | `/search/profession_dict` | `content/domain-dictionary` | P1 |
| 课程 | `study_book`、`n_study_book` | `learning/catalog` | P0 |
| 课程单词 | `study_book_word`、`n_study_book_word` | `learning/lessons` | P0 |
| 单词本 | `/wordsnote/*`、`user_vocabulary` | `learning/vocabulary` | P0 |
| 学习进度 | `/wordLearn/*`、`learning_progress` | `learning/progress` | P0 |
| 复习计划 | SM-2/学习计划迁移脚本 | `learning/review` | P0 |
| 考试 | `kaojuan`、`n_exam_question`、`exam_results` | `exam` | P0 |
| AI 解析 | 当前未形成稳定生产接口 | `ai/tutor` | P1 |

## API 边界

小程序只能访问新版本 BFF，例如 `/api/v1/dictionary`、`/api/v1/books`、`/api/v1/review`、`/api/v1/exams`、`/api/v1/ai`。旧 7500km API 只作为导入和兼容参考，不应让客户端长期直接依赖。

## AI 工具边界

AI 服务只通过受控工具读取内容服务：查词、查变形、查例句、读取用户错题、生成练习。AI 不直接连接生产数据库，不直接写入课程和考试答案；生成结果先保存为草稿，必要时进入人工审核。

