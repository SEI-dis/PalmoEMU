# Source-built browser cores

Pinned source revisions are in ../../SOURCES.json. Extract ../libretro-cores-source.tar.gz
outside the published web/ directory. The result is libretro-cores/{fceumm,mesen-s,clownmdemu}.
This port uses the standard libretro interface, not the RetroArch executable/frontend.
The Mesen-S source retains GPL filter code adapted by upstream from RetroArch.

Activate unmodified Emscripten **4.0.15**, emscripten-releases compiler build
b412b6307e541b93dd93f01b61181e15c17302ec; add CMake **3.31.6** and Ninja **1.11.1** to PATH.

```sh
emcmake cmake -S /path/to/web/sources/libretro-web -B /path/to/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCORE_ROOT=/path/to/libretro-cores
cmake --build /path/to/build --parallel 6
```

Copy nes.js/nes.wasm to cores/nes/core.js/core.wasm, and likewise snes and md.
This is the complete custom bridge and build configuration. Upstream C/C++ files
are unchanged except the documented Mapper 176 backport in fceumm/src/boards/fk23c.c
from b6870c3e146105b646e5d3505fcddf34ebaa9603 (modified 2026-10-12).
The original GPL-2.0-or-later notice is retained; GPL-3.0 is selected for this build.
The serialized state fields and Web bridge are unchanged. Only Web-required source/build inputs and notices are distributed;
unbuilt UI art, fonts and ROM fixtures are excluded. The selected subset rebuilt
to identical JS/WASM SHA-256 values; ../build-evidence.json records these.
Emscripten-generated runtime licenses, libc++/libc++abi/unwind, musl, LLVM and
source-level dependency notices are in ../../licenses/.

FCEUmm is used under GPL-3.0 pursuant to its GPL-2.0-or-later grant. Mesen-S is
GPL-3.0-or-later; its LGPL-2.1-or-later parts are combined under GPL-3.0 as permitted
by LGPL section 3. ClownMDEmu is AGPL-3.0. The custom bridge is AGPL-3.0-or-later.
GPLv3/AGPLv3 section 13 governs the combined build; upstream license notices remain.
Full preferred-form sources and this recipe allow rebuilding with modified libraries.
No noncommercial-only Snes9x/Genesis Plus GX core or unidentified prebuilt is used.

Use node tests/core-container.cjs for original synthetic cartridge/state tests.
Use tests/browser.cjs for browser input, rotation and state integration. Do not
substitute user ROMs into the source/deployment directories.
