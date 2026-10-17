import gzip
import json
import tempfile
import unittest
from pathlib import Path

from cache_word_audio import collect_candidates, cache_audio, build_index, write_index


HASH = "0123456789abcdef0123456789abcdef"
OTHER = "abcdef0123456789abcdef0123456789"
FRAME = b"\xff\xfb\x94\xc4" + b"\x00" * 380
MP3 = FRAME + FRAME


class WordAudioTests(unittest.TestCase):
    def test_rejects_fake_mp3_header(self):
        from cache_word_audio import valid_mp3
        self.assertFalse(valid_mp3(b"ID3" + b"0" * 50))
        self.assertFalse(valid_mp3(FRAME))
        self.assertTrue(valid_mp3(MP3))
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.words = self.root / "words.json"
        self.words.write_text(json.dumps({"words": [{"id": "1"}, {"id": "2"}]}), encoding="utf-8")
        self.csv = self.root / "words.csv.gz"
        with gzip.open(self.csv, "wt", encoding="utf-8", newline="") as stream:
            stream.write("id,change_form_sound\n1," + HASH + "\n2," + OTHER + "\n3," + HASH + "\n")
        self.audio = self.root / "audio"

    def test_only_whitelisted_valid_candidates(self):
        self.assertEqual(collect_candidates(self.words, self.csv), {"1": HASH, "2": OTHER})

    def test_rejects_duplicate_ids_and_unsafe_hashes(self):
        with gzip.open(self.csv, "wt", encoding="utf-8", newline="") as stream:
            stream.write("id,change_form_sound\n1," + HASH + "\n1," + OTHER + "\n")
        with self.assertRaises(ValueError):
            collect_candidates(self.words, self.csv)
        with gzip.open(self.csv, "wt", encoding="utf-8", newline="") as stream:
            stream.write("id,change_form_sound\n1,../escape\n")
        with self.assertRaises(ValueError):
            collect_candidates(self.words, self.csv)

    def test_index_contains_only_valid_cached_files(self):
        self.audio.mkdir()
        (self.audio / (HASH + ".mp3")).write_bytes(MP3)
        (self.audio / (OTHER + ".mp3")).write_bytes(b"not audio")
        self.assertEqual(build_index({"1": HASH, "2": OTHER}, self.audio), {"1": HASH + ".mp3"})
        output = self.root / "index.js"
        write_index({"1": HASH + ".mp3"}, output)
        self.assertIn('"1":"' + HASH + '.mp3"', output.read_text(encoding="utf-8"))

    def test_download_is_safe_retryable_and_size_bounded(self):
        calls = []

        def fetch(url, max_bytes):
            calls.append((url, max_bytes))
            return MP3, "audio/mpeg"

        result = cache_audio({"1": HASH}, self.audio, "http://example.test/wordaudio/", fetch=fetch)
        self.assertEqual(result["downloaded"], 1)
        self.assertEqual(result["failed"], [])
        self.assertEqual(calls[0][0], "http://example.test/wordaudio/" + HASH + ".mp3")
        self.assertEqual(cache_audio({"1": HASH}, self.audio, "http://example.test/wordaudio/", fetch=fetch)["skipped"], 1)
        self.assertEqual(len(calls), 1)

        def too_big(url, max_bytes):
            return b"ID3" + b"x" * (max_bytes + 1), "audio/mpeg"

        result = cache_audio({"2": OTHER}, self.audio, "http://example.test/wordaudio/", fetch=too_big, max_bytes=100)
        self.assertEqual(result["failed"], ["2"])
        self.assertFalse((self.audio / (OTHER + ".mp3")).exists())


if __name__ == "__main__":
    unittest.main()
