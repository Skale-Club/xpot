"""The layer-1 QR check (library/scripts/gcode-qr-check.py) on G-code the bench sliced. Needs OpenCV (requirements.txt):
skipped where it is missing (CI), run on the bench.

    python -m unittest discover -s print-pipeline/tests -p "test_gcode_qr_check.py"

fixtures/layer1-MNK82N0J-large-google-slot1.gcode.gz is the art (tool 1) of layer 1 of one card, cut from a real slice:
MNK82N0J on a Large Google Stand, bed slot 1 (lower-left, turned 90 degrees). Its QR is module-for-module right, yet
OpenCV's classic detector alone read nothing from it, so its plate failed every build (2026-10-31).
"""
import gzip
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / 'library' / 'scripts' / 'gcode-qr-check.py'
FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'layer1-MNK82N0J-large-google-slot1.gcode.gz'
BBOX = {'x': 6.0, 'y': 6.0, 'width': 137.0, 'depth': 103.0}

try:
    import cv2  # noqa: F401
    import numpy  # noqa: F401
    HAVE_CV = True
except ImportError:
    HAVE_CV = False


def check(name):
    """Run the check on the fixture as the object `name`: (exit code, output)."""
    out = Path(tempfile.mkdtemp(prefix='qr-check-'))
    try:
        with gzip.open(FIXTURE, 'rt', encoding='utf-8') as f:
            (out / 'plate_1.gcode').write_text(f.read(), encoding='utf-8')
        result = {'sliced_plates': [{'objects': [{'name': name, 'bbox': BBOX}]}]}
        (out / 'result.json').write_text(json.dumps(result), encoding='utf-8')
        r = subprocess.run([sys.executable, str(CHECK), str(out)], capture_output=True, text=True)
        return r.returncode, r.stdout
    finally:
        shutil.rmtree(out, ignore_errors=True)


@unittest.skipUnless(HAVE_CV, 'needs OpenCV (print-pipeline/requirements.txt)')
class LayerOneQrTest(unittest.TestCase):
    def test_the_turned_large_google_card_of_mnk82n0j_decodes(self):
        code, out = check('REV-2026-TEST #001 MNK82N0J')
        self.assertEqual(code, 0, out)
        self.assertIn('T1 HTTPS://XPOT.PLACE/Q/MNK82N0J', out)
        self.assertIn('1 of 1 checked objects decoded to their own code', out)

    def test_a_qr_that_decodes_to_another_code_still_fails(self):
        code, out = check('REV-2026-TEST #001 A7K3P9X2')
        self.assertEqual(code, 1, out)
        self.assertIn('FAIL', out)


if __name__ == '__main__':
    unittest.main()
