# 阶段 1：API 接口契约 v1

基础路径：`/api/v1`。客户端不得直接访问 MySQL 或旧生产 API。

## 统一响应

成功：

```json
{"data": {}, "meta": {"request_id": "..."}}
```

失败：

```json
{"error": {"code": "CONTENT_NOT_FOUND", "message": "内容不存在"}, "meta": {"request_id": "..."}}
```

分页统一使用 `page`、`page_size`、`has_more`；默认 `page_size=20`，最大 100。

## P0 资源

| 方法 | 路径 | 用途 | 数据来源 |
|---|---|---|---|
| GET | `/dictionary/search?q=&page=` | 俄语/中文查词 | 主词典、翻译、词形 |
| GET | `/dictionary/{word_id}` | 单词详情、词性、音频、变形 | 词典、词形、词根 |
| GET | `/dictionary/{word_id}/examples` | 单词例句 | `liju_prod` / 课程例句 |
| GET | `/books` | 课程和教材列表 | `n_study_book` |
| GET | `/books/{book_id}/words` | 课程词汇 | `n_study_book_word` |
| GET | `/exams` | 试卷列表和分类 | 试卷表 |
| GET | `/exams/{paper_id}` | 试卷题目和原文 | 题库表 |
| GET | `/content/manifest` | 内容版本和来源 | 导入报告 |

## 统一内容字段

字典详情至少返回：`id`、`word`、`lemma`、`translation`、`part_of_speech`、`forms`、`roots`、`examples`、`audio_url`、`frequency`、`source`、`content_version`。

课程至少返回：`id`、`name`、`category`、`cover_url`、`word_count`、`lessons`、`source`。

考试至少返回：`id`、`title`、`category`、`question_count`、`audio_urls`、`questions`、`content_version`。

## 兼容和安全规则

- 新接口不得把远端表名暴露给客户端。
- 内容接口默认只读；用户学习接口另行使用 `users` 权限。
- 所有音频地址由后端生成，客户端不拼接内部路径。
- 内容版本通过 `content_version` 和 `updated_at` 控制缓存。
- AI 服务只能调用内容接口，不能直接读取 raw 表。

