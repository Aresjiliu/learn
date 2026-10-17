# 内容与媒体生产基线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立俄语小程序正式开发前的可审计内容、媒体和测试基线。

**Architecture:** 保持 `ruflo_content` 与 `ruflo_db` 隔离；先校验原始导出，再生成规范化报告和脱敏样本。媒体采用元数据清单，不将大文件放进小程序包。

**Tech Stack:** Python 3、现有只读校验脚本、JSON/CSV/GZIP、MySQL 本地隔离库、原生微信小程序样本。

---

### Task 1: 校验远端内容导出

**Files:**
- Read: `data/remote_7500km/manifest.json`
- Read: `scripts/verify_remote_exports.py`
- Write: `docs/phase0/remote-export-verification.txt`

- [x] **Step 1: Run the existing read-only verifier**

Run: `python scripts/verify_remote_exports.py`

Expected: `tables=19`、`rows=3776217`、`bad=[]`、`user_like_tables=[]`。

- [x] **Step 2: Save the verification output**

Write the exact command output and verification date to `docs/phase0/remote-export-verification.txt`; do not copy credentials or row contents.

### Task 2: Establish media inventory

**Files:**
- Create: `scripts/inventory_media.py`
- Create: `docs/phase0/media-inventory.json`

- [x] **Step 1: Enumerate local media only**

Scan configured local asset roots without opening or copying media content: `D:\project\weixin\media` and `D:\project\learn\images`. Record absolute path, extension, byte size, modified time, and a status of `local-test-only`.

- [x] **Step 2: Generate a stable JSON report**

Sort records by path and write UTF-8 JSON. Do not infer production authorization or playable URLs from local files.

- [x] **Step 3: Verify the report**

Run: `python scripts/inventory_media.py`

Expected: a report exists and every record has `path`, `extension`, `sizeBytes`, `modifiedTime`, and `status`.

### Task 3: Document content readiness gates

**Files:**
- Create: `docs/phase0/content-readiness-checklist.md`
- Modify: `progress.md`

- [x] **Step 1: Record the four release statuses**

Use only `ready`、`needs-review`、`missing`、`local-test-only` for course, word, question, audio and video assets.

- [x] **Step 2: Record blockers**

List missing media, unverified licenses, unresolved field mappings, and any table-count mismatch. Do not mark content ready based only on database row counts.

### Task 4: Add third-party and data authorization inventory

**Files:**
- Create: `docs/compliance/third-party-and-content-rights.md`

- [x] **Step 1: List every external repository used for reference**

Include LingoSnake, official demo, `mp-html`, Lottie, iHearing, video and audio references. Record repository URL, license status, intended use, and whether code will be copied.

- [x] **Step 2: List content authorization questions**

Record course, textbook, question bank, audio, video, dictionary and AI-use authorization as separate entries with owner and evidence path fields.

### Task 5: Gate formal feature development

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`

- [x] **Step 1: Do not start payment or AI implementation**

Keep payment, production migration and external AI calls out of this sub-project until content readiness and media access are proven.

- [x] **Step 2: Mark the next approved slice**

After Tasks 1–4 pass, approve only “课程详情 + 免费试听 + 关联词汇” as the next implementation slice.

### Task 6: Profile content quality from verified exports

**Files:**
- Create: `scripts/profile_content_exports.py`
- Create: `docs/phase0/content-quality-report.json`
- Create: `docs/phase0/content-quality-report.md`

- [x] **Step 1: Profile local compressed exports**

Run: `D:\software\anaconda3\python.exe -u scripts/profile_content_exports.py`

Expected: the report contains dictionary size, textbook word duplicates, dictionary match rate, missing example fields, missing question fields, and book metadata gaps.

- [x] **Step 2: Preserve the report as development evidence**

Keep the JSON output as a generated read-only evidence file. Use its findings to choose the first textbook and to define content normalization tests; do not silently repair source exports in place.

## Execution notes

- The default `python` launcher pointed to a missing `C:\Python313\python.exe`; the verifier was run successfully with `D:\software\anaconda3\python.exe -u`.
- A PowerShell multi-path inspection command used an invalid `Get-Item` argument form; it did not affect project files or data. The generated files were subsequently checked with individual paths.
- The local test media configuration is wired to `http://127.0.0.1:18090/video/video1.mp4`; attempts to bind ports 8090 and 18090 were rejected by the operating system, so a running media server has not been claimed. This is an environment issue, not a content-data modification.
- The first vocabulary comparison report counted overlapping tiers; the script was corrected to mutually exclusive tiers and rerun. The final report uses 15,335 distinct textbook words and 91.0858% coverage.
- The project owner confirmed the internal course, textbook, dictionary and question-bank assets are available for this project. The checklist therefore no longer treats internal authorization evidence as a blocker; third-party licenses and user-data privacy remain separate controls.
