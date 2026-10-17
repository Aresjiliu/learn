# 第三方代码与内容授权清单

更新时间：2026-10-14

## 第三方代码

| 项目 | 地址 | 当前用途 | 许可证状态 | 生产处理 |
|---|---|---|---|---|
| LingoSnake | https://github.com/eoeac/lingosnake | 复习调度、题目和测试结构 | MIT，已核对 | 选择性改造并保留许可证 |
| 官方小程序示例 | https://github.com/wechat-miniprogram/miniprogram-demo | 原生能力和工程参考 | MIT，已核对 | 不整仓复制 |
| mp-html | https://github.com/jin-yufeng/mp-html | 课程/解析富文本 | MIT，已核对 | 接入前核对版本和 HTML 安全 |
| lottie-miniprogram | https://github.com/wechat-miniprogram/lottie-miniprogram | 有限学习反馈动效 | MIT，已核对 | 仅按需引入，控制包体 |
| Tencent/iHearing | https://github.com/Tencent/iHearing | 发音评测示例 | MIT，已核对 | 先核验插件服务和俄语能力 |
| w-components | https://github.com/wangzongming/w-components | 音频/录音交互参考 | 未完成核验 | 暂不复制生产代码 |

## 内容授权核查表

| 内容 | 来源 | 小程序发布 | 商业化 | AI 使用 | 证据 |
|---|---|---|---|---|---|
| 课程视频 | 7500km 内容资产 | ready | ready | ready | 项目所有者已确认内部使用权；仍需完成媒体技术配置 |
| 教材词汇 | 生产内容库 | ready | ready | ready | 项目所有者已确认内部使用权；仍需完成内容质量清洗 |
| 俄语词典 | `ey_data` / `Russion1` | ready | ready | ready | 项目所有者已确认可用于本项目；保留来源字段 |
| 考试题库 | `production_7500km_com` | ready | ready | ready | 项目所有者已确认内部使用权；缺失答案的题目不直接开放 |
| 例句与翻译 | `liju_prod` 等 | ready | ready | ready | 项目所有者已确认内部使用权；仍需内容审核和清洗 |
| 录音/发音结果 | 用户产生 | needs-review | 不适用 | needs-review | 需隐私和语音数据政策 |

项目所有者已确认的自有内容可进入产品化评估；第三方代码继续按许可证保留声明。用户生成的录音、发音结果等数据仍需遵循隐私政策、最小化采集和删除规则。未经单独核验的外部词典、模型或素材，不进入公开发布和 AI 生产提示词。
