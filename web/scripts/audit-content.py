"""SPDX-License-Identifier: AGPL-3.0-or-later
Inspect release files and nested archives without extracting them.
--record pins the inspected bytes, NOT permission to redistribute them.
Default checks that pin, including unregistered files. Standard library only.
"""
from pathlib import Path, PurePosixPath
import hashlib, io, json, re, sys, tarfile, zipfile

ROOT = Path(__file__).resolve().parent.parent
PIN = 'RELEASE_CONTENT.json'
GENERATED = {PIN, 'offline-manifest.js', 'sources/web-ui-source.zip', 'RELEASE_REVIEW.json'}
FORBIDDEN = {'.pks', '.gba', '.gb', '.gbc', '.nes', '.sfc', '.smc', '.smd', '.gen', '.bin', '.sav', '.srm', '.jgsav', '.state', '.ss0', '.ss1', '.ss2', '.ss3', '.dsv', '.nds', '.cia', '.ipa', '.bios', '.3ds', '.3dsx', '.cci', '.cxi', '.lp3sav', '.iso', '.chd', '.z64', '.v64', '.n64', '.deltaskin', '.manicskin'}
SECRET = re.compile(rb'gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')
MAX_FILE = 100 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024

def sha(data): return hashlib.sha256(data).hexdigest()

def check_name(name):
    p = PurePosixPath(name)
    if not name or '\\' in name or ':' in name or p.is_absolute() or '..' in p.parts:
        raise ValueError('Unsafe archive path: ' + name)

def component(path):
    if path.startswith('vendor/start-save-format/'): return 'pokemonstart-bundled-format-tool-permission-recorded-license-unspecified'
    if path.startswith('vendor/start-save-migrate/') or path.startswith('scripts/start-save-migrate/base/') or path == 'scripts/start-save-migrate/patches.json': return 'start-save-migrate-user-supplied-license-unspecified'
    if path.startswith('vendor/rom-patcher/'): return 'rompatcher-mit'
    if path.startswith('shaders/'): return 'xbrz-gpl-3.0-with-permissive-notices'
    if path == 'src/rendering/gpu-filter.js': return 'celio-screen-effects-mpl-2.0'
    if path == 'src/rendering/pixel-transfer.js': return 'celio-pixel-transfer-mpl-2.0'
    if path.startswith(('scripts/i18n/vendor/', 'sources/acorn')): return 'acorn-mit-development-tool'
    if path.startswith(('sources/alternate','sources/jgenesis','cores/jgenesis/','cores/melonds/','cores/vba-next/')): return 'source-built-alternate-cores'
    if path.startswith(('assets/skins/manic/', 'sources/manic-skins/')): return 'manic-standard-skins-cc-by-4.0'
    if path.startswith('assets/') or path.startswith('sources/skins/'): return 'original-web-artwork'
    if path.startswith('cores/mgba/') or path.startswith('sources/mgba'): return 'mgba-and-web-bridge'
    if path.startswith('vendor/emulatorjs/cores/') or re.match(r'sources/(retroarch|fceumm|snes9x|genesis_plus_gx|ejs-build)', path): return 'retired-core-path-requires-review'
    if path.startswith(('sources/nds','sources/desmume2015','cores/nds/')): return 'source-built-nds-core'
    if path.startswith('sources/libretro') or path.startswith(('cores/nes/','cores/snes/','cores/md/')): return 'source-built-libretro-cores'
    if path.startswith('vendor/pdfjs/') or path.startswith('sources/pdfjs'): return 'pdfjs-apache-2.0'
    if path.startswith('vendor/emulatorjs/'): return 'emulatorjs-modified-ui'
    if path.startswith('sources/celio-web-transport') or path in {'src/link/room-link.js', 'src/link/direct-link.js', 'src/link/celio-serial.js'}: return 'celio-web-transport-mpl-2.0'
    if path.startswith('sources/celio') or path == 'src/link/celio-device.js': return 'celio-gpl-source'
    if path.startswith('licenses/'): return 'retained-license-notices'
    return 'web-port-code-and-documentation'

class Scanner:
    def __init__(self):
        self.rows, self.total, self.archives = [], 0, 0

    def inspect(self, path, data, depth=0):
        if depth > 6 or len(data) >= MAX_FILE: raise ValueError('Archive/file limit: ' + path)
        self.total += len(data)
        if self.total > MAX_TOTAL: raise ValueError('Expanded release exceeds audit limit')
        suffix = PurePosixPath(path).suffix.lower()
        basename = PurePosixPath(path.split('!')[-1]).name.lower()
        if basename == '.env' or (basename.startswith('.env.') and basename != '.env.example') or basename in {'hosts.yml', 'credentials.json'} or SECRET.search(data):
            raise ValueError('Credential candidate: ' + path)
        if suffix in FORBIDDEN or re.search(r'\.ss\d+$', path, re.I):
            raise ValueError('ROM/save/binary candidate: ' + path)
        if data[:4] == b'NES\x1a' or data[256:260] == b'SEGA' or data[0x104:0x10a] == bytes.fromhex('ceed6666cc0d') or data[4:12] == bytes.fromhex('24ffae51699aa221') or data[0xc0:0xc8] == bytes.fromhex('24ffae51699aa221'):
            raise ValueError('ROM signature: ' + path)
        self.rows.append({'path': path, 'bytes': len(data), 'sha256': sha(data), 'component': component(path.split('!', 1)[0])})
        stream = io.BytesIO(data)
        if data[:4] in (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'):
            self.archives += 1
            with zipfile.ZipFile(stream) as z:
                seen = set()
                for m in z.infolist():
                    check_name(m.filename)
                    if m.filename in seen: raise ValueError('Duplicate ZIP entry: ' + path)
                    seen.add(m.filename)
                    if m.flag_bits & 1 or ((m.external_attr >> 16) & 0o170000) == 0o120000: raise ValueError('Encrypted ZIP or symlink: ' + path)
                    if m.file_size >= MAX_FILE: raise ValueError('Expanded ZIP entry too large')
                    if not m.is_dir(): self.inspect(path + '!' + m.filename, z.read(m), depth + 1)
        elif data[:2] == b'\x1f\x8b' or data[257:262] == b'ustar':
            self.archives += 1
            stream.seek(0)
            with tarfile.open(fileobj=stream, mode='r:*') as t:
                seen = set()
                for m in t:
                    check_name(m.name)
                    if m.name in seen: raise ValueError('Duplicate TAR entry: ' + path)
                    seen.add(m.name)
                    if m.isdir(): continue
                    if not m.isfile(): raise ValueError('Non-regular TAR entry: ' + path + '!' + m.name)
                    if m.size >= MAX_FILE: raise ValueError('Expanded TAR entry too large')
                    self.inspect(path + '!' + m.name, t.extractfile(m).read(), depth + 1)
        elif data[:6] == b'7z\xbc\xaf\x27\x1c' or data[:4] == b'Rar!' or suffix in {'.zip', '.manicskin', '.tar', '.gz', '.7z', '.rar', '.data'}:
            raise ValueError('Unsupported or malformed archive: ' + path)

def run(root=ROOT, record=False):
    scanner = Scanner()
    # Path ordering differs between Windows and POSIX (notably case folding).
    # Pin a portable, case-sensitive relative POSIX order on every platform.
    for file in sorted(root.rglob('*'), key=lambda p: p.relative_to(root).as_posix()):
        rel = file.relative_to(root).as_posix()
        if file.is_symlink(): raise ValueError('Symlink in release: ' + rel)
        if any(p in {'.git', 'node_modules', '__pycache__', 'test-results', 'playwright-report'} for p in file.relative_to(root).parts): raise ValueError('Non-release directory: ' + rel)
        if file.is_file() and rel not in GENERATED: scanner.inspect(rel, file.read_bytes())
    inventory = {'schema': 1, 'purpose': 'Exact content inventory; does not certify copyright or license compliance.', 'archiveCount': scanner.archives, 'files': scanner.rows}
    target = root / PIN
    if record:
        target.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print('RECORDED content only; legal review remains separate.')
    elif json.loads(target.read_text(encoding='utf8')) != inventory:
        raise ValueError('Release content changed or unregistered file found. Re-inspect before updating RELEASE_CONTENT.json.')
    # Scan generated artifacts as well, without creating a self-referential pin.
    for rel in ('offline-manifest.js', 'sources/web-ui-source.zip'):
        p = root / rel
        if p.exists(): scanner.inspect(rel, p.read_bytes())
        elif not record: raise ValueError('Missing generated artifact: ' + rel)
    print(f'PASS: {len(scanner.rows)} file/archive entries, {scanner.archives} archives inspected; no prohibited ROM/save files detected.')

if __name__ == '__main__':
    run(record='--record' in sys.argv)
