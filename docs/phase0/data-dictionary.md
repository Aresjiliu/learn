# 阶段 0：数据字典与分层

## A. 新后端工作库

来源：`D:\project\ruflo\backend\ruflo_db_backup.sql`，文件约 24 MB，包含 9 张表。

实时校验：本地 `ruflo_db` 当前为 22 张表；其中 `russian_word`、`profession_dict`、`exam_paper`、`exam_question` 尚无数据。`study_book_word` 当前 67,660 行，和历史报告中的 63,783 行不一致，应以导入批次和主键去重规则进一步核对。

| 数据域 | 表 | 用途 | 迁移级别 |
|---|---|---|---|
| 用户 | `users` | 登录、用户基础资料 | P0，需脱敏/授权 |
| 课程 | `study_book` | 教材、考试和学习书分类 | P0 |
| 课程词汇 | `study_book_word` | 书籍与单词关系、顺序 | P0 |
| 词频 | `word_frequency` | 词频排序和复习优先级 | P0 |
| 例句 | `example_sentence` | 中俄例句 | P0 |
| 词根 | `word_root` | 词根层级和关联 | P0 |
| 学习进度 | `learning_progress` | 用户学习状态、复习状态 | P0，需用户授权 |
| 单词本 | `user_vocabulary` | 收藏/生词/熟悉度 | P0，需用户授权 |
| 考试结果 | `exam_results` | 试卷成绩和答题记录 | P1，需用户授权 |

## B. 生产内容域

根据 `api_and_database_design.md`、`ey_data_database_analysis.md` 和生产库分析报告，需重点核对：

- `x_7500km_russian_index_new_test`：俄语主词典、释义、变形 JSON、音频字段。
- `e_change_word`：词形到原型的映射。
- `word_root`：词根关系。
- `liju_prod`：例句内容。
- `profession_dict`：专业词汇。
- `n_study_book`、`n_study_book_word`：课程和课程词表。
- `kaojuan`、`kaojuan_category`、`n_exam_question`：试卷、分类和题目。

## C. 用户行为域

生产分析报告中出现的学习记录、复习记录、错题、收藏、轨迹和购买记录，统一视为敏感业务数据。迁移前必须明确：字段含义、用户授权、去重规则、时间范围、删除/注销规则和回滚方案。

## D. 当前已存在的扩展表

实时 schema 还包含 `audio_cache`、`change_form`、`daily_stats`、`plan_daily_stats`、`study_plans`、`study_record`、`study_session`、`user_mistake_log`、`user_settings`。这些表说明后端已经开始支持音频缓存、学习会话、逐次学习记录、每日统计、复习计划和用户设置；它们应纳入新 API，而不是重新设计一套相互冲突的进度模型。

## 统一内容模型建议

新 API 不直接暴露旧表结构，统一返回：`content_id`、`source_table`、`word`、`lemma`、`part_of_speech`、`translation`、`forms`、`examples`、`audio_url`、`frequency`、`level`、`updated_at`。原始表名保留在导入层，客户端只依赖版本化 API。

