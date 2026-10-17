# 首个试听切片字段对照

## 课程链路

| 小程序需要 | `weixin` 原型字段 | 本地内容库候选来源 | 说明 |
|---|---|---|---|
| 课程 ID/标题/介绍 | `Course.id/title/description` | `n_study_book` | 需确认课程表与教材表的业务映射 |
| 封面/价格 | `cover_image/price/original_price` | 本地导出未包含完整媒体资源 | 先用测试资源验证页面，不把图片 URL 写死 |
| 章节/视频 | `Chapter`、`Video` | 本地内容表暂未形成视频规范表 | 试听切片可先依赖现有课程后端或静态测试数据 |
| 试听权限 | 第一章放行逻辑 | 旧 Android 会员/试看流程 | 先定义公开首节，不涉及购买状态 |
| 关联词汇 | 尚无模型 | `n_study_book_word` + 主词典 | 需要按教材词汇关系映射到主词典详情 |

## 词典链路

| 能力 | 参考来源 | 可落地形式 |
|---|---|---|
| 俄语搜索 | `Russion1.SearchService`、Android `russianv4` | 小程序业务层统一成 `searchWord(query)` |
| 中文搜索 | `Russion1.searchChineseWord`、Android `chinesev4.do` | 服务端或本地索引完成中文到俄语候选映射 |
| 单词详情 | `DataBean`、本地 `x_7500km_russian_index_new_test` | 首版展示释义、词性、重音、例句入口 |
| 词形变化 | `Russion1.ChangesBean`、`e_change_word` | 第二阶段接入，避免首个切片过大 |

## 关键阻断项

1. `weixin` 课程模型与本地内容库尚未建立正式映射。
2. 视频/音频文件本身不在当前内容表导出中，需要单独盘点媒体资产。
3. Android 旧 API 使用签名和加密，不能由小程序直接持有密钥。
4. 小程序当前请求层依赖旧接口响应格式，需先通过适配层或临时 mock 验证页面。

## 验证顺序

先用本地可控数据验证页面和词汇映射，再用非生产接口验证网络和媒体，最后才评估登录、权限和支付。
