# 教材词汇本地音频 Implementation Plan

> **For agentic workers:** 按子代理驱动开发逐任务执行；每项完成后进行规格审查、质量审查和主代理验证。

**Goal:** 用已拥有的教材发音资产使小程序的教材词汇可在本地真实播放。

**Architecture:** 从只读 CSV 导出安全的词条音频索引；MP3 缓存于 Git 忽略目录，通过本地媒体服务提供。现有词典播放器消费音频 URL，题库音频状态独立。

**Tech Stack:** Python 标准库、原生微信小程序 JavaScript/WXML、现有媒体服务与阶段检查。

## Task 1：导出并校验教材音频索引

- [ ] 在 `scripts/` 增加只读导出器，以 `data/content_samples/book_1_words.json` 的 ID 为白名单，读取 `data/remote_7500km/production_7500km_com__n_study_book_word.csv.gz` 的 `change_form_sound`。
- [ ] 对词条 ID、哈希、重复 ID 与文件名进行校验；生成紧凑的 `data/content_samples/book_1_audio.js`，只写入实际缓存成功的音频文件。
- [ ] 增加临时 CSV/MP3 夹具测试，先复现缺失功能，再验证映射、拒绝路径穿越和缺失资源不进入索引。目标统计：1,247 个词中至多 1,122 条有候选音频。

## Task 2：安全缓存现有 MP3

- [ ] 下载器接受显式 `--source-base`，只请求已校验的哈希名；默认不连接远端，输出目录为本机 `audio/wordaudio/`。
- [ ] 限制并验证响应大小和音频类型，临时文件原子落地，已完成文件可跳过，失败列表可重试；用小批量检查后再批量执行。
- [ ] 确认 `.gitignore` 排除 `audio/` 和全部 MP3；记录成功、失败及字节数，不记录用户数据或连接口令。

## Task 3：把索引接入现有播放路径

- [ ] 媒体服务从显式 `--root audio` 提供 `/wordaudio/<文件名>.mp3`，且 `/video/` 继续读取 `videos/`。
- [ ] `services/course.js`、`services/dictionary.js` 用音频索引给本地教材词加相对路径；词典搜索与详情使用独立 `enableLocalWordAudio` 开关，不改变题库音频开关。
- [ ] 增加有音频、无音频、加载失败和切换词条的行为回归；索引只包含已缓存文件，缺资源时不显示可播放入口。

## Task 4：联调与验收

- [ ] 运行音频定向测试、`scripts/check_test_media_http.py`、`scripts/check_phase1.ps1`，确认包体小于现行门禁。
- [ ] 在开发者工具验证一条教材词的播放/停止/失败状态，记录截图和错误日志；真机 HTTPS 播放在正式媒体域名接入后验收。

**依赖顺序：**视频媒体服务修复 → Task 1 → Task 2 → Task 3 → Task 4。每项完成后保持应用可运行；原始导出与音频缓存均不进入 Git。
