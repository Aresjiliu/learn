# 阶段 1：本地内容库导入设计

## 隔离原则

远端内容导入独立数据库 `ruflo_content`，不覆盖现有 `ruflo_db`。`ruflo_db` 继续保存用户、学习进度和本地后端实验数据；`ruflo_content` 只保存课程、词典、例句、词根、词频和考试内容。

## 导入层

第一版保留远端字段，不在导入时强行改写语义。每张白名单 CSV 导入一张 `raw_<schema>__<table>` 表，字段先以 `LONGTEXT` 保存，确保俄语、JSON、例句和历史字段不丢失。后续通过稳定的内容视图或服务适配为统一 API 模型。

导入过程：

1. 读取 `data/remote_7500km/manifest.json`。
2. 校验文件存在、SHA-256 和 manifest 行数。
3. 创建 `ruflo_content` 和 raw 表。
4. 使用 Python `csv` 解析器分批写入本地 MySQL；保留带换行的 CSV 字段，避免 `LOAD DATA` 对 CRLF/多行字段的兼容差异。
5. 导入后逐表 `COUNT(*)` 对账。
6. 写入本地导入报告，不连接远端、不修改 `ruflo_db`。

## 第一批稳定资源

- `dictionary`：俄语主词典、词形、词根、词频、专业词典。
- `examples`：中俄例句和翻译增强数据。
- `books`：课程、教材和课程词汇。
- `exams`：试卷、题型、题目、原文和音频引用。

## 后续规范化

导入完成后再建设 `content_dictionary`、`content_book`、`content_exam` 等规范表或视图。规范层需要处理重复词条、字段命名、主键映射、音频 URL、数据版本和来源追踪，不能在第一轮导入中丢失原始字段。

