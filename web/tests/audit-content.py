"""SPDX-License-Identifier: AGPL-3.0-or-later
Regression tests for the previously missed archive contents and stale source.
"""
from pathlib import Path
import importlib.util, io, json, tarfile, tempfile, unittest, zipfile, sys, shutil, subprocess
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('audit', Path(__file__).resolve().parents[1] / 'scripts/audit-content.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

def tar(name, content):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w:gz') as t:
        info = tarfile.TarInfo(name); info.size = len(content)
        t.addfile(info, io.BytesIO(content))
    return out.getvalue()

def zip(name, content):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z: z.writestr(name, content)
    return out.getvalue()

class AuditTests(unittest.TestCase):
    def test_portable_release_inventory_order(self):
        # Windows Path ordering folds case; Linux Path ordering does not.
        # The same source tree must produce a pin that either OS can verify.
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            names = ['src/app.txt', 'assets/icon.svg', 'NOTICE.txt', 'src/App.js', 'LICENSE.txt']
            for name in names:
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(b'original fixture')
            (root/'sources').mkdir()
            (root/'sources/web-ui-source.zip').write_bytes(zip('source.txt', b'original fixture'))
            (root/'offline-manifest.js').write_bytes(b'// original fixture')
            audit.run(root, record=True)
            inventory = json.loads((root/audit.PIN).read_text(encoding='utf8'))
            self.assertEqual([row['path'] for row in inventory['files']], sorted(names))
            audit.run(root)

    def test_rom_signature_with_an_innocent_extension(self):
        for offset, signature in [(0x104, 'ceed6666cc0d'), (4, '24ffae51699aa221'), (0xc0, '24ffae51699aa221')]:
            data = bytearray(1024); data[offset:offset+len(bytes.fromhex(signature))] = bytes.fromhex(signature)
            with self.assertRaisesRegex(ValueError, 'ROM signature'):
                audit.Scanner().inspect('image.png', bytes(data))

    def test_secret_and_private_data_in_archives(self):
        for name, data in [('settings/.env', b'private'), ('file.txt', b'gh' + b'p_' + b'x'*40), ('firmware.bios', b'private'), ('skin.deltaskin', b'private')]:
            with self.assertRaises(ValueError):
                audit.Scanner().inspect('source.zip', zip(name, data))

    def test_rom_hidden_in_tar_gzip_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'ROM/save'):
            audit.Scanner().inspect('source.tar.gz', tar('tests/fixture.gba', b'original test data'))

    def test_save_in_nested_zip_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'ROM/save'):
            audit.Scanner().inspect('outer.zip', zip('inner.zip', zip('save.sav', b'save data')))

    def test_every_tar_member_is_pinned(self):
        s = audit.Scanner(); s.inspect('source.tar.gz', tar('src/core.c', b'int main(){}'))
        self.assertEqual([x['path'] for x in s.rows], ['source.tar.gz', 'source.tar.gz!src/core.c'])

    def test_disguised_archive_and_unsafe_path(self):
        with self.assertRaisesRegex(ValueError, 'ROM/save'):
            audit.Scanner().inspect('opaque.dat', zip('private.srm', b'test'))
        with self.assertRaisesRegex(ValueError, 'Unsafe archive'):
            audit.Scanner().inspect('source.tar.gz', tar('../outside.c', b'x'))

    def test_unregistered_file_and_changed_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root/'app.js').write_text('original', encoding='utf8')
            audit.run(root, record=True)
            (root/'unknown.js').write_text('unreviewed', encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'unregistered'): audit.run(root)
            (root/'unknown.js').unlink(); (root/'app.js').write_text('changed', encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'changed'): audit.run(root)

class ReleasePackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='palmoemu-release-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.web = self.root / 'web'
        self.staged = self.root / 'work/release/web'
        source = Path(__file__).resolve().parents[1]
        self.files = {
            'index.html': b'<title>PalmoEMU fixture</title>',
            'src/a.js': b'// lowercase fixture',
            'src/B.js': b'// uppercase fixture',
            'LICENSE': b'fixture license',
            'NOTICES.md': b'fixture attribution',
            'RELEASE_CONTENT.json': b'{"fixture":"reviewed inventory"}',
            'RELEASE_REVIEW.json': b'{"fixture":"reviewed content"}',
            'offline-manifest.js': b'// reviewed offline fixture',
        }
        for name, data in self.files.items():
            self.write(name, data)
        for name in ['prepare-release.py', 'package_source.py']:
            self.write('scripts/' + name, (source/'scripts'/name).read_bytes())
        for name in ['ci.yml', 'web-pages.yml', 'core-candidate.yml', 'upstream-watch.yml']:
            path = self.root / '.github/workflows' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'# workflow fixture: ' + name.encode())
        self.write('cores/example/core.wasm', b'core fixture, excluded from UI source')
        self.write('test-results/screenshot.png', b'local test output')
        self.write('web/test-results/nested.png', b'nested local test output')

    def write(self, name, data):
        path = self.web / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def run_script(self, script, *args, success=True):
        result = subprocess.run([sys.executable, '-B', '-X', 'utf8', str(script), *args],
                                capture_output=True, text=True, encoding='utf8')
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, 'The invalid release unexpectedly passed')
        return result

    def prepare(self):
        self.run_script(self.web/'scripts/prepare-release.py')
        self.run_script(self.staged/'scripts/package_source.py', '--check')
        return self.staged / 'sources/web-ui-source.zip'

    def test_fresh_checkout_generates_complete_source_without_changing_review(self):
        self.assertFalse((self.web/'sources/web-ui-source.zip').exists())
        archive = self.prepare()
        self.assertFalse((self.web/'sources/web-ui-source.zip').exists())
        with zipfile.ZipFile(archive) as z:
            names = z.namelist()
            for name, data in self.files.items():
                self.assertEqual(z.read(name), data)
                self.assertEqual((self.staged/name).read_bytes(), data)
                self.assertEqual((self.web/name).read_bytes(), data)
            for name in ['ci.yml', 'web-pages.yml', 'core-candidate.yml', 'upstream-watch.yml']:
                self.assertEqual(z.read('.github/workflows/' + name),
                                 (self.root/'.github/workflows'/name).read_bytes())
            source_names = [name for name in names if not name.startswith('.github/')]
            self.assertEqual(source_names, sorted(source_names), 'Case-sensitive POSIX ordering')
            self.assertFalse(any('test-results' in name or name.startswith('cores/') for name in names))
            self.assertNotIn('sources/web-ui-source.zip', names)
        self.assertFalse((self.staged/'test-results').exists())
        self.assertTrue((self.staged/'cores/example/core.wasm').exists())

    def test_local_archive_is_ignored_and_generated_archive_is_reproducible(self):
        self.write('sources/web-ui-source.zip', zip('private.sav', b'stale local fixture'))
        stale = (self.web/'sources/web-ui-source.zip').read_bytes()
        first = self.prepare().read_bytes()
        self.assertEqual((self.web/'sources/web-ui-source.zip').read_bytes(), stale)
        self.assertEqual(self.prepare().read_bytes(), first)
        with zipfile.ZipFile(io.BytesIO(first)) as z:
            self.assertNotIn('private.sav', z.namelist())

    def test_changed_source_and_tampered_archive_are_rejected(self):
        archive = self.prepare()
        original = archive.read_bytes()
        (self.staged/'src/a.js').write_bytes(b'// changed after generation')
        result = self.run_script(self.staged/'scripts/package_source.py', '--check', success=False)
        self.assertIn('Stale source zip member', result.stderr)
        self.prepare()
        archive.write_bytes(zip('unreviewed.js', b'// substituted archive'))
        result = self.run_script(self.staged/'scripts/package_source.py', '--check', success=False)
        self.assertIn('Source zip file list is stale', result.stderr)
        self.assertEqual(self.prepare().read_bytes(), original)


class BundledSkinRights(unittest.TestCase):
    def test_unreviewed_artwork_and_missing_notices_are_rejected(self):
        root = Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location('bundled', root/'scripts/check-bundled-skins.py')
        bundled = importlib.util.module_from_spec(spec); spec.loader.exec_module(bundled)
        manifest = json.loads((root/'BUNDLED_SKINS.json').read_text())
        with tempfile.TemporaryDirectory() as d:
            copy = Path(d)
            for name in ['BUNDLED_SKINS.json', *manifest['files']]:
                dest = copy/name; dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(root/name, dest)
            bundled.verify(copy)
            extra = copy/'assets/skins/unreviewed.png'; extra.write_bytes(b'unapproved fixture')
            with self.assertRaisesRegex(AssertionError, 'Unreviewed'): bundled.verify(copy)
            extra.unlink()
            image = next(copy.glob('assets/skins/manic/gb/*.png')); original = image.read_bytes()
            image.write_bytes(b'changed fixture')
            with self.assertRaisesRegex(AssertionError, 'Changed reviewed'): bundled.verify(copy)
            image.write_bytes(original)
            (copy/manifest['licenseFile']).unlink()
            with self.assertRaises(FileNotFoundError): bundled.verify(copy)

if __name__ == '__main__': unittest.main()
