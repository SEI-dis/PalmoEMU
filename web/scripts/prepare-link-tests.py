"""SPDX-License-Identifier: AGPL-3.0-or-later
Prepare pinned, test-only Celio compatibility fixtures under ignored work/.
No ROMs, saves, or external game artwork are downloaded.
"""
from pathlib import Path
import hashlib, os, subprocess, tarfile, urllib.request

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / 'work' / 'celio-server'
MODERN = ROOT / 'work' / 'celio-server-modern'
REFERENCE = ROOT / 'work' / 'celio-reference'
REVISION = 'eb441dc2e4ddec951c70c413599ab2a0e77a739b'
FILES = {
    'mgba.js': 'f15e0fde3c66253ff3c0dc9d216710f5676dc90fdd13e5c8560a99e48d7ae810',
    'mgba.wasm': '3f5cb4f061b29ed7dedbc4dab4c94cc55a6353fe71980963f782cd17ea612c59',
    'link-session.js': '063e1a11aeee3ed43e5a3178f206920e8388c8c3c6a22f024daddc7980ad3d65',
}

for target in [SERVER, MODERN, REFERENCE]:
    if target.resolve() != target or not target.is_relative_to(ROOT / 'work'):
        raise ValueError('Fixture output must stay under workspace work/')
    target.mkdir(parents=True, exist_ok=True)
npm = ['node', os.environ['NPM_CLI']] if os.environ.get('NPM_CLI') else ['npm.cmd' if os.name == 'nt' else 'npm']
for target, name in [(SERVER, 'celio-server-source.tar.gz'), (MODERN, 'celio-server-modern-source.tar.gz')]:
    archive_path = ROOT / 'web/sources' / name
    if target == MODERN and hashlib.sha256(archive_path.read_bytes()).hexdigest() != '681b54f885ec5a67225e71cb4f48767f00d9d1ced406b3a6415a519e68a22ec7':
        raise ValueError('Pinned modern relay source hash mismatch')
    with tarfile.open(archive_path) as archive:
        archive.extractall(target, filter='data')
    build_root = target if target == SERVER else target / 'Celio-Server-8f509bdcf2a8383b936e0f2f31b2f6553ae421ce'
    subprocess.run([*npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=build_root, check=True)
    subprocess.run(['node', '--input-type=module', '-e', "import {buildSync} from 'esbuild'; buildSync({entryPoints:['src/client.ts','src/sessionManager.ts'],bundle:true,packages:'external',format:'esm',platform:'node',outdir:'test-built'});"], cwd=build_root, check=True)
for name, expected in FILES.items():
    target = REFERENCE / name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
        continue
    url = f'https://raw.githubusercontent.com/pm-start/mgba-celio-web/{REVISION}/{name}'
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(16 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('Pinned reference hash mismatch: ' + name)
    target.write_bytes(data)
print('CELIO_SERVER_ROOT=' + str(SERVER))
print('CELIO_REFERENCE_ROOT=' + str(REFERENCE))
