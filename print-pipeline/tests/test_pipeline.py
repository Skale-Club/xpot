"""What runs anywhere, with the standard library only (CI): the bed recipe, the builder registry and the catalog.

    python -m unittest discover -s print-pipeline/tests -p "test_*.py"

The geometry itself needs the pinned packages, the Windows fonts and Bambu Studio: tests/rebuild.py checks it.
"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import BuildFailed, bed_recipe, safe_name  # noqa: E402

GRID = ['front-left', 'front-right', 'back-left', 'back-right']


def ticket(slots=None, rotation=None):
    slots = slots or [{'offset': [-72.5, -53.5]}, {'offset': [72.5, -53.5]}, {'offset': [-72.5, 53.5]}, {'offset': [72.5, 53.5]}]
    if rotation:
        slots[1]['rotation'] = rotation
    return {
        'job': {'id': 'job-1'},
        'model': {'slug': 'plate-large-menu-white', 'title': 'Plate Large · Menu · White'},
        'version': {'version': 2, 'builder': 'plate.menu', 'params': {'theme': 'white'},
                    'recipe': {'template': 'a1-pla-wallart-template-6slot.3mf', 'pause_top_z': 1.8, 'settings': {'wall_loops': '4'},
                               'parts': ['stale'], 'copies': ['stale']},
                    'bed': {'label': 'x4', 'copies': 4, 'positions': GRID, 'slots': slots}},
        'batch': {'batchCode': 'LPLATE-2026-007'},
    }


TAGS = [{'serial_number': f'00{i}', 'public_code': code} for i, code in enumerate(['AAAA1111', 'BBBB2222', 'CCCC3333', 'DDDD4444'], 1)]
PARTS = {t['serial_number']: [('White - Menu Plate', 'White_Menu_Plate.stl', 1), ('Black - Menu Art', 'Black_Menu_Art.stl', 2)] for t in TAGS}


class BedRecipeTest(unittest.TestCase):
    def test_one_copy_per_code_at_its_slot_named_with_the_code_last(self):
        cfg = bed_recipe(ticket(rotation=90), TAGS, PARTS, 1, 1)
        self.assertEqual(cfg['settings'], {'wall_loops': '4'})
        self.assertEqual(cfg['pause_top_z'], 1.8)
        self.assertEqual(len(cfg['parts']), 8)
        self.assertEqual(cfg['parts'][0], {'name': 'White - Menu Plate 001', 'stl': '001/White_Menu_Plate.stl', 'extruder': 1})
        self.assertEqual([c['name'] for c in cfg['copies']], [f'LPLATE-2026-007 #{t["serial_number"]} {t["public_code"]}' for t in TAGS])
        self.assertEqual(cfg['copies'][0]['offset'], [-72.5, -53.5])
        self.assertEqual(cfg['copies'][1]['rotation_z_deg'], 90)
        self.assertNotIn('rotation_z_deg', cfg['copies'][0])
        self.assertEqual(cfg['copies'][3]['parts'], ['White - Menu Plate 004', 'Black - Menu Art 004'])

    def test_a_partial_plate_fills_the_first_slots(self):
        cfg = bed_recipe(ticket(), TAGS[:2], PARTS, 3, 3)
        self.assertEqual(len(cfg['copies']), 2)
        self.assertEqual([c['offset'] for c in cfg['copies']], [[-72.5, -53.5], [72.5, -53.5]])
        self.assertTrue(cfg['name'].endswith('plate 3 of 3'))

    def test_a_bed_without_its_slots_cannot_be_built(self):
        t = ticket()
        t['version']['bed']['slots'] = t['version']['bed']['slots'][:3]
        with self.assertRaises(BuildFailed):
            bed_recipe(t, TAGS, PARTS, 1, 1)

    def test_names_are_safe_for_the_file_system(self):
        self.assertEqual(safe_name('LPLATE-2026-007 - Plate Large - Menu: "White"/v2'), 'LPLATE-2026-007 - Plate Large - Menu Whitev2')


class BuilderTest(unittest.TestCase):
    def test_a_piece_whose_qr_is_not_the_order_s_code_fails(self):
        from builders import BuildError, _check_url
        tag = {'public_code': 'AAAA1111', 'qr_url': 'https://xpot.place/q/AAAA1111'}
        _check_url('https://XPOT.PLACE/Q/AAAA1111', tag)
        with self.assertRaises(BuildError):
            _check_url('https://xpot.place/q/BBBB2222', tag)

    def test_unknown_builders_and_themes_are_refused_before_any_geometry(self):
        from builders import BuildError, _theme, build_piece
        with self.assertRaises(BuildError):
            build_piece('plate.unknown', {}, 0, {}, '.')
        self.assertEqual(_theme({'themes': ['white', 'white', 'black', 'black']}, 6), 'black')
        with self.assertRaises(BuildError):
            _theme({'theme': 'red'})

    def test_new_stand_cards_take_only_the_sticker(self):
        from builders import BuildError, build_piece
        tag = {'public_code': 'AAAA1111', 'serial_number': '001'}
        for builder, params in (('stand.google', {'size': 'small'}), ('stand.instagram', {'size': 'small'}),
                                ('stand.menu', {'size': 'small'}), ('stand.menu', {'size': 'large'}),
                                ('stand.menu', {'size': 'large', 'nfc_mount': 'sticker_10x20', 'font': 'Metropolis Medium, MENU spaced'}),
                                ('stand.google', {'size': 'medium', 'nfc_mount': 'sticker_10x20'})):
            with self.subTest(builder=builder, params=params), self.assertRaises(BuildError):
                build_piece(builder, tag, 0, params, '.')


class CatalogTest(unittest.TestCase):
    def test_every_ready_model_has_a_buildable_v1(self):
        catalog = json.loads((ROOT / 'catalog' / 'catalog.json').read_text(encoding='utf-8'))
        sys.path.insert(0, str(ROOT))
        source = (ROOT / 'builders' / '__init__.py').read_text(encoding='utf-8')
        for model in catalog['models']:
            version = model['version']
            if not version:
                continue
            with self.subTest(model=model['slug']):
                if version['builder'] is None:  # kept as a record of a batch; never built here (the legacy Small Stand)
                    continue
                self.assertIn(f"'{version['builder']}':", source)
                for bed in version['beds']:
                    self.assertEqual(len(bed['slots']), bed['copies'])
                    self.assertEqual(len(bed['positions']), bed['copies'])
                self.assertNotIn('parts', version['recipe'])
                self.assertNotIn('copies', version['recipe'])
                self.assertTrue((ROOT / 'library' / 'presets' / version['recipe']['template']).exists())


if __name__ == '__main__':
    unittest.main()
