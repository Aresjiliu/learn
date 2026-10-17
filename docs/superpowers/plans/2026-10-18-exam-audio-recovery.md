# 题库听力音频接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkboxes for tracking.

**Goal:** 让当前 8 道听力样本题使用已拥有的 7 个真实 MP3，同时保持缺文件时的安全降级。

**Architecture:** Python 标准库只读提取与缓存；运行时只打包已验证文件名；题目适配后统一解析相对音频地址。本地媒体服务仍只监听回环地址。

**Tech Stack:** Python 标准库、原生微信小程序 JavaScript、现有 `scripts/check_phase1.ps1`。

---

### Task 1：安全缓存与清单

**Files:** `scripts/cache_exam_audio.py`、`scripts/test_cache_exam_audio.py`、`data/content_samples/exam_audio.js`

- [x] 写失败测试：提取合法哈希；拒绝非 `/exam_audio/<hash>.mp3` 与重复题号；只将有效缓存写入清单。
- [x] 运行 `python scripts/test_cache_exam_audio.py`，确认失败点是尚未实现的行为。
- [x] 复用 `cache_word_audio.py` 的 `cache_audio`/`valid_mp3`，显式传入 `--source-base` 下载，临时文件原子落地。
- [x] 运行定向测试；从用户已有媒体源缓存 7 个文件，再运行离线索引重建，确认清单与实物一致。

### Task 2：页面播放门禁

**Files:** `services/exam-audio.js`、`pages/exam/practice/practice.js`、`scripts/test_exam_audio_resolver.js`

- [x] 写失败测试：已缓存的相对路径变完整本地 URL 且 `audioPlayable=true`；缺缓存仍 `audioPending=true`；禁用开关不播放。
- [x] 运行 `node scripts/test_exam_audio_resolver.js` 看见预期失败。
- [x] 加入纯音频解析函数，并在题目加载后调用；不为未知相对路径设置 `audioBaseUrl`。
- [x] 定向测试通过，并检查旧的选择/填空答题逻辑未变。

### Task 3：服务、门禁与手工验收

**Files:** `scripts/check_local_audio_policy.py`、`scripts/check_phase1.ps1`、`README.md`、`docs/phase1/manual-acceptance-checklist.md`

- [x] 写失败检查：清单列出的文件必须存在且是有效 MP3；旧项目路径不再参与判定。
- [x] 更新门禁，运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1`。
- [ ] 以 `--root audio` 启动服务，验证 7 个音频 HEAD/Range（已通过）；开发者工具逐题播放、切换与失败重试待人工验收。
- [ ] 提交源代码与清单，确认 `audio/`、`videos/`、原始导出仍被 Git 与小程序包排除后推送。
