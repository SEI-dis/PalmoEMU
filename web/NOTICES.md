# Copyright, credits and modification notices

This is an unofficial Web port of ManicEMU, not a release endorsed by its authors.

Current bundled-artwork exception: seven ManicEMU standard skins under CC BY 4.0,
with separate attribution below and in sources/manic-skins/README.md. Earlier
entries describing no third-party skins refer to the distribution at that change.

Modified 2026-10-09: removed native file-picker extension filters for ROMs,
controller skins and saves because iOS file providers may disable supported
custom extensions. Format and size checks remain local; skin/save extensions
are checked before reading their contents. No upload or network API was added.

Modified 2026-10-09: added an original non-modal GBA communication panel, draggable
placement, a gameplay Wi-Fi shortcut and a copy button inside the room-number field.
The communication transport and its upstream attribution are unchanged.

Modified 2026-10-09: added native-style per-game core selection and isolated
save/state/recovery namespaces. Default core data remains at the original keys.
VBA-Next (GPL-2.0-or-later, GPL-3.0 selected), melonDS (GPL-3.0-or-later;
BSD-2-Clause FreeBIOS), and jgenesis (GPL-3.0) were built from pinned sources.
The additional Web adapters are AGPL-3.0-or-later. Full source, dependency
notices, modified files and build instructions accompany the WASM files.
jgenesis gained immediate battery/RTC flush APIs; its unused 32X boot firmware
references were replaced with zero-filled placeholders, and the Web wrapper
exposes only standalone Genesis hardware. No 32X firmware binary is distributed.
See sources/alternate-web/BUILD.md, licenses/Alternate-C-file-notices.txt,
licenses/jgenesis-dependency-notices.txt and licenses/RUST-COPYRIGHT-library.html.
Also suppressed browser long-press callouts, selection and image dragging on
controls while preserving native editing and copy/paste in text fields.
Layout editing now follows FlexSkinSettingViewController / FlexItemView's screen
and button modes, drag/pinch and corner resizing (Daiuno, © 2025–2026 Manic EMU).
Web adaptations include size sliders, aspect-ratio limits, keyboard controls and
separate draft/save/cancel behavior. Unmodified Swift references are retained.
The Web UI and modifications are AGPL-3.0-or-later, without warranty. Recipients
may use, modify and redistribute under that license. See LICENSE and licenses.html.

ManicEMU: https://github.com/Manic-EMU/ManicEMU at
fbaeab79c214d5920bb51afa6f2d786fb2b12a58.
HomeTabBar.swift: Aoshuang Lee, Copyright © 2024 Manic EMU.
GamesNavigationView.swift / GameCollectionViewCell.swift: Max, Copyright © 2025 Manic EMU.
Constants.swift: Copyright © 2024 Manic EMU.
SettingsListView.swift / SettingItem.swift: Daiuno, Copyright © 2025 Manic EMU.
SaveStateListView.swift / GameOptionsView.swift / GameOption.swift / GameOptionPerform.swift:
Daiuno, Copyright © 2026 Manic EMU. Individual original headers remain in sources/manicemu-ui.
ASListPage.swift / ASListItemView.swift / ASNavigationView.swift:
Daiuno, Copyright © 2026 Manic EMU. Unmodified reference sources are included.
The retained “All rights reserved” wording does not negate the accompanying AGPL grant.

Modified 2026-10-08: ported library/navigation and grouped settings/game/state menus
to HTML/CSS/JavaScript; implemented browser storage, WASM adapters, offline caching,
append-only manual states, local backup/recovery, focus/visibility pause and resume,
cheats, input and scaling. Artwork in assets/ and the built-in controller skins
(src/skin-art.js, src/skin-drawing.js and src/nds-skin.js) is newly authored for
this port, under AGPL-3.0-or-later. It contains
no bundled upstream controller images, game logos, game images, or downloaded fonts.
Icon paths in shared.js are source-authored geometric shapes, not Apple SF Symbols.

Modified 2026-10-09: added original system-specific GB/GBC, GBA, FC, SFC and MD
controller skins, alongside the NDS dual-screen skin. Added a system-default
palette while preserving the four existing color choices and local preferences.
Split profiles, responsive layout geometry and shared SVG drawing into separate
modules. No commercial controller/game artwork or new dependencies are included.

Modified 2026-10-08: built-in skins compare bottom and side control layouts using
the available safe-area rectangle. Control groups stay together on large screens;
previews use the current viewport, and duplicate resize events do not rebuild held
inputs. Ported library/menu groups reflow by container width. Saved positions and
imported skin mappings remain authoritative. Changes are in src/skin-art.js,
src/app.js and style.css, with responsive browser tests using synthetic data.

Modified 2026-10-08: documented IndexedDB/localStorage/Cache Storage boundaries
and the explicit-start communication exception. The Celio relay is contacted only
after creating or joining a room; no STUN is used by the UI. The Service Worker refuses
non-read HTTP methods and non-navigation cross-origin/query requests; the local
preview server independently allows only GET/HEAD. Added isolated privacy tests
using synthetic data. No ROM/save upload API or cloud-save feature was added.

Modified 2026-10-08: replaced the custom resume banner, action tiles and separate
recovery menu with GameOptionsView's grouped MENU, GameOption's default ordering
and navigation shortcuts, and SaveStateListView's manual/automatic thumbnail rows
and selection editing. ASListPage / ASListItemView / ASNavigationView inform the
shared row and navigation layout. Narrow browser views reflow controls below labels.
Manual deletion is transactional and confirmed; automatic checkpoints remain
protected. Local battery-save history is a Web-specific subpage. These changes
are in src/manic-ui.js, src/app.js, src/storage.js, index.html and style.css.

mGBA: endrift and contributors, MPL-2.0. The onikoro334274-cell rom64 fork and
liru55 Web bridge are credited and pinned in SOURCES.json. The bridge modifications
are MPL-2.0. The corresponding C source, interface and recipe are supplied.
inih: Copyright (c) 2009 Ben Hoyt, BSD-3-Clause; full notice under licenses/.

FCEUmm: FCE Ultra authors including Xodnizel, CaH4e3 and libretro contributors,
GPL-2.0-or-later (GPL-3.0 selected for this build).
Mesen-S: Copyright (C) 2019 M. Bibaud and contributors, GPL-3.0-or-later;
includes Shay Green's LGPL audio/NTSC code, LGPL HQX, GPL xBRZ/Kreed filters,
MIT/public-domain stb/miniz/7-Zip, and Stephan Brumme's zlib CRC32 adaptation.
ClownMDEmu: Clownacy and contributors, AGPL-3.0, including its pinned Clown68000,
ClownZ80, ClownCD, ClownResampler and ClownCommon dependencies. MIT/Unlicense
dr_libs and stb source notices are preserved. libretro API headers retain MIT terms.
Full original per-file notices: licenses/Core-file-notices.txt and core source archive.
No Snes9x, Genesis Plus GX, EmulatorJS runtime or RetroArch frontend is distributed.
Mesen's upstream GPL filter code adapted from RetroArch retains its original notice.

Celio-Link/Celio-mGBA-Link: original GPL-3.0 device logic ported to src/celio-device.js;
Celio-Link/Celio-Server: GPL-3.0 handshake reference. Pinned original sources and
licenses are provided as sources/celio-*-source.tar.gz. Modified 2026-10-08:
bounded word queues and optional room-based Celio relay transport.
src/celio-device.js retains GPL-3.0-only; the GPL/AGPL combination follows section 13.
The old AGPL src/peer-link.js remains only for the isolated legacy protocol test.

2026-10-09: The same pinned upstream web/celio-serial.js is retained verbatim.
Local/USB coordination from link-session.js is adapted into src/direct-link.js;
serial framing is adapted into src/celio-serial.js. Both modified files retain
MPL-2.0, additionally offered under AGPL-3.0-or-later under MPL section 3.3.
Changes add bounded validation, cancellable USB cleanup, and deferred shutdown.
New AGPL application modules coordinate two independent cores and atomically
commit their saves. No new core binary, ROM, firmware or artwork is included.

liru55/mgba-celio-web web/link-session.js (58d463ebe2302e4fc70098760dcfc84ca69329db):
MPL-2.0 browser transport adapted into src/room-link.js. Original source and license
are retained in sources/celio-web-transport. Modified 2026-10-08: bounded transport,
fixed WSS relay endpoint, explicit start, separate existing JS device adapter, and
shutdown callbacks. No ROM/save/file API is accessible to the transport.
AGPL application changes add pre-link durable snapshots, suppressed autosaves and
rollback on interrupted sessions. Core binaries have not changed for this feature.
The mGBA JS adapter displays the paired local screenshot while paused after a
restore, because the unchanged core state format does not include a framebuffer.

PDF.js 6.4.299: Copyright 2024 Mozilla Foundation; Apache-2.0. Two unmodified
upstream browser bundles are used solely to render imported local skin PDFs.
Full Apache license, package provenance and filtered library/build source accompany them.
Upstream PDF test documents, fonts, viewer artwork and native Node canvas are excluded.

Emscripten 4.0.15: Emscripten authors, MIT/NCSA; musl by Rich Felker et al.;
LLVM/compiler-rt/libc++/libc++abi/libunwind under their retained Apache/LLVM exception
and older permissive notices; dlmalloc public-domain dedication. Full texts and
AUTHORS files are in licenses/. These component terms remain in force.

Software licenses do not grant rights in third-party ROMs, BIOS, games, brands,
or user-imported skins. No such content is included in this distribution.
Upstream anti-piracy policy is retained as an informational upstream statement,
not an additional restriction on the AGPL license or a legal opinion for every country.

## Project links / 作者・プロジェクト

The visible credits in licenses.html link directly to these upstream projects.
These links supplement, and do not replace, the copyright/license notices and
the corresponding source provided with this Web distribution.

- UI port: [Manic-EMU / ManicEMU](https://github.com/Manic-EMU/ManicEMU).
- GBA/GB/GBC core: [mGBA / endrift and contributors](https://github.com/mgba-emu/mgba).
- 64MiB fork: [onikoro334274-cell / mGBA_celio_edition](https://github.com/pm-start/mGBA_celio_edition).
- Web bridge: [liru55 / mgba-celio-web](https://github.com/pm-start/mgba-celio-web).
- FC: [libretro / libretro-fceumm](https://github.com/libretro/libretro-fceumm); [adopted EmulatorJS fork](https://github.com/EmulatorJS/libretro-fceumm).
- SFC: [libretro / Mesen-S](https://github.com/libretro/Mesen-S).
- MD: [Clownacy / clownmdemu-libretro](https://github.com/Clownacy/clownmdemu-libretro).
- Link logic: [Celio-Link / Celio-mGBA-Link](https://github.com/Celio-Link/Celio-mGBA-Link); [Celio-Link / Celio-Server](https://github.com/Celio-Link/Celio-Server).
- PDF rendering: [Mozilla / PDF.js](https://github.com/mozilla/pdf.js).
- INI parser: [Ben Hoyt / inih](https://github.com/benhoyt/inih).
- WASM toolchain: [Emscripten authors](https://github.com/emscripten-core/emscripten).

Modified 2026-10-08: added visible author/project credits and upstream links to
licenses.html, retaining the license texts, modifications and local source downloads.

Modified 2026-10-08: revised Japanese UI labels and help for clarity and brevity;
license originals and copyright notices are unchanged.

Modified 2026-10-08: replaced the initial standard skins with original SVG case,
bezel, button and control artwork in src/skin-art.js. Four palettes and portrait/
landscape layouts for six systems are supplied. No third-party skin images, logos
or fonts were used. Existing user-imported skins remain local and separately licensed.

Modified 2026-10-08: built-in skins now reflow to the available safe area, with
larger square directional controls, confirmed save/load shortcuts, a display-only
mode and local skin previews. The generic control arrangement (SELECT and START
above the directional/action buttons, with nearby state shortcuts) was studied
from TORI's GBA Moondusk screenshots at
https://deltastyles.com/skins/240-gba-moondusk . No Moondusk skin files, images,
source code, logos, gear motif or color palette are included or modified.
Its author does not permit modification or redistribution without permission;
this port's artwork and responsive layout code were independently authored.

Modified 2026-10-08: corrected notifications hidden behind modal dialogs.
The storage protection control now queries the browser's existing persistence
state and keeps request, granted, denied, unsupported and error outcomes visible
inside its settings dialog. Browser permission is never assumed or bypassed.

Modified 2026-10-08: added per-game skin preferences, following ManicEMU's
platform-default and individual-game selection behavior documented in its skin
guide and SkinSettingsView.swift. Game preferences are stored locally and take
precedence over platform defaults. Skin deletion removes dangling overrides;
ROMs and saves are not altered. Preview and user-imported artwork stay local.

Modified 2026-10-08: added an original local control-layout editor for the four
built-in skins. Individual controls can be moved and faded, with separate
portrait/landscape preferences, per-game overrides, cancel and reset. Imported
third-party skin artwork and hit maps are not modified. No new dependencies.

Modified 2026-10-08: directional-pad feedback now darkens only active arms,
including diagonal and combined inputs. The pad no longer shrinks on press;
its input area stays fixed. Direction feedback clears on release and pause.

Modified 2026-10-08: removed repeated presentation of unchanged frames on
high-refresh displays and idle emulation callbacks while paused. Gamepad polling
now shares the emulation loop. Native-rate PCM uses Web Audio resampling; pixel
and filter views are reused safely across frames and refreshed after memory growth.
Save and recovery intervals are unchanged. No new runtime dependencies.

Modified 2026-10-08: the speed button now displays its current multiplier in the
center and cycles from 1x through 5x on each activation. Tab uses the same cycle;
holding a button/key no longer enables a temporary speed override. Settings,
control previews, accessible labels and help are synchronized. Link mode remains
at 1x and restores the selected speed after disconnection.

Modified 2026-10-08: FPS and speed readout now stays at the upper left of built-in
skins in both orientations. Short portrait layouts reserve space only when the
readout is enabled and would otherwise overlap the game image.

Modified 2026-10-08: save status now uses short Japanese labels at the upper
right. The recovery menu and accessible label retain the saved data types,
full timestamps and failure details. Built-in skins reserve enough top space
for the status labels on short portrait screens. Save contents and timing are unchanged.

Modified 2026-10-09: ported the GameInfoView, GameInfoNavigationView,
GameInfoDetailView and GameInfoCoverView structure into src/game-info.js,
src/manic-ui.js and native-menu.css. The four unmodified upstream reference files
are retained under sources/manicemu-ui at the existing pinned revision. Added
pre-play state/save access, safe launch, recorded playtime, option order, shortcut
selection and local game launch links. ROM file sharing and its download fallback
were removed on 2026-10-09. New outline icons are original SVG;
no Apple symbols or game artwork are bundled. Added Scale4x contour filtering
and five-generation automatic state retention.

Modified 2026-10-09: added source-built DeSmuME 2015 at libretro/desmume2015
422b688009ccb9f2917c086a8fe79c8cecb030ae. Copyright yopyop, DeSmuME team,
libretro contributors and the authors named in retained file notices. GPL-3.0
is selected for GPL-2.0-or-later source, combined with the AGPL Web adapter under
section 13. Preferred source, build instructions, original GPL text and compiled
file notices accompany the new core. Added original dual-screen layout and touch
adapter, optional render skipping and local save/state integration. No ROM, BIOS
or upstream game artwork is bundled. No runtime networking is added.

Modified 2026-10-09: common settings rows/groups/switches now live in src/ui.js,
settings screens in src/settings-view.js, and red buttons/inputs in controls.css.
The bottom navigation keeps its original gradient. An earlier development
revision added catalog/name matching informed by ManicEMU OnlineCoverManager.
That external catalog/network code was removed in the publication review below.
Only local cover selection remains; no third-party artwork is bundled or fetched.

Modified 2026-10-09: added original streaming WSOLA pitch preservation in
src/time-stretch.js, shared by all Web core adapters. The independent analysis
clock and shared stereo alignment preserve pitch while compressing tempo;
normal-speed playback bypasses processing. The default-on setting is available
in audio settings and game menus. No external DSP code or dependencies are used.
Algorithm reference: Roelands and Verhelst, Eurospeech 1993,
https://www.isca-archive.org/eurospeech_1993/roelands93_eurospeech.html .

Modified 2026-10-09: library and history selections now open the shared game
information/settings sheet before launch. Selection and explicit Play follow the
GameListView / Game.handleTapAction / GameInfoDetailView separation at the pinned
ManicEMU revision; source-to-port references are documented in sources/manicemu-ui.

Modified 2026-10-09: split skin settings, state dialogs and storage settings out
of the app controller while preserving the original ManicEMU notices. Online
cover lookup was initially disabled by default, then removed entirely below. Added
clean release staging, deterministic source packaging, nested-content and Git
history checks, and pinned CI validation. Publication does not regenerate or
approve changed review records. See RELEASE_VALIDATION.md for tested scope.

Modified 2026-10-09: the offline download control waits for the initial worker
status and registered click handler before becoming active. Delayed responses
update only their own captured sheet elements. Added a delayed-status regression.

Modified 2026-10-09: SaveProtection now awaits Web Locks release before an
awaited close/reopen completes. Crash-recovery tests use a queued lock barrier
rather than a transient lock-query snapshot and verify repeated reopen cycles.

Modified 2026-10-09 (publication review): removed the external artwork catalog,
search, automatic-download implementation and network exceptions. Local image
selection follows GameInfoCoverView; existing local images remain available.
Removed the ineffective single-core switching menu and redundant product prose.
Preserved the native game/settings/state group structure, author notices and
all corresponding sources. Added original library/navigation reference files
from the same pinned ManicEMU revision; their individual notices are retained.


## Post-publication review — 2026-10-09

The local import card is ported from ImportServiceListView (Max) and
ImportFileCollectionViewCell (Daiuno), Copyright © 2025 Manic EMU,
AGPL-3.0-or-later, at the same pinned revision. Unmodified references are
included. Native row builders are consolidated in src/ui.js; About follows
the upstream Other section. Browser file validation remains local.

MPL_SECONDARY_LICENSE.md and src/room-link.js clarify the MPL section 3.3
secondary-license offer for this combined distribution, including this port's
MPL modifications. Original MPL source and notices remain intact. The privacy
notice distinguishes dumped proprietary BIOS from licensed replacement code.
No compiled core, user data, storage key or save format changed in this review.


## Application icon — 2026-10-09

assets/icon.svg is original Local Play screen-and-controller artwork, using
this UI's neutral dark palette and red accent. It replaces the previous icon.
The apple-touch-icon.png, icon-192.png and icon-512.png files are rasterizations
of this editable SVG, generated by scripts/build-icons.cjs with Playwright.
The SVG and generated artwork are provided under AGPL-3.0-or-later.
No third-party artwork, console logo or downloaded font was used.
All root HTML pages explicitly declare the iOS touch icon; the Web manifest
also declares PNG icons, including a maskable icon with an opaque background.
Installation links use content-hashed copies of those PNGs to avoid reusing
older home-screen images. The original filenames remain available. The manifest
uses PNG icons only; the empty library uses the same original SVG artwork.
Modified 2026-10-09: removed the duplicate About entry; credits remain in
licenses.html. Settings now show the loaded release version and build identifier.

Modified 2026-10-09: expanded the import-screen layout port using the pinned
ManicEMU ImportMottoCollectionViewCell, ImportServiceListCollectionViewCell and
ImportFooterCollectionReusableView sources by Daiuno / Max (2025–2026).
Their original source headers and AGPL license are retained. The top artwork
is Local Play's original icon. Native mascot art, Apple symbols and unsupported
import services are not included. The local skin and per-game save flows remain
the existing Web implementations.


Modified 2026-10-09: expanded the local Delta / Manic format reader and added
original browser presentation/input adapters (skin-format.js, skin-screens.js,
skin-inputs.js). Format references: https://noah978.gitbook.io/delta-docs/skins
and https://manicemu.site/guides/homemade-skins/ . Core Image effect names describe
compatibility with documented data; Apple's implementation is not included.
Imported images are decoded locally and stored as PNG bytes in IndexedDB;
legacy Blob records remain readable. The Solo Plastic skins by aphaits,
ManicEMU standard skins and Delta's standard DS skin were used only as external
local compatibility fixtures, not copied into this distribution or source archive.
The automated fixtures are original. See SKIN_COMPATIBILITY.md for limitations.

Modified 2026-10-09: retain the selected settings tab across navigation and
offline reloads, simplify the skin label, and keep the state picker frame and
tabs stationary across manual/automatic lists and recovery mode. These changes
retain the existing ManicEMU attribution and do not add dependencies or artwork.

Modified 2026-10-09: revalidate the HTTP cache when installing a new app shell
and fetching uncached core files, so an update does not copy stale resources
into the new offline cache. Retain the existing safe activation and local data.

Modified 2026-10-09: add automatic activation after all app tabs confirm they
are idle. Track pending work, protect activation with Web Locks, and verify
the HTML build before enabling a new tab. Busy, unknown and unresponsive tabs
keep the update waiting. The manual updater and original notices are retained.
Modified 2026-10-09: center the update indicator independently of menu sheets,
allow time to read it, and show a local completion notice after automatic reload.

Modified 2026-10-09: port the persistent skin library and separate previews from
SkinSettingsView, SkinCollectionViewCell, AddSkinCollectionViewCell and
SkinPreviewViewController. Preserve original Swift headers and AGPL notices.
The Web port retains the last platform and requires edit mode plus confirmation
to delete an imported skin. No third-party skin artwork is included.

Modified 2026-10-09: renamed the application from Local Play to PalmoEMU (0.3.4).
Updated display names, installation metadata, built-in skin labels and documentation.
Original author notices, licenses, corresponding source and upstream references are retained.
Existing storage identifiers, update coordination, save formats and publication URLs remain unchanged.
The name change does not indicate endorsement by ManicEMU or emulator core authors.
Removed redundant skin appearance/selection help; format guidance and compatibility warnings remain.


Modified 2026-10-09: bundle seven standard skins from Manic-EMU/ManicEMUSkins,
commit 63c04f92febba461d10ea16ef00b0f76199a5b20, under CC BY 4.0.
Attribution: Manic EMU / Manic-EMU contributors. Titles: ManicEMU GB / GBC / MD
Skin Standard; ManicEmu GBA / NES / SNES / DS Skin Standard.
Source: https://github.com/Manic-EMU/ManicEMUSkins/tree/63c04f92febba461d10ea16ef00b0f76199a5b20
License: https://creativecommons.org/licenses/by/4.0/ (unmodified local text and
warranty disclaimer: licenses/ManicEMUSkins-CC-BY-4.0.txt).
PDF artwork was converted to PNG and layouts normalized for the Web renderer.
Original artwork/creator labels are retained. Local source ZIPs omit unused assets
and macOS metadata; original info.json and used PDF bytes are unchanged.
See BUNDLED_SKINS.json and sources/manic-skins/README.md for titles, hashes and
changes. This artwork remains CC BY 4.0, separately from the AGPL application.
No additional restrictions, DRM or endorsement claim are made. Trademark/patent
rights and unrelated user artwork/ROMs are outside this license grant.


Modified 2026-10-09: independent portrait and landscape skin selections, for
platform defaults and game overrides. Legacy string selections remain readable
for both orientations; editing one preserves the other. Per-game inheritance and
skin deletion clear only the relevant orientation. Both skins are prepared before
play so rotation swaps presentation without restarting the core; stale/failed
loads release temporary URLs and preserve current images. Retained ManicEMU code
attribution and the separate CC BY 4.0 artwork/credits; no new assets or dependencies.

Modified 2026-10-09: stabilize skin picker preview, add-card and dialog heights
when switching portrait/landscape selections. Artwork and license terms unchanged.


## 0.3.8: game preferences, controls, portable backups and rewind (2026-10-10)

Added original AGPL-3.0-or-later browser modules for game-scoped preferences with
shared defaults/reset, per-system/device input mappings, repeat/toggle-hold
assistance, a ROM-free local backup archive, and bounded GB/GBC/GBA rewind.
Existing source archives, authors, core revisions, artwork terms and full license
texts are retained. No new core binary, third-party artwork, ROM, BIOS, cloud SDK
or upstream native runtime is included for these features.

Behavior was checked against Manic-EMU/ManicEMU commit
fbaeab79c214d5920bb51afa6f2d786fb2b12a58 (AGPL-3.0-or-later):

- Game.swift / PlayViewController.swift: Max, Copyright © 2025 Manic EMU.
  Game settings, serialized-state rewind capability, opt-in recording and online-play exclusion.
- GameOptionPerform.swift: Daiuno, Copyright © 2026 Manic EMU. Persisted game-option changes.
- ControllerMapping.swift / Trigger.swift: Daiuno, Copyright © 2025 Manic EMU.
  Controller-specific input maps and basic repeat/toggle behavior. The Web version
  does not implement the native TriggerPro macro editor or automation engine.
- FilesSyncPolicy.swift / FilesSyncRecord.swift / FilesSyncManager.swift:
  Daiuno, Copyright © 2026 Manic EMU. Data-category exclusions, batched writes,
  prior versions and lifecycle coordination. The Web adaptation is a manually
  exported local JSON file; it does not implement ManicEMU cloud synchronization.

Pinned source URLs and SHA-256 hashes are recorded under browserFeatures038 in
[SOURCES.json](SOURCES.json). The previously supplied Swift references keep their
original headers; newly reviewed references are not copied into the runtime.

The ManicEMU rewind runtime was traced to Daiuno/RetroArch submodule commit
00689c83f4d458e061d5fd7b52a181b8d240fe65:
[LibretroCore.m](https://github.com/Daiuno/RetroArch/blob/00689c83f4d458e061d5fd7b52a181b8d240fe65/ui/drivers/LibretroCore.m)
and [state_manager.c](https://github.com/Daiuno/RetroArch/blob/00689c83f4d458e061d5fd7b52a181b8d240fe65/state_manager.c).
state_manager credits Hans-Kristian Arntzen (2010–2014), Daniel De Matteis
(2011–2017), and Alfred Agrell (2014–2017), under GPL-3.0-or-later.
This was a behavior/architecture reference only: no RetroArch rewind source is
copied or linked. The new Web buffer stores bounded full states using the already
bundled cores, preserves paired battery data, and writes no persistent save.

Additional interaction references: Riley Testut's DeltaCore
[GameControllerInputMapping.swift](https://github.com/rileytestut/DeltaCore/blob/633dfa86967816315fe19b482511dab1ce517f28/DeltaCore/Model/GameControllerInputMapping.swift)
at 633dfa86967816315fe19b482511dab1ce517f28 (Riley Testut, 2017),
[Delta controller documentation](https://faq.deltaemulator.com/using-delta/controllers),
and [Delta Sync documentation](https://faq.deltaemulator.com/using-delta/delta-sync).
No Delta code, text, icon or asset is copied into this distribution, and no claim
of permission to redistribute unverified Delta source is made. The comparison
informs input capture and local backup UX only; this app has no Delta Sync service.

## Library organization (modified 2026-10-10)

Added original AGPL-3.0-or-later browser library modules in src/library.js,
src/library-view.js and library.css. They provide combined filters, sorting,
grouped presentation, explicit selection of the visible results and confirmed
batch operations. IndexedDB metadata patches and all-target deletion locks are
Web-specific implementations; deletion commits all selected games and their
save/state namespaces together. Optional category/favorite backup fields preserve
current values when absent from an older backup. No upload service was added.

Behavior references are pinned to Manic-EMU/ManicEMU commit
fbaeab79c214d5920bb51afa6f2d786fb2b12a58 (AGPL-3.0-or-later):

- GameListView.swift: Max, Copyright © 2025 Manic EMU. Normal versus selection
  mode, current-results select-all, sorting and a contextual batch toolbar.
- GamesToolView.swift / Theme.swift / GameListStyleCollectionViewCell.swift:
  Daiuno, Copyright © 2025 Manic EMU. Selection controls and persisted sort choices.
- GameOption.swift / GameOptionPerform.swift: Daiuno, Copyright © 2026 Manic EMU.
  Available actions across selected games and confirmation before deletion.
- CategorySelectionView.swift: Daiuno, Copyright © 2026 Manic EMU. A shared
  selection is shown only when all targets agree. Its native categories change
  a platform's variant; PalmoEMU's manual progress categories and favorite batches
  are independent Web features, and no online cover matching is included.

Exact source paths, reviewed lines and SHA-256 hashes are recorded under
browserLibraryOrganization in [SOURCES.json](SOURCES.json). Existing bundled
Swift originals and their headers are retained unchanged. Newly reviewed Swift
files are behavior references only, not copied into the runtime or distribution.
No new third-party image, ROM, BIOS, core binary or native dependency is included.

Modified 2026-10-11: expanded the existing selection/callout guards from the
skin to the entire player, including padding and status/FPS text. Native text
field editing is retained. No third-party dependency, artwork or core changes.

Modified 2026-10-12: disabled double-tap zoom across the player by using
touch-action:manipulation and removing a conflicting panel stylesheet override.
Native panel scrolling and editable fields remain available. No third-party
dependency, artwork, core binary or user-data handling changes.

Modified 2026-10-12: added an original AGPL-3.0-or-later runtime compatibility
correction for PokemonStart v0.40.0's blank extended-flash detection. It is gated
by the complete ROM SHA-256, expected instruction and the loaded core's 6MiB
save capability. Only a temporary execution copy is changed; the stored original
ROM and save identity are preserved. No ROM, game source, save, or game artwork
is included in the distribution or CI. Existing core binaries and third-party
licenses are unchanged. See src/mgba-compatibility.js and RELEASE_VALIDATION.md.

Modified 2026-10-12: shared game-control pointer lifetime handling between built-in
and imported skins, including the separately attributed bundled ManicEMU skins.
Added release recovery for missing pointer notifications, capture failures and
new touch sequences, with owner checks for delayed capture-loss events. Native
editing/scrolling is not canceled, and keyboard/gamepad state is independent.
The new browser helper and regression test are AGPL-3.0-or-later. No third-party
artwork, core binary, ROM or save handling changes.

Modified 2026-10-12: strengthened player-only gesture handling. The player uses
pan-y to keep communication-panel scrolling while excluding pinch zoom. An
original AGPL-3.0-or-later helper suppresses Safari gesture defaults and touch
move/end defaults on pointer-operated game controls and noninteractive areas.
Native command clicks, editable fields and communication-panel events remain
available. No added dependencies, third-party artwork, core or save changes.

Modified 2026-10-12 (0.3.15): room-link.js retains its MPL-2.0 / AGPL-3.0-or-later
secondary-license offer and gains bounded batched data, command/session ACKs,
duplicate suppression and outgoing retries. Both legacy and current Celio protocol
sources are tested locally. Celio-Server 8f509bdcf2a8383b936e0f2f31b2f6553ae421ce
is retained unmodified in sources/celio-server-modern-source.tar.gz with its GPLv3
license and README. Its package.json says ISC while the root LICENSE.txt
contains GPLv3; both upstream notices are retained unmodified, and this source
distribution follows the root GPLv3 terms. It is test-only source, not a browser/server deployment.
The original server reference and all original web transport notices remain.

FCEUmm's GPL-2.0-or-later mapper-176 fix b6870c3e146105b646e5d3505fcddf34ebaa9603
is backported to the pinned base. Only src/boards/fk23c.c changes; a dated notice
precedes its unchanged copyright/license header. This combined build selects GPL-3.0.
The complete modified preferred-form source is in sources/libretro-cores-source.tar.gz;
the unchanged Web bridge and build instructions are in sources/libretro-web.
JS/WASM rebuilt from that source match. No new mapper families, commercial ROMs,
save files, firmware or artwork are included. Synthetic tests are AGPL-3.0-or-later.

Current canonical repository links use pm-start/mGBA_celio_edition and
pm-start/mgba-celio-web. The original contributors onikoro334274-cell, liru55
and upstream authors remain credited; repository moves do not change authorship.


Modified 2026-10-12 (0.3.16): added a Japanese summary of the modification
notices and a versioned release-history page. The current change summary in
licenses.html and history in notices.html are generated from release-notes.json;
release checks reject a version mismatch or stale generated content. The original
copyright/modification notices, license texts, authors and source links remain.
Added scoped CSS overscroll containment to the visible player and root viewport
to suppress pull-to-refresh/scroll chaining during gameplay, retaining native
editing, panel scrolling and ordinary-page gestures. No new runtime dependencies,
network endpoints, core changes, artwork, ROMs or saves are included. New page,
generator, CSS and test changes are AGPL-3.0-or-later. See MOBILE_INPUT_REVIEW.md
for primary references and limits of desktop browser verification.


Modified 2026-10-12 (0.3.17): added local Japanese/English UI localization,
browser-language defaults and a persisted explicit preference. Authored UI
messages are translated before runtime values are inserted; names, files,
ROM/save contents and original license texts are not translated or uploaded.
Release summaries now contain both Japanese and English. Documentation and
raw upstream diagnostics retain their original languages.

Moved screen modules to src/views and shared row builders to src/components,
retaining their ManicEMU authorship and AGPL notices; extracted storage and
language settings components. New localization, component and validation code
is AGPL-3.0-or-later. Existing GPL and MPL component headers and additional
licensing notices remain in force. These changes do not replace license texts.
No new distributed dependency, artwork, core binary, network endpoint or user
content is included. ARCHITECTURE.md documents the module boundaries.
Modified 2026-10-13 (0.3.18): added Simplified/Traditional Chinese, Korean,
Spanish, French, German and Portuguese application text, regional language
selection, lazy-loaded catalogues and offline switching. Translated summaries
do not replace the original license texts, copyright notices or corresponding
source. No translation model, service or runtime dependency is distributed.
See LOCALIZATION_REVIEW.md for the localization scope and maintenance process.
