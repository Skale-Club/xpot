"""Guard printable utility icons against opaque SVG export backgrounds."""
import sys
import unittest
from importlib.util import find_spec
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class ServiceMarkTests(unittest.TestCase):
    @unittest.skipUnless(all(find_spec(package) for package in ('shapely', 'fitz', 'matplotlib')), 'Optional geometry runtime is not installed')
    def test_utility_symbols_preserve_negative_space(self):
        from builders.service import logo
        for face in ('wifi', 'website'):
            with self.subTest(face=face):
                shape = logo(face)
                left, top, right, bottom = shape.bounds
                coverage = shape.area / ((right - left) * (bottom - top))
                self.assertTrue(shape.is_valid)
                self.assertGreater(coverage, 0.1)
                self.assertLess(coverage, 0.75, 'Icon must not become a solid background rectangle')

    @unittest.skipUnless(all(find_spec(package) for package in ('shapely', 'fitz', 'matplotlib', 'segno')), 'Optional geometry runtime is not installed')
    def test_menu_styles_load_the_shared_font_catalog(self):
        from builders.service import layout, STYLES
        for style in STYLES:
            with self.subTest(style=style):
                art = layout('menu', 'plate', 'small', 'A7K3P9X2', 'white', style)
                self.assertFalse(art['ink'].is_empty)
                self.assertTrue(art['ink'].is_valid)


if __name__ == '__main__':
    unittest.main()
