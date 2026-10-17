# 阶段 1 运行配置

当前仓库默认面向微信开发者工具本机调试：

- `config.js` 的旧业务接口、内容 API 和测试媒体均使用 `127.0.0.1`。
- `enableContentApi=false` 时，课程、词典和题库目录优先走本地样例；`enableLocalSampleFallback=true` 用于页面联调。
- `enableLocalTestMedia=true` 时，课程样例视频来自本地静态媒体服务 `18090`。
- `project.private.config.json` 的 `urlCheck=false` 只用于开发者工具调试，不能作为发布配置。
- `enableRemoteWrites=false` 是阶段 0/1 的安全默认值，统一阻断收藏、购买、登录后的服务端写入和远程播放进度上报；本地播放进度仍可保存在设备上。
- `enableLocalTestMedia=true` 仅启用本地测试视频；`enableLocalTestAudio=false` 单独控制题库/词典音频。当前本地没有逐题 `exam_audio` 映射，保持音频关闭，避免把不存在的资源显示为可播放。
- 阶段门禁 `scripts/check_local_audio_policy.py` 会在本地没有 `exam_audio` 文件时拒绝开启音频开关。
- 课程收藏、购买和用户登录入口也会在页面层显示只读提示，不会先弹出确认框再失败。

## 开发者工具

启动媒体和内容服务后，直接导入仓库并编译：

```powershell
python scripts/serve_test_media.py
python scripts/serve_content_api.py
python scripts/check_runtime_config.py
```

只有在鉴权、订单、收藏、播放进度接口逐项验收后，才允许将 `enableRemoteWrites` 改为 `true`，并单独进行真机验证。

开发者工具可通过“详情 → 本地设置 → 不校验合法域名”访问本机 HTTP 服务。该设置不等于线上域名配置。

## 局域网真机

将 `config.js` 中三个 `127.0.0.1` 替换为开发机局域网地址，例如 `http://192.168.1.20:18090`，并确保手机可访问对应端口。真机不能把手机自己的 `127.0.0.1` 当作开发机。

真机验证完成后，应恢复本机配置或使用未提交的本地覆盖文件；不要把局域网地址、生产地址、令牌写入公共提交。

## 发布前门禁

发布前必须完成：使用 HTTPS 域名、配置微信合法域名、关闭本地媒体和样例回退、明确开启已部署并验收的内容 API，并重新执行：

- `enableContentApi=true` 时，`contentApiBaseUrl` 必须是 HTTPS。
- `enableRemoteWrites=true` 时，`baseUrl` 必须是 HTTPS。

```powershell
python scripts/check_runtime_config.py
```

该脚本是静态门禁，不会访问生产服务，也不会修改任何配置。

## 一键回归

阶段 1 的本地回归可执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1
```

该命令不启动 HTTP 服务；内容 API 和测试视频的端到端检查仍使用各自的服务启动命令。
