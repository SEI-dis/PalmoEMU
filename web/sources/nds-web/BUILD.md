# Nintendo DS browser core

Upstream: https://github.com/libretro/desmume2015
Revision: `422b688009ccb9f2917c086a8fe79c8cecb030ae`.
DeSmuME source files grant GPL-2.0-or-later; this combined build selects GPL-3.0.
Retained permissive libretro/libfat and other notices remain in the source files.
The original Web bridge and battery adapter are AGPL-3.0-or-later; the combined
work follows GPLv3/AGPLv3 section 13. No native frontend or game/BIOS files ship.

Extract `../desmume2015-source.tar.gz` outside the published directory. The archive
contains the compiler dependency closure plus the original make list and notices.
Upstream source files are unmodified. Activate Emscripten **4.0.15** (SDK build
`b412b6307e541b93dd93f01b61181e15c17302ec`), CMake **3.31.6**, Ninja **1.11.1**.

```sh
emcmake cmake -S /path/to/web/sources/nds-web -B /path/to/build-nds -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DNDS_ROOT=/path/to/desmume2015/desmume
cmake --build /path/to/build-nds --parallel 6
```

On Windows, use `emsdk_env.bat` before the commands, or set `EMSDK_PYTHON` to the
SDK Python and supply `-DCMAKE_TOOLCHAIN_FILE=<emsdk>/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`
and `-DCMAKE_MAKE_PROGRAM=<ninja.exe>` directly to CMake. Paths are local build
inputs; they are not required at runtime.

Copy `core.js` and `core.wasm` to `cores/nds/`. `nds-build-evidence.json` records
the source archive and the second build from its extracted contents.

## Web bridge (modified 2026-10-09 and 2026-10-13)

`bridge.c` adapts the existing libretro bridge: native 256×192 screens stacked
in a 256×384 framebuffer, absolute touch coordinates, 1 CPU core, interpreter,
software rasterizer, Japanese firmware language by default, no JIT/SIMD/pthreads/COOP/COEP.
The core uses its HLE BIOS and generated firmware; no external BIOS is required
for the direct boot path. Default frameskip 1 limits rendered frames to about
30fps while logic/audio keep DS timing. The app can disable it for full rendering.
The browser adapter splits the output into two canvases and lays them out without
changing the core's coordinate system. No duplicate presentation of skipped frames.

`battery.cpp` exports/imports raw cartridge saves via the core's BackupDevice
API, since this version does not expose battery memory through libretro. Files
exist only in the per-instance in-memory filesystem; durable data is saved by
the app's existing IndexedDB protection, locks and retained generations.
Unsupported save lengths are rejected before import. States use the core's
12MiB serialization format and a separate compatibility identifier.
Disabled cheats are not submitted, and the 1024-byte upstream cheat buffer is
protected by the JS adapter and C bridge length checks.

## DS operations and firmware language (2026-10-13 implementation)

`web_set_language(-1..5)` chooses the generated firmware language before
`web_load`/`retro_init`: -1 retains this port's Japanese default, and 0..5 are
Japanese, English, French, German, Italian and Spanish. Calls after initialization
are refused without modifying the running game. The Web setting therefore applies
after exiting and reopening a game, not by resetting the current session. Existing
states may restore the firmware state that they captured.

`web_blow(1)` drives the DeSmuME 2015 libretro L3 microphone input with
`desmume_mic_mode=internal` and `desmume_mic_force_enable=disabled`. The Web adapter
limits each action to five seconds and clears it on pause, reset, state load and
close. The bridge also clears its injected input on reset, state load and close.
It does not record device audio, request microphone permission or send audio.
The pinned core sources are unchanged and save/state layouts are unchanged.

The five-second interaction follows ManicEMU's
[simBlowing](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/ManicEmu/ManicEmu/Sources/Business/Play/VIewControllers/PlayViewController.swift#L3481).
The exact input and option names follow this distribution's DeSmuME 2015
`src/libretro/libretro.cpp`, not ManicEMU's newer DeSmuME settings. Both new exports
are detected by the JS adapter so an older cached core remains usable without the
new controls. An independent archive rebuild matches both distributed JS/WASM.
Authored ARM9/ARM7 programs verify all six firmware languages, microphone SPI
samples during simulated blowing, stop/reset/state cleanup and battery/state
round trips. Old/new distributed cores also accept each other's states. Browser
menu tests pass on Chromium and desktop WebKit; see RELEASE_VALIDATION.md.

## Validation and limits

`node tests/nds-core.cjs` executes an original ARM9/ARM7 test cartridge generated
in JavaScript. `node tests/nds-browser.cjs` tests real dual-screen output, A input,
stylus press/release, rotation/screen swapping, filter and power settings, states,
battery import/export/restart and same-origin requests. Set `BROWSER_ENGINE=webkit`
to exercise desktop WebKit; this is not an iPhone hardware performance test.

Commercial game compatibility and iPhone frame rate/temperature are unverified.
DSi, Wi-Fi multiplayer, external dual-screen skins and physical microphone input
are not implemented. Large ROMs can exceed a mobile browser's available memory.
