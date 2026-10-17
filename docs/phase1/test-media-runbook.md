# 测试视频运行手册

## 本地开发

课程样例使用 `video1.mp4`，文件位于 `D:\project\weixin\media\video`，不会复制进小程序包。启动静态媒体服务：

```powershell
D:\software\anaconda3\python.exe scripts/serve_test_media.py
```

然后在微信开发者工具中编译 `D:\project\learn`，从首页进入“课程”→“东方教材大学俄语3”→“免费试听”。

## 配置规则

- `config.js` 中 `enableLocalTestMedia=true` 时，样例视频使用 `http://127.0.0.1:18090/video/video1.mp4`。
- `enableLocalTestAudio` 与视频开关独立；在完成题库音频逐题映射和服务端验证前保持 `false`。
- 本地测试视频不会追加业务 token。
- `project.private.config.json` 的 `urlCheck=false` 只允许本地开发验证，发布前必须恢复合法域名校验。
- 真机调试不能使用手机自身的 `127.0.0.1`；应改为开发机局域网地址，并配置小程序合法域名或使用开发者工具允许的本地调试方式。

## 验证

运行：

```powershell
D:\software\anaconda3\python.exe scripts/check_test_media.py
```

该检查只确认文件存在、大小非零和 MP4 容器头提示，不替代开发者工具或真机播放验收。启动服务后可用 `TEST_MEDIA_URL=http://127.0.0.1:18190/video/video1.mp4`（PowerShell 使用 `$env:TEST_MEDIA_URL=...`）运行 `check_test_media_http.py`，验证 `206 Partial Content`、拖动和分段加载所需响应。不能把“文件有效”误报为“HTTP 服务已启动”。

## 本地内容 API 模拟服务

如需验证阶段 1 内容接口而不连接生产服务，可另开终端运行：

```powershell
D:\software\anaconda3\python.exe scripts/serve_content_api.py
D:\software\anaconda3\python.exe scripts/check_content_api.py
```

该服务只读取 `data/content_samples/`，提供 `/api/v1/books`、`/api/v1/books/{book_id}`、`/api/v1/books/{book_id}/words`、`/api/v1/dictionary/search` 和 `/api/v1/exams/{paper_id}`，默认端口为 18091。它不代表生产 API 已部署。

若要在开发者工具中联调本地内容 API，可临时将 `config.js` 的 `enableContentApi` 改为 `true`；课程详情页和视频页会统一走 `/api/v1/books` 数据。联调结束后恢复为 `false`，避免依赖本地服务。

视频页使用 `components/media-player/` 封装原生 `video`。组件只负责媒体属性和事件转发，课程页继续负责权限、章节切换、播放进度和错误提示；因此后续增加试听时长或临时播放地址时，不需要重复修改页面播放器标记。

词典音频统一经过 `services/media/audio.js` 的单例会话管理器；离开详情页会停止当前音频，避免多个页面同时播放。该管理器尚未替代录音或语音评测能力。

本地内容 API 启动时读取 `data/content_samples/book_word_forms.json` 小索引，不再扫描完整词形导出；该索引由 `scripts/export_word_form_sample.py` 从已校验导出生成。

本地 API 的词典搜索和详情使用完整主词典导出索引；小程序未开启内容 API 时使用主词典样本加《东方教材大学俄语3》教材词汇样本，并标注数据来源，不代表生产词典规模。

题库样本已从原文表补入听力 `audioUrl` 和 `originalTextUuid`；当前本地媒体目录没有对应考试音频，因此练习页不会显示可播放按钮，生产 API 返回绝对地址后才启用播放。

首页“练习”先进入试卷目录；本地目录包含听力选择题和填空题两个可验证样本，在线内容 API 开启后才使用后端试卷目录。

课程视频进度同时保存到微信本地键 `video_progress_v1`，未登录测试也可验证断点恢复；登录后仍按原规则每 30 秒上报服务端，退出页面不会写入生产接口。

拖动到 0 秒和播放完成也会保存进度，避免边界操作造成断点状态不一致。
