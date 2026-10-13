"""SPDX-License-Identifier: AGPL-3.0-or-later
Repack the pinned upstream archive without two redundant workspace symlinks.
Usage: python scripts/prepare-acorn.py /path/to/downloaded-upstream.tar.gz
Input: https://codeload.github.com/acornjs/acorn/tar.gz/b63a4e15ce4ca3d4c85025f7e25cd83337198f78
Never extracts archive members or executes upstream code.
"""
from pathlib import Path, PurePosixPath
import gzip, hashlib, io, json, sys, tarfile

root = Path(__file__).resolve().parent.parent
meta = json.loads((root / 'scripts/i18n/vendor/acorn.json').read_text(encoding='utf8'))
data = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(data).hexdigest() == meta['originalArchiveSha256'], 'Unexpected upstream archive'
prefix = 'acorn-' + meta['annotatedTag'] + '/'
skip = {'acorn-loose/node_modules/acorn', 'acorn-walk/node_modules/acorn'}
removed = set()
buffer = io.BytesIO()
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as source:
    with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as output:
            for member in sorted(source, key=lambda entry: entry.name):
                if member.isdir():
                    continue
                assert member.name.startswith(prefix), 'Unexpected archive root'
                name = member.name[len(prefix):]
                assert not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
                if name in skip:
                    assert member.issym() and member.linkname == '../../acorn', 'Unexpected link target'
                    removed.add(name)
                    continue
                assert member.isfile(), 'Unexpected non-regular member'
                payload = source.extractfile(member).read()
                info = tarfile.TarInfo('acorn-8.15.0/' + name)
                info.mode, info.size = member.mode, len(payload)
                output.addfile(info, io.BytesIO(payload))
assert removed == skip, 'Unexpected workspace links'
(root / meta['archive']).write_bytes(buffer.getvalue())
print('Acorn source SHA-256:', hashlib.sha256(buffer.getvalue()).hexdigest())
