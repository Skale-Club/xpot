import io
import os
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import desktop  # noqa: E402


class TrustTest(unittest.TestCase):
    def test_answers_only_xpot_pages_at_its_own_address(self):
        self.assertTrue(desktop.origin_allowed('https://xpot.place'))
        self.assertFalse(desktop.origin_allowed('https://evil.example'))
        self.assertFalse(desktop.origin_allowed('null'))
        self.assertFalse(desktop.origin_allowed(''))
        self.assertTrue(desktop.host_allowed(f'127.0.0.1:{desktop.PORT}'))
        self.assertFalse(desktop.host_allowed('evil.example'))


class ExtractTest(unittest.TestCase):
    def archive(self, folder, name, link=False):
        path = os.path.join(folder, 'a.tgz')
        with tarfile.open(path, 'w:gz') as tar:
            info = tarfile.TarInfo(name)
            if link:
                info.type = tarfile.SYMTYPE
                info.linkname = '/etc/passwd'
                tar.addfile(info)
            else:
                info.size = 2
                tar.addfile(info, io.BytesIO(b'ok'))
        return path

    def test_unpacks_a_normal_file(self):
        with tempfile.TemporaryDirectory() as folder:
            target = os.path.join(folder, 'out')
            os.makedirs(target)
            desktop.safe_extract(self.archive(folder, 'bench.py'), target)
            self.assertTrue(os.path.exists(os.path.join(target, 'bench.py')))

    def test_refuses_a_path_out_of_the_folder_and_links(self):
        with tempfile.TemporaryDirectory() as folder:
            target = os.path.join(folder, 'out')
            os.makedirs(target)
            with self.assertRaises(ValueError):
                desktop.safe_extract(self.archive(folder, '../evil.py'), target)
            with self.assertRaises(ValueError):
                desktop.safe_extract(self.archive(folder, 'link', link=True), target)


if __name__ == '__main__':
    unittest.main()
