"""SPDX-License-Identifier: AGPL-3.0-or-later
Exercise source policy, local optimization preservation and fail-closed bundles.
"""
from pathlib import Path
import importlib.util, json, subprocess, tempfile, unittest, zipfile

spec = importlib.util.spec_from_file_location('core_update', Path(__file__).resolve().parents[1] / 'scripts/core-update.py')
update = importlib.util.module_from_spec(spec); spec.loader.exec_module(update)

class CoreUpdate(unittest.TestCase):
    def test_policy(self):
        original = b'/* Copyright 2026 Test; MPL-2.0 license. */\nint f() { return 1; }\n'
        changed = original.replace(b'return 1', b'return 2')
        self.assertEqual(update.check_source_changes({'src/f.c': original}, {'src/f.c': changed}), ['src/f.c'])
        self.assertEqual(update.check_source_changes({'src/f.c': original}, {'src/f.c': original.replace(b'\n', b'\r\n')}), [])
        for name, old, new in [('src/f.c', original, changed.replace(b'MPL-2.0', b'All rights reserved')),
                                ('LICENSE', b'old', b'new'), ('CMakeLists.txt', b'old', b'new'),
                                ('src/third-party/a.c', original, changed), ('a.cmake', b'old', b'new')]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                update.check_source_changes({name: old}, {name: new})
        with self.assertRaises(ValueError): update.check_source_changes({'a.c': original}, {})
        with self.assertRaises(ValueError): update.check_source_changes({}, {'new.c': original})

    def test_local_patches(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); repo = root / 'repo'; repo.mkdir()
            def git(*args): return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL).decode().strip()
            git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
            (repo / 'file.c').write_text('/* license */\nint f() { return 1; }\n', encoding='utf8')
            git('add', '.'); git('commit', '-qm', 'base'); base = git('rev-parse', 'HEAD')
            source = root / 'source'; source.mkdir()
            (source / 'file.c').write_bytes(b'/* license */\r\nint f() { return 1; }\r\n')
            local = {'file.c': b'/* license */\nint f() { return 2; }\n'}
            patches = update.apply_local_patches(repo, base, source, local)
            self.assertEqual(len(patches), 1); self.assertEqual((source / 'file.c').read_bytes(), local['file.c'])
            (source / 'file.c').write_bytes(b'/* license */\nint completely_different() { return 9; }\n')
            with self.assertRaises(subprocess.CalledProcessError): update.apply_local_patches(repo, base, source, local)
            (repo / 'CMakeLists.txt').write_text('new build command\n'); git('add', '.'); git('commit', '-qm', 'build')
            with self.assertRaises(ValueError): update.check_build_inputs(repo, base, git('rev-parse', 'HEAD'))

    def test_bundle_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); original_root = update.ROOT; update.ROOT = root
            try:
                def git(*args): return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.DEVNULL).decode().strip()
                git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
                for name in update.FILES:
                    target = root / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(b'baseline')
                git('add', '.'); git('commit', '-qm', 'base'); base = git('rev-parse', 'HEAD'); upstream = 'a' * 40
                def bundle(**overrides):
                    target = root / 'update.zip'; contents = {name: b'baseline' for name in update.FILES}; contents.update(overrides)
                    manifest = {'schema': 1, 'baseCommit': base, 'upstreamCommit': upstream,
                                'files': {name: {'before': update.sha(b'baseline'), 'after': update.sha(data)} for name, data in contents.items()}}
                    with zipfile.ZipFile(target, 'w') as out:
                        for name, data in contents.items(): out.writestr(name, data)
                        out.writestr('manifest.json', json.dumps(manifest))
                    return target
                with self.assertRaises(ValueError): update.apply(bundle(**{'../outside': b'bad'}), base, upstream)
                with self.assertRaises(ValueError): update.apply(bundle(), 'b' * 40, upstream)
                with self.assertRaises(ValueError): update.apply(bundle(**{'web/index.html': b'<script>unexpected()</script>'}), base, upstream)
                update.apply(bundle(), base, upstream)
                (root / 'web/SOURCES.json').write_bytes(b'concurrent edit')
                with self.assertRaises(ValueError): update.apply(bundle(), base, upstream)
                self.assertEqual((root / 'web/SOURCES.json').read_bytes(), b'concurrent edit')
            finally: update.ROOT = original_root

if __name__ == '__main__': unittest.main()
