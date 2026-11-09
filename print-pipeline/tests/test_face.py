"""Face v3 (builders/face.py): every face lays out on every form, and a built piece passes its own checks.

    python -m unittest discover -s print-pipeline/tests -p "test_*.py"
"""
import sys
import tempfile
import unittest
from importlib.util import find_spec
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# The geometry runtime (print-pipeline/requirements.txt) is on the bench, not in CI: skipped where it is missing.
GEOMETRY = all(find_spec(p) for p in ('numpy', 'shapely', 'fitz', 'matplotlib', 'segno', 'trimesh'))
if GEOMETRY:
    from builders import build_piece  # noqa: E402
    from builders.face import BRANDS, FORMS, MENU_STYLES, colours, layout  # noqa: E402

CODE = 'A7K3P9X2'
TAG = {'serial_number': '001', 'public_code': CODE, 'qr_url': f'https://xpot.place/q/{CODE}', 'nfc_url': '', 'position': ''}


@unittest.skipUnless(GEOMETRY, 'needs the geometry packages (print-pipeline/requirements.txt)')
class FaceLayout(unittest.TestCase):
    def test_every_face_fits_every_form_in_both_colours(self):
        for face in BRANDS:
            for product, size in FORMS:
                for theme in ('white', 'black'):
                    for style in (MENU_STYLES if face == 'menu' else ('classic',)):
                        with self.subTest(face=face, form=f'{product} {size}', theme=theme, style=style):
                            art = layout(face, product, size, CODE, theme, style)
                            self.assertGreater(art['space'], 2)
                            width = art['width']
                            x0, _, x1, _ = art['ink'].bounds
                            self.assertGreater(x0, 0)
                            self.assertLess(x1, width)
                            drawn = [c for c in art['colours'] if c is not None]
                            self.assertEqual(len(drawn), len(colours(face, theme)))

    def test_qr_is_the_same_on_every_face_of_a_form(self):
        for product, size in FORMS:
            places = {tuple(layout(face, product, size, CODE, 'white')['q'].values()) for face in BRANDS if face != 'menu'}
            self.assertEqual(len(places), 1, f'{product} {size}')


@unittest.skipUnless(GEOMETRY, 'needs the geometry packages (print-pipeline/requirements.txt)')
class FaceBuild(unittest.TestCase):
    def test_black_paypal_plate_builds_inverted_with_two_blues(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, parts = build_piece('plate.face', TAG, 0, dict(face='paypal', size='large', theme='black'), Path(tmp))
            self.assertTrue(report['ok'])
            self.assertEqual(report['qr'], 'inverted')
            self.assertEqual(report['qr_decoded_mesh'], f'HTTPS://XPOT.PLACE/Q/{CODE}')
            self.assertEqual([slot for _, _, slot in parts], [1, 2, 3, 4])
            for _, filename, _ in parts:
                self.assertTrue((Path(tmp) / filename).exists())

    def test_small_stand_menu_takes_its_font(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, parts = build_piece('stand.face', TAG, 0, dict(face='menu', size='small', theme='white', style='rounded'), Path(tmp), batch='T')
            self.assertTrue(report['ok'])
            self.assertEqual(report['style'], 'rounded')
            self.assertEqual(len(parts), 2)


if __name__ == '__main__':
    unittest.main()
