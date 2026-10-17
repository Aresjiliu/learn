# 题库听力音频接入设计

## 问题与边界

当前本地听力样本包含 8 题、7 个独立的 `/exam_audio/<32位哈希>.mp3`。媒体源抽查返回 `200 audio/mpeg`，但工作区没有相应文件，`enableLocalTestAudio=false`，因此适配层把路径标记为 `audioPending`。教材词音频的 1,122 条缓存是另一条链路，不应混用开关或清单。

## 方案

从本地只读样本提取题目 ID 与合法音频哈希；复用现有安全下载与 MP3 校验逻辑，缓存到 Git 忽略的 `audio/exam_audio/`。仅将验证过的文件名生成到小程序可打包的 `data/content_samples/exam_audio.js`。音频解析函数只将清单内的 `/exam_audio/<哈希>.mp3` 转为 `devMediaBaseUrl` 的完整 URL；远程 HTTPS 原样保留，未缓存的相对路径仍显示待接入，不假装可以播放。

本地服务用 `python scripts/serve_test_media.py --root audio` 同时提供 `/video/` 和 `/exam_audio/`。下载器不硬编码生产源地址，不提交 MP3、原始导出或用户数据。正式发布需改为 HTTPS 媒体域名；本轮只验证本地开发者工具链路。

## 验收

自动测试覆盖有效/无效哈希、重复音频、缺文件、禁用开关、绝对远程 URL、播放错误与资源访问。检查脚本必须依据实际 `audio/exam_audio/` 与清单校验，不能依赖旧项目目录。全部 7 个音频返回 `audio/mpeg` 且支持 Range；8 道样本题显示可播放按钮。缺失文件不得被标记为可播放。
