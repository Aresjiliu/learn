# 俄语7500微信小程序

原生微信小程序项目。当前以本地只读内容样本验证课程、词典、题库和视频主链路；生产接口与远程写入默认关闭。

## 本地开发

1. 在微信开发者工具中导入本目录，使用自己的开发权限打开项目。
2. 执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1` 运行阶段检查。完整检查需要本机保留 `data/remote_7500km/` 的只读原始导出；该目录不纳入 Git。
3. 如需本地内容 API，执行 `python scripts/serve_content_api.py`。测试视频放在本地 `videos/`，词音频放在本地 `audio/wordaudio/`，再执行 `python scripts/serve_test_media.py --root audio`；两个媒体目录均不纳入 Git 或小程序包。
4. 已有教材音频源时，可运行 `python scripts/cache_word_audio.py --source-base <音频目录URL>` 缓存并生成只含已缓存文件的词音频索引。不要把生产地址写进源码。克隆仓库后若未恢复本地音频缓存，词音频入口不能正常播放。
5. 开发者工具中按 [手工验收清单](docs/phase1/manual-acceptance-checklist.md) 检查页面编译、实际播放、网络失败与重试。自动检查通过不代表真机播放已通过。

运行开关位于 `config.js`。本地 HTTP 调试需在开发者工具关闭合法域名校验；发布前须配置 HTTPS 域名并完成真实接口验收。`enableRemoteWrites` 保持关闭，直到写接口、鉴权和支付分别验收。

## 目录

- `pages/`：课程、视频、题库、词典等页面；`services/`：数据适配与业务逻辑。
- `data/content_samples/`：可提交的本地样本和运行时模块；`data/remote_7500km/`：仅本机使用的原始导出。
- `scripts/`：只读检查、样本生成和本地服务；`docs/`：设计、内容审核与验收记录。

贡献约定见 [AGENTS.md](AGENTS.md)。
