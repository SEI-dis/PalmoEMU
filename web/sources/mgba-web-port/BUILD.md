# mGBA Web core build

This is an MPL-2.0 C bridge derived from `pm-start/mgba-celio-web`
`de2c446e7369610f3ab402dd775e81d6a1661608`, compiled against
`pm-start/mGBA_celio_edition`
`0ba86121bd92aa570d38301086d8e8f584238d62` (`rom64`).
The core source is in `../mgba-celio-rom64-source.tar.gz`.
The original bridge source is in `../mgba-celio-web-source.tar.gz`.

Local build verified with Emscripten **4.0.15** (emscripten-releases compiler build
`b412b6307e541b93dd93f01b61181e15c17302ec`), CMake **3.31.6**, Ninja **1.11.1**.
No Qt, SDL, network client, system BIOS, scripting engine, or external assets
are built into the core. The standard Emscripten runtime and bundled mGBA
dependencies are used. See the upstream licenses in the source archives.

Extract the core source archive into a build directory outside the published
Web directory. Activate the pinned Emscripten SDK and put CMake/Ninja on PATH.
From this `mgba-web-port` directory, use the following (replace the paths):

```sh
emcmake cmake -S . -B /path/to/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DMGBA_SOURCE=/path/to/extracted/mgba
cmake --build /path/to/build --parallel 6
```

The output is `mgba.js` and `mgba.wasm`. Place both in `web/cores/mgba/`;
record their SHA-256 in `SOURCES.json`; run the core, browser, feature and link
tests; regenerate `offline-manifest.js` and the Web source zip.

Changes in this port: `link.h` exposes only the required SIO/timer/IRQ registers
and callbacks. `bridge.c` resets these callbacks on ROM close. All network
transport is in separately licensed JavaScript (`src/celio-device.js`, GPLv3,
and `src/room-link.js`, MPL-2.0). The bridge itself never sends data.

The shipped archive contains the Web compiler dependency closure, required build inputs, and upstream notices. Rebuilding this source subset produced identical JS/WASM hashes; see ../build-evidence.json. GUI artwork, fonts and test cartridges are not included.

To check a newer upstream revision without replacing this distribution, see
`../../CORE_UPDATES.md`. The compiler build hash above belongs to
`emscripten-releases`, not the emsdk installer Git repository. The candidate
recipe in `upstream.json` pins those two repositories separately.

## 2026-10-09 core update

The pinned rom64 revision supports 6 MiB flash (96 banks), 16 MiB extra RAM,
and shorter flash programming/erase timing. The bridge accepts up to 6 MiB
plus the 16-byte RTC footer and raises the state limit to 32 MiB so a state
can retain both extra RAM and flash. Old 1 MiB saves and baseline states are
covered by authored compatibility tests. The adapter preserves save storage
keys and accepts the verified previous state ID; it does not promise backward
compatibility when returning to the old core.

The Web bridge explicitly sets CPU overclock to 1, overriding the upstream
new default of 2. This preserves hardware timing and avoids doubling CPU work
on phones. The existing 1–5x play-speed control remains separate.
Qt automatic backup and physical USB link features are not compiled into this
Web target. Web saves retain up to five local backup generations and
five recovery snapshots, depending on their size. No upload endpoint is added.

## 2026-10-13 features

The default clock remains 1. options.h exposes optional 2/4/8 multipliers and local rotation/luminance input. link.h forces clock 1 during link play. bridge.c adds an opaque, tightly packed RGBA output without changing the raw framebuffer ABI, save format or state identifiers.
The source archive includes four MPL-2.0 optimization backports from pm-start/mgba-celio-web 23235bc6db1b67009808c0dc7e1f25131eb75e7a. Their original and modified hashes are in ../build-evidence.json. Rebuild the updated archive with this bridge, not the unmodified upstream archive; candidate upgrades must review conflicts with these backports. Independent extraction and rebuilding produced identical JS/WASM.
The Web storage layer separately retains up to ten 5-minute save generations in addition to up to five recent backups and five recovery snapshots. Each automatic history has a 96 MiB budget, so fewer generations may be kept; one indivisible large battery save is preserved even if it exceeds that budget. It does not change the native save ABI.

## 2026-10-13 0.3.22 RTC and game-rumble additions

`options.h` adds automatic wall-clock mode and a whole-second wall-clock offset
(at most plus or minus 315576000 seconds), stored through mGBA's existing RTC
metadata. It also registers the standard rumble integrator and exposes an
opt-in intensity poll for one explicitly selected browser gamepad. Existing
save/state layouts and state identifiers are unchanged.

The updated bridge and distributed source archive were built in two independent
source/build directories with the pinned toolchain. The JS/WASM hashes match;
see `../build-evidence.json`. RTC, short rumble pulses, pause/disconnect cleanup
and save/state round trips are covered by authored tests. Physical gamepad
vibration remains device-dependent and was not verified on hardware.

The archive version.cmake checks for its own .git entry before reading Git
metadata. An extracted archive previously picked up an unrelated parent app
repository revision, changing binary version strings between app commits.
The archive now reports its core version; native source checkouts retain their
own Git metadata. No emulator execution or save/state format is changed.

## 2026-10-13 0.3.24 GB/GBC local cable

`gb-link.h` connects two independent GB cores to the pinned upstream
`GBSIOLockstep` driver. Its cooperative cycle-accounting callbacks are adapted
from `src/platform/qt/MultiplayerController.cpp` at core commit
`0ba86121bd92aa570d38301086d8e8f584238d62`; Jeffrey Pfau's copyright and MPL-2.0
notice are retained. Both cores run on one browser thread in one WASM module.
ROM, cartridge RAM, state buffers, framebuffer and peripherals remain separate.
The existing single-core exports still select instance zero by default, and
the existing GBA Celio path still uses separate WASM instances. No threading,
shared-memory browser headers or network service is required.

The bridge adds instance selection, bounded cooperative frame execution,
attach/detach and transfer-busy queries. The browser pauses both CPUs before
detaching. GB serial has no universal game-session completion message, so the
UI requires explicit confirmation after both games finish their session and
save. The existing IndexedDB batch commits both separate save owners together;
cancellation restores the pre-link 1P state and retains the previous 2P save.
Native save/state layouts and `mgba-rom64-save6-v2` state compatibility remain
unchanged.

The distribution archive was independently extracted into a new source tree,
and a separate copy of this bridge was configured and built in a fresh CMake
directory with the pinned toolchain. Both JS and WASM match the normal build;
see `../build-evidence.json`. `tests/gb-link-core.cjs` uses authored SM83
cartridges to check both directions, changing internal-clock ownership, SIO
interrupts, normal/fast serial timing, CGB double-speed and mixed CPU speeds,
external-clock cancellation/reconnect, and independent save/state/RTC round
trips. Browser checks use authored cartridges and generated RAM for the two
player UI and atomic-save failures. No commercial game or physical cable
compatibility is claimed by these tests.
