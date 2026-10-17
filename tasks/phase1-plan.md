# 阶段 1 工作计划：内容库导入与 API 契约

## 已完成

- [x] 确认本地 MySQL 运行在 3316 端口。
- [x] 设计 `ruflo_content` 与现有 `ruflo_db` 隔离。
- [x] 定义 raw 导入层和对账流程。
- [x] 定义 `/api/v1` P0 内容接口契约。

## 当前任务

- [x] 创建 `ruflo_content` raw 表并导入 19 张白名单表。
- [x] 对账 manifest 行数、文件哈希和本地表行数。
- [x] 确认 `ruflo_db` 仍存在且保持 22 张表，未被导入流程删除或覆盖。
- [x] 建立内容版本和来源清单（见 `docs/phase1/content-version-catalog.md`）。
- [ ] 在 Flask 后端增加只读内容 Repository 层。
- [ ] 实现字典搜索、课程列表、考试列表三个 P0 API。
- [ ] 为 API 响应建立固定 JSON schema 和错误码。

## 验收标准

- [x] `ruflo_db` 仍存在且未被导入流程覆盖；具体用户数据行数需在切换前做基线快照对账。
- [x] `ruflo_content` 导入表行数与 manifest 完全一致。
- [ ] 小程序可以通过 `/api/v1` 获取查词、课程和考试数据。
- [ ] API 不暴露远端表名、数据库地址或凭据。
- [ ] 导入和 API 查询均有最小化的自动化验证。

