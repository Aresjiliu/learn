import tempfile
import unittest
from pathlib import Path

from check_local_audio_policy import audit_audio


FRAME = b"\xff\xfb\x94\xc4" + b"\x00" * 380


class LocalAudioPolicyTests(unittest.TestCase):
    def test_enabled_requires_every_manifest_file_to_exist_and_decode(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as root:
            audio = Path(root)
            filename = "0123456789abcdef0123456789abcdef.mp3"
            self.assertEqual(audit_audio(audio, [filename], True)["status"], "needs-review")
            (audio / filename).write_bytes(b"not mp3")
            self.assertEqual(audit_audio(audio, [filename], True)["status"], "needs-review")
            (audio / filename).write_bytes(FRAME + FRAME)
            self.assertEqual(audit_audio(audio, [filename], True)["status"], "pass")
            self.assertEqual(audit_audio(audio, [filename], False)["status"], "pass")


if __name__ == "__main__":
    unittest.main()
