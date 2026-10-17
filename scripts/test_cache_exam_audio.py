"""The listening sample may expose only verified, locally cached MP3 files."""

import json
import tempfile
import unittest
from pathlib import Path

from cache_exam_audio import collect_exam_candidates, build_exam_manifest, write_exam_manifest


HASH_A = "0123456789abcdef0123456789abcdef"
HASH_B = "abcdef0123456789abcdef0123456789"
FRAME = b"\xff\xfb\x94\xc4" + b"\x00" * 380
MP3 = FRAME + FRAME


class ExamAudioCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sample = self.root / "sample.json"
        self.sample.write_text(json.dumps({"questions": [
            {"id": "121", "audioUrl": f"/exam_audio/{HASH_A}.mp3"},
            {"id": "122", "audioUrl": f"/exam_audio/{HASH_A}.mp3"},
            {"id": "123", "audioUrl": f"/exam_audio/{HASH_B}.mp3"},
        ]}), encoding="utf-8")
        self.audio = self.root / "exam_audio"
        self.audio.mkdir()

    def test_extracts_question_mapping_and_deduplicates_manifest(self):
        candidates = collect_exam_candidates(self.sample)
        self.assertEqual(candidates, {"121": HASH_A, "122": HASH_A, "123": HASH_B})
        (self.audio / f"{HASH_A}.mp3").write_bytes(MP3)
        self.assertEqual(build_exam_manifest(candidates, self.audio), [f"{HASH_A}.mp3"])
        output = self.root / "manifest.js"
        write_exam_manifest([f"{HASH_A}.mp3"], output)
        self.assertEqual(output.read_text(encoding="utf-8"), f'module.exports = {{"files":["{HASH_A}.mp3"]}}\n')

    def test_rejects_unsafe_or_duplicate_question_mapping(self):
        self.sample.write_text(json.dumps({"questions": [
            {"id": "121", "audioUrl": "/exam_audio/../wrong.mp3"}
        ]}), encoding="utf-8")
        with self.assertRaises(ValueError):
            collect_exam_candidates(self.sample)
        self.sample.write_text(json.dumps({"questions": [
            {"id": "121", "audioUrl": ""},
            {"id": "121", "audioUrl": f"/exam_audio/{HASH_B}.mp3"},
        ]}), encoding="utf-8")
        with self.assertRaises(ValueError):
            collect_exam_candidates(self.sample)
        self.sample.write_text(json.dumps({"questions": [
            {"id": "121", "audioUrl": f"/exam_audio/{HASH_A}.mp3"},
            {"id": "121", "audioUrl": f"/exam_audio/{HASH_B}.mp3"},
        ]}), encoding="utf-8")
        with self.assertRaises(ValueError):
            collect_exam_candidates(self.sample)


if __name__ == "__main__":
    unittest.main()
