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

The Web bridge starts at CPU overclock 1. Since 0.3.30 the browser's automatic
CPU setting selects the upstream default of 2 for the extended-cartridge
signature, and keeps ordinary cartridges at 1. Explicit settings are preserved.
The existing 1–5x play-speed control remains separate.
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

## 2026-10-14 settled battery-save notifications

`save-watch.h` observes the existing native `savedataUpdated` callback and
exposes a small per-core revision and pending-write query. A new cartridge
without a save VFile uses mGBA's unchanged `mSavedataClean` helper at frame end
so it has the same 15-frame quiet threshold as an imported memory-backed save.
The observer does not clone cartridge RAM, write files or send data. Pending
flash/EEPROM commands and settling timers prevent the browser's completion
path from capturing an in-progress hardware write.

Import, reset and state restoration establish a new observer baseline without
changing save bytes, native state layouts or compatibility identifiers. The
browser additionally waits for a quiet interval, bounds save frequency and
retries, and rechecks the generation after awaiting save-session fencing.
Ordinary two-minute saving remains available for other cores. Recovery-state
timing remains independent from frequent battery saves. A settled hardware
write is not a universal game-level "save completed" transaction marker.

The bridge was built twice from separately extracted copies of the pinned
distribution archive and separate bridge/build directories with Emscripten
4.0.15, CMake 3.31.6 and Ninja 1.11.1; both JS/WASM hashes match. Authored GB,
GBC and GBA programs cover continuously changing RAM, quiet notifications,
6 MiB flash, initial/imported saves, state/reset suppression, independent
instances and compatibility with the previous distributed core.

## 2026-10-14 native logging policy (0.3.30)

`logging.h` installs a native logger before loading a cartridge. The reference
Web bridge at `pm-start/mgba-celio-web` commit
`23235bc6db1b67009808c0dc7e1f25131eb75e7a` already uses a quiet native logger.
Without one, mGBA's fallback prints BIOS/DMA traces inside frame execution.
This port suppresses debug/info/stub/game-error traces before formatting or
crossing into JavaScript. It retains the first eight engine warning/error
messages per load and all fatal messages. It does not change emulated timing,
save data, state layouts, identifiers, the pinned source archive or link code.

The bridge was rebuilt from two independent extractions/build directories;
both JS/WASM hashes match. `tests/mgba-logging.cjs` uses an authored scanline
BIOS program to reproduce excessive logging on the previous core and verifies
bounded output, rendering, reset/state restoration and a second GB instance.
Save-completion, previous-state/save compatibility, peripherals and GB cable
tests also pass. See `../build-evidence.json` for outputs and source hashes.

## 2026-10-15 ROM allocation ownership (0.3.30)

`web_load_owned` consumes a malloc-owned input on both success and failure.
The memory-backed VFile borrows it; `web_close` frees it after core teardown.
The existing `web_load` copying ABI remains available. The browser uses the
compiled `web_gba_save_capacity` before applying its existing structurally
verified temporary correction, then transfers the allocation once. Caller
bytes, stored ROM identity, battery/state layouts and link drivers are unchanged.

With an authored 64 MiB GBA cartridge, WASM heap capacity after load falls from
155.875 MiB to 98.25 MiB. This is linear-memory capacity, not total browser
resident memory or an iPhone measurement. The heap need not shrink on close;
the browser adapter drops module references so an expired adapter cannot retain
that heap. `tests/mgba-memory.cjs` checks output parity with the copying ABI and
repeated invalid/valid loads without allocation accumulation. Structural-probe,
old/new state, 6 MiB save and GB local-link tests cover the transfer path too.
Both separately extracted native builds match; see `../build-evidence.json`.

### Startup allocation failure audit (2026-10-15)

The pinned GBA initializer can report success without its 16 MiB extended RAM.
The bridge checks mandatory GBA work/extended/video RAM and the audio buffer
before loading or executing a cartridge. Failure destroys the partial core,
closes the borrowed VFile and frees the transferred ROM. `web_load_owned`
returns -1 for these allocation failures (including VFile allocation), 0 for
rejected data and 1 for success. The legacy copying export retains its 0/1 ABI.

`tests/mgba-allocation.cjs` refuses heap growth during initialization of an
authored 64 MiB cartridge. It checks three failed loads, no execution after
failure, cleanup, and a successful retry with matching rendering when growth
is allowed again. This tests the extended-RAM failure path, not every native
allocation. Smaller unchecked allocations in the pinned core remain outside
this guard; no claim of comprehensive out-of-memory recovery is made.
