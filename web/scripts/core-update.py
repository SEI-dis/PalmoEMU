"""SPDX-License-Identifier: AGPL-3.0-or-later
Bounded mGBA adoption. Build runners have no write credentials; promotion only
accepts this explicit file set from a candidate tied to the original checkout.
"""
from pathlib import Path
import argparse, difflib, hashlib, importlib.util, json, os, re, subprocess, sys, zipfile

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'web'
FILES = {
    'web/cores/mgba/mgba.js', 'web/cores/mgba/mgba.wasm',
    'web/sources/mgba-celio-rom64-source.tar.gz', 'web/sources/mgba-update-review.json',
    'web/sources/build-evidence.json', 'web/SOURCES.json',
    'web/index.html', 'web/sw.js', 'web/offline-manifest.js',
    'web/RELEASE_CONTENT.json', 'web/RELEASE_REVIEW.json',
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    return json.loads(path.read_text(encoding='utf8'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

def run(args, **kwargs):
    return subprocess.check_output([str(x) for x in args], **kwargs)

def normalize(data):
    return data.replace(b'\r\n', b'\n')

def legal_lines(data):
    text = normalize(data).decode('utf8', errors='strict')
    return [line.strip() for line in text.splitlines() if re.search(
        r'copyright|SPDX|licen[cs]e|permission|redistribut|warranty|\bauthors?\b', line, re.I)]

def check_source_changes(previous, candidate):
    # New dependencies, build instructions and changed rights need a deliberate
    # review, not an automatically renewed generic "ready" flag.
    if set(previous) != set(candidate):
        raise ValueError('Source dependency inventory changed; manual review required: added=' +
                         ','.join(sorted(set(candidate) - set(previous))) + '; removed=' + ','.join(sorted(set(previous) - set(candidate))))
    changed = []
    for name, old in previous.items():
        new = candidate[name]
        if normalize(old) == normalize(new):
            continue
        if name.endswith(('.cmake', '.in')) or Path(name).name == 'CMakeLists.txt':
            raise ValueError('Build input changed: ' + name)
        if re.match(r'(?i)^(LICEN[SC]E|COPYING|COPYRIGHT|NOTICE|AUTHORS)', Path(name).name):
            raise ValueError('License/notice changed: ' + name)
        if 'third-party/' in name or not name.endswith(('.c', '.h', '.md', '.txt')):
            raise ValueError('Dependency or non-code input changed: ' + name)
        if legal_lines(old) != legal_lines(new):
            raise ValueError('Copyright/license header changed: ' + name)
        if name.endswith(('.c', '.h')):
            prefix = lambda data: re.match(rb'\s*(/\*.*?\*/)', normalize(data), re.S)
            a, b = prefix(old), prefix(new)
            if not a or not b or a[1] != b[1]:
                raise ValueError('Source header requires review: ' + name)
        changed.append(name)
    return changed

def apply_local_patches(repository, baseline, source, previous):
    patches = []
    for name, shipped in previous.items():
        original = run(['git', '-C', repository, 'show', baseline + ':' + name])
        if normalize(original) == normalize(shipped):
            continue
        # Derive the complete local delta from the pinned upstream, rather than
        # maintaining a second, potentially stale list of optimization patches.
        patch = ''.join(difflib.unified_diff(
            normalize(original).decode('utf8').splitlines(keepends=True),
            normalize(shipped).decode('utf8').splitlines(keepends=True),
            fromfile='a/' + name, tofile='b/' + name))
        target = source / name
        target.write_bytes(normalize(target.read_bytes()))
        run(['git', '-c', 'core.autocrlf=false', 'apply', '--check', '--whitespace=nowarn', '-'], cwd=source, input=patch.encode())
        run(['git', '-c', 'core.autocrlf=false', 'apply', '--whitespace=nowarn', '-'], cwd=source, input=patch.encode())
        patches.append({'file': name, 'patchSha256': sha(patch.encode())})
    return patches

def check_build_inputs(repository, baseline, commit):
    names = run(['git', '-C', repository, 'diff', '--name-only', baseline, commit]).decode().splitlines()
    blocked = [n for n in names if Path(n).name == 'CMakeLists.txt' or n.endswith(('.cmake', '.in')) or n == '.gitmodules']
    if blocked:
        raise ValueError('Upstream build inputs require review: ' + ', '.join(blocked))

def stage(candidate):
    report = read(candidate / 'report.json')
    if report['status'] != 'verified' or report['baselineCommit'] != read(WEB / 'SOURCES.json')['mgba']['sourceCommit']:
        raise ValueError('Candidate is not verified against the current core')
    if not report['checks'].get('license-policy') or not all(report['checks'].values()):
        raise ValueError('Candidate checks are incomplete')
    baseline = run(['git', '-C', ROOT, 'rev-parse', 'HEAD']).decode().strip()
    before = {name: sha((ROOT / name).read_bytes()) for name in FILES}
    package = candidate / 'candidate'
    for name in ('mgba.js', 'mgba.wasm'):
        data = (package / name).read_bytes()
        if sha(data) != report['binaries'][name]:
            raise ValueError('Candidate binary changed')
        (WEB / 'cores/mgba' / name).write_bytes(data)
    archive = (package / 'mgba-celio-rom64-source.tar.gz').read_bytes()
    if sha(archive) != report['sourceSha256']:
        raise ValueError('Candidate source changed')
    (WEB / 'sources/mgba-celio-rom64-source.tar.gz').write_bytes(archive)
    sources = read(WEB / 'SOURCES.json')
    sources['mgba']['sourceCommit'] = report['candidateCommit']
    sources['mgba']['automaticUpdate'] = {'policy': 'scripts/core-update.py', 'report': 'sources/mgba-update-review.json'}
    evidence = read(WEB / 'sources/build-evidence.json')
    evidence['mgbaCommit'] = report['candidateCommit']
    evidence['mgbaUpdatedOn'] = report['checkedOn']
    evidence['archives']['mgba-celio-rom64-source.tar.gz'] = report['sourceSha256']
    evidence['cores']['mgba'] = {ext: {'sha256': report['binaries']['mgba.' + ext], 'rebuildMatches': True} for ext in ('js', 'wasm')}
    evidence['automaticUpdate'] = {'report': 'mgba-update-review.json', 'localPatches': report['localPatches']}
    write(WEB / 'sources/build-evidence.json', evidence)
    report['adoption'] = {'baseCommit': baseline, 'automatic': True, 'policy': 'preserve-local-patches-and-compatible-saves-v1'}
    write(WEB / 'sources/mgba-update-review.json', report)
    for name in sources['files']:
        if 'web/' + name in FILES:
            sources['files'][name] = sha((WEB / name).read_bytes())
    write(WEB / 'SOURCES.json', sources)
    # No new UI strings or translation generation is allowed in scheduled jobs.
    subprocess.run(['node', WEB / 'scripts/sync-i18n.mjs', '--check'], check=True)
    subprocess.run(['node', WEB / 'scripts/build-offline.cjs'], check=True)
    subprocess.run([sys.executable, '-B', WEB / 'scripts/prepare-release.py'], check=True)
    staging = ROOT / 'work/release/web'
    subprocess.run([sys.executable, '-B', staging / 'scripts/audit-content.py', '--record'], check=True)
    (WEB / 'RELEASE_CONTENT.json').write_bytes((staging / 'RELEASE_CONTENT.json').read_bytes())
    review = read(WEB / 'RELEASE_REVIEW.json')
    if review['status'] != 'ready' or review['openItems']:
        raise ValueError('An existing release blocker must not be cleared automatically')
    review['reviewedContentSha256'] = sha((WEB / 'RELEASE_CONTENT.json').read_bytes())
    review['coreUpdate'] = {'report': 'sources/mgba-update-review.json', 'sha256': sha((WEB / 'sources/mgba-update-review.json').read_bytes()),
                            'policy': 'unchanged-notices-dependencies-and-save-ABI; local patches retained; full CI required before main'}
    for resolution in review['resolutions']:
        if 'web/' + resolution['evidenceFile'] in FILES:
            resolution['sha256'] = sha((WEB / resolution['evidenceFile']).read_bytes())
    write(WEB / 'RELEASE_REVIEW.json', review)
    subprocess.run([sys.executable, '-B', WEB / 'scripts/prepare-release.py'], check=True)
    subprocess.run(['node', staging / 'scripts/check-release.cjs'], check=True)
    bundle = candidate / 'update.zip'
    manifest = {'schema': 1, 'baseCommit': baseline, 'upstreamCommit': report['candidateCommit'], 'files': {}}
    with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as output:
        for name in sorted(FILES):
            data = (ROOT / name).read_bytes()
            manifest['files'][name] = {'before': before[name], 'after': sha(data)}
            output.writestr(name, data)
        output.writestr('manifest.json', json.dumps(manifest))
    print('Verified update bundle:', bundle)
    return bundle

def apply(bundle, expected_base, expected_upstream):
    if run(['git', '-C', ROOT, 'rev-parse', 'HEAD']).decode().strip() != expected_base:
        raise ValueError('Checkout changed while building the candidate')
    with zipfile.ZipFile(bundle) as archive:
        if len(archive.namelist()) != len(FILES) + 1 or set(archive.namelist()) != FILES | {'manifest.json'}:
            raise ValueError('Unexpected update file list')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest['schema'] != 1 or manifest['baseCommit'] != expected_base or manifest['upstreamCommit'] != expected_upstream or set(manifest['files']) != FILES:
            raise ValueError('Candidate identity mismatch')
        data = {}
        for item in archive.infolist():
            if item.file_size > 100 * 1024 * 1024 or item.flag_bits & 1 or ((item.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError('Invalid candidate archive entry')
        for name in FILES:
            data[name] = archive.read(name)
            if sha((ROOT / name).read_bytes()) != manifest['files'][name]['before'] or sha(data[name]) != manifest['files'][name]['after']:
                raise ValueError('Candidate or baseline bytes changed: ' + name)
        # These executable application files may only change their generated build ID.
        for name, expression in [('web/index.html', rb'(<meta name="app-build" content=")[a-f0-9]{16}(">)'),
                                 ('web/sw.js', rb'(// App build: )[a-f0-9]{16}')]:
            redact = lambda b: re.sub(expression, rb'\1BUILD', b)
            if redact(data[name]) != redact((ROOT / name).read_bytes()):
                raise ValueError('Unexpected application change: ' + name)
        for name, content in data.items():
            (ROOT / name).write_bytes(content)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    s = sub.add_parser('stage'); s.add_argument('candidate', type=Path)
    a = sub.add_parser('apply'); a.add_argument('bundle', type=Path); a.add_argument('--base', required=True); a.add_argument('--upstream', required=True)
    args = parser.parse_args()
    if args.command == 'stage': stage(args.candidate)
    else: apply(args.bundle, args.base, args.upstream)

if __name__ == '__main__':
    main()
