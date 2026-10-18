# 词典发音资产审计记录

## 本机结果

| 指标 | 数量 |
|---|---:|
| 教材词明细 | 63,783 |
| 非空音频引用明细 | 61,325 |
| 非法音频引用 | 68 |
| 合法音频原词组 | 13,219 |
| 多音频哈希原词组 | 227 |
| 受多音频歧义影响的主词典词条 | 209 |
| 结构检查通过的缓存文件 | 1,122 |
| 本机缺失的不同引用文件 | 12,181 |
| 主词典原生音频哈希缓存命中 | 0 |
| 教材严格原词→主词典候选词条 | 1,082 |

匹配保留 `ё/е`、`й/и`，忽略大小写及重音。原词相同但音频哈希不同仍可能是有效的不同录音；本阶段只标记歧义，不断言源内容错误。12,181 是教材和主词典合法引用的不同文件数，不是缺失词条数。1,082 是稳定词典词条数，不是不同 MP3 数。

## 复跑与来源

```powershell
D:\software\anaconda3\python.exe -B scripts/test_dictionary_audio_audit.py
D:\software\anaconda3\python.exe -B scripts/audit_dictionary_audio.py --export data/remote_7500km/production_7500km_com__n_study_book_word.csv.gz --index data/generated/dictionary.sqlite --cache-dir audio/wordaudio --output data/generated/dictionary-audio-candidates.json
```

教材压缩导出 SHA-256：`a916928650e3b5659a0b56df1117a978c46180d2ca2f45fd3c7e959a31fd61e6`。

词典索引 SHA-256：`6400e7343d5ba92754e949aec4dc18a2b9377a1c3c075be19fbb0fb4bd664f25`。

程序默认仅输出汇总；显式 `--output` 才写候选报告。只读读取 SQLite，不改变原始导出、索引或 MP3，不连接生产服务。完整报告包含稳定 ID、教材来源 ID、文件字节数和 SHA-256，留在 Git 和小程序包体排除目录。

质量审查复现了 `mode=ro` 仍可能创建 WAL 辅助文件，以及读取后才哈希导致来源错配的两项问题。现已新增失败回归并修复：拒绝 WAL/活动日志输入，不经 SQLite 打开源文件；用忽略目录内私有副本审计，复制前后及报告返回前核对哈希，输入改变则失败。私有副本自动清理，约需 478 MB 加教材压缩文件大小的临时空间。当前 9 个夹具用例通过；不接受将活动数据库当独立快照使用。

## 放行边界与下一步

### 独立完整解码检查

本机已有 SoundFile 0.13.1 / libsndfile 1.2.2，本轮未安装新的运行依赖。逐个以 `SoundFile.blocks(blocksize=8192, dtype='float32', always_2d=True)` 流式解码缓存文件到结尾，检查非空、有限 PCM 和非零峰值：1,122/1,122 成功，无失败、无全静音，合计 52,470,900 帧 / 1,165.510 秒；采样率 44,100 或 48,000 Hz，单/双声道。这是额外解码证据，不改变候选报告的结构检查层级，也不证明逐词发音语义或微信真机兼容性。

只读复查可在已装 SoundFile/NumPy 的本机解释器运行下述 Python；不需要把它们引入小程序或查询服务：

```python
from pathlib import Path
import numpy as np
import soundfile as sf

files = sorted(Path('audio/wordaudio').glob('*.mp3'))
assert files
for path in files:
    with sf.SoundFile(path) as audio:
        frames, peak = 0, 0.0
        for block in audio.blocks(blocksize=8192, dtype='float32', always_2d=True):
            assert np.isfinite(block).all(), path.name
            frames += len(block)
            peak = max(peak, float(np.abs(block).max()))
        assert frames > 0 and peak > 0, path.name
print(f'decoded: {len(files)}')
```

报告为 `mp3-structure-only` 且 `publicationReady=false`。既有结构检查只检出 MPEG 帧结构，不能证明完整解码、发音正确或同形词重音一致。当前运行时词典音频覆盖没有因本报告而增加。

后续将完成来源行绑定与发音抽样听审，单独建立可发布白名单，再由只读服务返回可验证媒体地址；部署 HTTPS、失败重试及 iOS/Android 实播仍是 A3 验收项。
