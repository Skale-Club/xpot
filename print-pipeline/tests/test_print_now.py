"""The Print Now folder (print_now.py): Xpot's plates by status and request, standard library only (CI).

    python -m unittest discover -s print-pipeline/tests -p "test_*.py"
"""
import hashlib
import os
import sys
import tempfile
import unittest
from datetime import timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import print_now  # noqa: E402

REQUEST = '2026-10-22 15h53 - Stand Large - Instagram - Black - 10 un - req-1'


def plate(n, status='ready', batch='IG-2026-004', quantity=4, files=('3mf', 'gcode_3mf'), request='req-1'):
    return {
        'id': f'plate-{n}', 'status': status, 'requestId': request, 'requestCreatedAt': '2026-10-22T15:53:07.000Z',
        'requestQuantity': 10, 'plateNumber': n, 'plateCount': 3, 'quantity': quantity, 'batchCode': batch,
        'modelTitle': 'Stand Large · Instagram · Black',
        'files': [{'id': f'{kind}-{n}', 'kind': kind, 'filename': f'x.{kind}', 'sha256': hashlib.sha256(f'{kind}-{n}'.encode()).hexdigest(),
                   'bytes': len(f'{kind}-{n}'), 'url': f'https://signed.example/{kind}-{n}'} for kind in files],
    }


class Fetcher:
    def __init__(self):
        self.calls = []

    def __call__(self, url):
        self.calls.append(url)
        return url.rsplit('/', 1)[1].encode()


def tree(root):
    out = []
    for base, _dirs, names in os.walk(root):
        for name in names:
            out.append(os.path.relpath(os.path.join(base, name), root).replace(os.sep, '/'))
    return sorted(out)


class PrintNowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def sync(self, plates, fetch=None):
        return print_now.sync(self.root, plates, fetch or Fetcher(), log=lambda _m: None, tz=timezone.utc)

    def test_names_say_the_request_the_plate_and_its_pieces(self):
        self.assertEqual(print_now.request_folder(plate(1), tz=timezone.utc), REQUEST)
        self.assertEqual(print_now.plate_file(plate(3, quantity=2), 'gcode_3mf'), 'IG-2026-004 - placa 3 de 3 - 2 un.gcode.3mf')
        self.assertEqual(print_now.plate_file(plate(1, batch=None), '3mf'), 'Placa - placa 1 de 3 - 4 un.3mf')

    def test_downloads_the_ready_plates_then_keeps_them(self):
        fetch = Fetcher()
        self.assertEqual(self.sync([plate(1), plate(2)], fetch)['added'], 4)
        self.assertIn(f'Para imprimir/{REQUEST}/IG-2026-004 - placa 1 de 3 - 4 un.3mf', tree(self.root))
        self.assertEqual(len(fetch.calls), 4)
        again = Fetcher()
        self.assertEqual(self.sync([plate(1), plate(2)], again), {'added': 0, 'moved': 0, 'removed': 0, 'kept': 4, 'skipped': 0})
        self.assertEqual(again.calls, [])

    def test_moves_a_printed_plate_and_removes_one_that_left_the_list(self):
        self.sync([plate(1), plate(2)])
        changed = self.sync([plate(1, status='printed')])
        self.assertEqual((changed['moved'], changed['removed']), (2, 2))
        self.assertEqual(tree(self.root), [
            '.xpot-print-now.json',
            f'Impressos/{REQUEST}/IG-2026-004 - placa 1 de 3 - 4 un.3mf',
            f'Impressos/{REQUEST}/IG-2026-004 - placa 1 de 3 - 4 un.gcode.3mf',
        ])
        self.assertFalse(os.path.exists(os.path.join(self.root, 'Para imprimir', REQUEST)))

    def test_never_touches_files_it_did_not_write(self):
        os.makedirs(os.path.join(self.root, 'Para imprimir', REQUEST))
        mine = os.path.join(self.root, 'Para imprimir', REQUEST, 'my notes.txt')
        Path(mine).write_text('keep me')
        loose = os.path.join(self.root, 'old test.3mf')
        Path(loose).write_text('loose')
        self.sync([plate(1)])
        target = os.path.join(self.root, 'Para imprimir', REQUEST, 'IG-2026-004 - placa 1 de 3 - 4 un.3mf')
        Path(target).write_text('edited in Bambu Studio and saved over')
        self.sync([])
        self.assertTrue(os.path.exists(mine))
        self.assertTrue(os.path.exists(loose))
        self.assertTrue(os.path.exists(target))

    def test_never_writes_over_a_file_it_does_not_know(self):
        target_dir = os.path.join(self.root, 'Para imprimir', REQUEST)
        os.makedirs(target_dir)
        target = os.path.join(target_dir, 'IG-2026-004 - placa 1 de 3 - 4 un.3mf')
        Path(target).write_text('my own file')
        changed = self.sync([plate(1, files=('3mf',))])
        self.assertEqual((changed['added'], changed['skipped']), (0, 1))
        self.assertEqual(Path(target).read_text(), 'my own file')

    def test_an_edit_of_the_same_size_is_not_ours_any_more(self):
        self.sync([plate(1, files=('3mf',))])
        target = os.path.join(self.root, 'Para imprimir', REQUEST, 'IG-2026-004 - placa 1 de 3 - 4 un.3mf')
        Path(target).write_bytes(b'X' * os.path.getsize(target))
        self.sync([plate(1, status='printed', files=('3mf',))])
        self.assertTrue(os.path.exists(target))
        self.sync([])
        self.assertEqual(Path(target).read_bytes(), b'X' * len(b'3mf-1'))

    def test_ignores_a_manifest_entry_outside_the_folder(self):
        outside = os.path.join(os.path.dirname(self.root), 'outside-print-now.txt')
        Path(outside).write_text('3mf-1')
        try:
            entry = {'plate': 'p', 'file': 'f', 'sha256': hashlib.sha256(b'3mf-1').hexdigest(), 'bytes': 5}
            print_now._save_manifest(self.root, {os.path.join('..', 'outside-print-now.txt'): entry})
            self.sync([])
            self.assertTrue(os.path.exists(outside))
        finally:
            os.remove(outside)

    def test_two_identical_requests_in_the_same_minute_keep_their_own_plates(self):
        first = plate(1, batch=None, files=('3mf',), request='req-aaaa')
        second = dict(plate(1, batch=None, files=('3mf',), request='req-bbbb'), id='plate-other')
        second['files'] = [dict(second['files'][0], id='3mf-other')]
        self.assertEqual(len(print_now.layout([first, second], tz=timezone.utc)), 2)

    def test_refuses_a_download_that_does_not_match_its_checksum(self):
        with self.assertRaises(ValueError):
            self.sync([plate(1)], fetch=lambda _url: b'something else')


if __name__ == '__main__':
    unittest.main()
