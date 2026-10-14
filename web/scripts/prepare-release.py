"""SPDX-License-Identifier: AGPL-3.0-or-later
Copy a clean publication tree and generate its corresponding Web source ZIP.
This never grants release approval or changes the content/review records.
"""
from pathlib import Path
import shutil, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / 'work' / 'release'
MARKER = '.local-play-release'
EXCLUDED = {'.git', 'node_modules', '__pycache__', 'test-results', 'playwright-report'}
SOURCE_ZIP = Path('web/sources/web-ui-source.zip')


def prepare():
    target = TARGET.resolve()
    if target != ROOT / 'work' / 'release' or not target.is_relative_to(ROOT):
        raise ValueError('Release output must be the workspace work/release directory')
    if target.exists():
        if not (target / MARKER).is_file():
            raise ValueError('Refusing to replace an unrecognized directory: ' + str(target))
        # Fixed, resolved workspace path checked above; never delete user work/.
        shutil.rmtree(target)
    target.mkdir(parents=True)
    (target / MARKER).write_text('Generated publication staging only.\n', encoding='utf8')
    for file in sorted((ROOT / 'web').rglob('*')):
        rel = file.relative_to(ROOT)
        if any(part in EXCLUDED for part in rel.parts):
            continue
        if file.is_symlink():
            raise ValueError('Symlink in publication input: ' + str(rel))
        # Never distribute a stale or locally substituted generated archive.
        if rel == SOURCE_ZIP:
            continue
        if file.is_file():
            dest = target / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, dest)
    # Source package verification must see exactly the workflow it was built with.
    for name in ('.github/workflows/ci.yml', '.github/workflows/web-pages.yml', '.github/workflows/core-candidate.yml', '.github/workflows/upstream-watch.yml', 'deployment/web-pages.yml'):
        file = ROOT / name
        if file.is_file():
            dest = target / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, dest)
    subprocess.run([sys.executable, '-B', '-X', 'utf8',
                    str(target / 'web/scripts/package_source.py')], check=True)
    print('Prepared clean release:', target / 'web')


if __name__ == '__main__':
    prepare()
