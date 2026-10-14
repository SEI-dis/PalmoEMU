"""SPDX-License-Identifier: AGPL-3.0-or-later
Package editable Web UI sources without any user content or core binaries.
"""
from pathlib import Path
import sys, zipfile
root=Path(__file__).resolve().parent.parent
target=root/'sources/web-ui-source.zip'
def source_files():
    for file in sorted(root.rglob('*'), key=lambda p: p.relative_to(root).as_posix()):
        rel=file.relative_to(root)
        if any(part in {'node_modules','test-results','playwright-report','__pycache__','.git'} for part in rel.parts): continue
        if file.is_symlink(): raise ValueError('Symlink in source tree: '+str(rel))
        if not file.is_file() or rel.parts[0]=='cores': continue
        if rel.parts[0]=='sources' and rel.parts[1:2] not in [('mgba-web-port',),('libretro-web',),('nds-web',),('alternate-web',),('manicemu-ui',),('manic-skins',),('celio-web-transport',)]: continue
        if rel.parts[:3]==('vendor','emulatorjs','cores'): continue
        if file.suffix.lower() in ['.nds','.dsv','.gba','.gb','.gbc','.nes','.sfc','.smc','.smd','.gen','.bin','.sav','.srm','.state','.bios','.iso','.3ds','.3dsx','.cci','.cxi','.lp3sav','.cia','.chd','.deltaskin','.manicskin']: raise ValueError('User data in source tree: '+str(rel))
        yield file,rel.as_posix()
    workflow=root.parent/'.github/workflows/web-pages.yml'
    if not workflow.is_file(): workflow=root.parent/'deployment/web-pages.yml'
    if workflow.is_file(): yield workflow,'.github/workflows/web-pages.yml'
    workflow=root.parent/'.github/workflows/ci.yml'
    if workflow.is_file(): yield workflow,'.github/workflows/ci.yml'
    workflow=root.parent/'.github/workflows/core-candidate.yml'
    if workflow.is_file(): yield workflow,'.github/workflows/core-candidate.yml'

if __name__=='__main__':
    files=dict((name,file) for file,name in source_files())
    if '--check' in sys.argv:
        with zipfile.ZipFile(target) as src:
            assert set(src.namelist())==set(files),'Source zip file list is stale'
            for name,file in files.items(): assert src.read(name)==file.read_bytes(),'Stale source zip member: '+name
        print('PASS: source zip matches all current editable Web source files and workflow.')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as out:
            for name,file in files.items():
                info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0))
                info.create_system=3
                info.external_attr=0o100644<<16
                info.compress_type=zipfile.ZIP_DEFLATED
                out.writestr(info,file.read_bytes())
        print('Packaged Web UI source:',target.name)
