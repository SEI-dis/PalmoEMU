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
The ClownMDEmu source also contains three minimal backports from
[Clownacy/clownmdemu](https://github.com/Clownacy/clownmdemu) (modified 2026-11-25):

- `e26b6d9623e070196fc7970e857d1571edf04994`: reject cartridge bank register 8
  in `common/core/source/bus-main-m68k.c` before it can overwrite the next field.
- `159d4440ecd9508e27e8a486b8c8f4b4f9e89e11`: use SRAM control bit 0, rather
  than any nonzero byte, in the same file.
- `5ed9e36d3bdcc0acbe464164dce7e861dbcd553c`: reject invalid FM channel slots
  before forming channel pointers in `common/core/source/fm.c`.

Other upstream files, pinned submodules, save/state structures and the Web bridge
are unchanged. These are selected fixes, not an update to the upstream tip.
To rebuild only this core, use `cmake --build /path/to/build --target md --parallel 6`.
FCEUmm's original GPL-2.0-or-later notice is retained; GPL-3.0 is selected for this build.
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
Use `node tests/clown-update.cjs` for SRAM mapping, bankswitch bounds and invalid
FM register checks. An optional second argument is the prior `core.js` path
(after an explicit candidate path); keep its matching `core.wasm` alongside it
to test previous save/state compatibility and reproduce the old bus defects.
`tests/fixtures/clown-fm.c` additionally exercises invalid FM channel 6 under
Emscripten `-fsanitize=undefined,bounds -fno-sanitize-recover=all`; link it with
`fm.c`, `fm-channel.c`, `fm-lfo.c`, `fm-operator.c`, `fm-phase.c` and `log.c`,
using the core's `source/` include directory and `-DCC_USE_C99_INTEGERS`.
This source-level sanitizer check is separate from the normal Node/WASM test.
Use tests/browser.cjs for browser input, rotation and state integration. Do not
substitute user ROMs into the source/deployment directories.
