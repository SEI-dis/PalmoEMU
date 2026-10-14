# Copyright, credits and modification notices

This is an unofficial Web port of ManicEMU, not a release endorsed by its authors.

Current bundled-artwork exception: seven ManicEMU standard skins under CC BY 4.0,
with separate attribution below and in sources/manic-skins/README.md. Earlier
entries describing no third-party skins refer to the distribution at that change.

Modified 2026-10-13: added original browser-only trainer-avatar editing and
screenshot/video review modules. Game recording uses the browser's Canvas,
Web Audio and MediaRecorder APIs; no external encoder, artwork or native
recording source was incorporated. These Web additions are AGPL-3.0-or-later.

Modified 2026-10-13: incorporated the migration portion of **START Save Migrate
1.0.5**, by **くりーぱー** (Discord handle **ajillo0112**, identified by the
user-provided author screenshot). The source is the user-supplied attachment
`START-Save-Migrate.html`, SHA-256
`6b3aece19d09e42dff7242924db19de0b654924b8b907de91a796d833d04e4e8`,
whose destination-version metadata is 0.42.3. There is no independently
verified public repository or upstream license statement for this attachment.
On 2026-10-14 the project maintainer confirmed author permission for
incorporation into PalmoEMU, Web publication, modification and redistribution
of modified source, with credit attribution as the stated condition. This
records the maintainer's confirmation, not a verbatim author license; the
original permission text was not independently inspected. No standard license
or wider grant than that confirmation is asserted. The derived files in `vendor/start-save-migrate/` are not relabeled
AGPL, MIT or another license by this project. The original author attribution
and this distinction must be retained separately from the Web application's
AGPL notices.

Game attribution: [PokemonStart](https://github.com/pm-start/PokemonStart) developer
**[onikoro334274-cell](https://github.com/onikoro334274-cell)**, separately
from the migration-tool author くりーぱー. This credit does not establish a new
license or make the game developer the author of the migration tool.

Modified 2026-10-13: added an original save-update policy separating documented
direct compatibility, legacy conversion and unverified combinations. The policy
for target 0.42.3 cites PokemonStart's CHANGELOG.md at
7563326f48f795d89b726a05ca1455d5bf9d7217. A successful format/version inspection
is required before selecting an action. Compatible saves are copied unchanged;
an unverified conversion requires an explicit choice. This integration does not
modify or relicense the supplied conversion engine.

Modified 2026-10-14: removed the exact destination-ROM version restriction.
The original PalmoEMU ROM-profile reader validates the PokemonStart cartridge
header and native save-version writer / Continue gate, reading the minimum
accepted save version from the ROM. The supplied Source ZIP's
analysis/extract-compat.py informed identification of variable 0x50EF and the
VarSet ABI. The conversion engine is unchanged: its 0.42.3 output is applied
only when the destination accepts that intermediate version. The current
PokemonStart CHANGELOG.md at a9848a797893f909d7f2c50f3bc4ea5ce71fc804
also documents compatibility for 0.42.4 and 0.42.5. No game ROM, save,
artwork or game-code binary is included in these modules or their tests.

The user subsequently supplied Browser and Source ZIP packages. The Browser
HTML is byte-identical to the original attachment above. Concatenating the
Source package's engine files in its `build.py` order reproduces the embedded
ENGINE exactly, and its manifest also matches. The ZIP SHA-256 values are:

- Browser ZIP: `b40f08152d94ba7197da3fd4b28295d8b41983b4347dfa51ab631112c27b9e6c`.
- Source ZIP: `d231361de0613d4d6c57bcfc4d3c088b59d81fb2ca8498e292d6357c8bd1bd6b`.

These are source-identity checks, not independent reproduction of the
verification reports supplied with the source. Descriptions of real-save or
native-game checks in those reports are the tool author's reported results;
PalmoEMU's own synthetic tests and modifications are documented separately.
These source-identity checks do not establish a general license grant, and
the supplied code is not relabeled under the Web application's license.

The adaptation extracts the migration engine and required format/version
metadata, removes the standalone editor and unused names, statistics, sprites
and icon decoding, and rejects inconsistent legacy save-bank sections.
No original attachment artwork, ROM or user save is bundled. Original Web
integration code retains its own AGPL notice; that notice does not relicense
the imported engine. See [the component provenance and change record](vendor/start-save-migrate/README.md)
for the exact scope and upstream verification limitations. The release content
inventory pins these files as a separate, license-unspecified component;
that inventory is not a grant of redistribution rights.

Modified 2026-10-14: grouped the original PalmoEMU save-conversion integration
under `src/start-save/`, separated the vendor API adapter and supported-layout
contract, and derived the output version from the supplied manifest. Added
original AGPL candidate/provenance checks and update instructions under
`scripts/start-save-migrate/`. The supplied engine and manifest are byte-for-byte
unchanged. The new component record retains the existing author and permission
scope; it does not grant or assert an upstream license.

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
The Web UI and its AGPL-covered modifications are AGPL-3.0-or-later, without
warranty. Recipients may use, modify and redistribute those parts under that
license. Separately identified third-party components retain their stated
terms; no blanket license is assigned to components with unspecified terms.
See LICENSE and licenses.html.

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
(src/skins/skin-art.js, src/skins/skin-drawing.js and src/skins/nds-skin.js) is newly authored for
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
imported skin mappings remain authoritative. Changes are in src/skins/skin-art.js,
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
are in src/components/manic-ui.js, src/app.js, src/storage/storage.js, index.html and style.css.

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

Celio-Link/Celio-mGBA-Link: original GPL-3.0 device logic ported to src/link/celio-device.js;
Celio-Link/Celio-Server: GPL-3.0 handshake reference. Pinned original sources and
licenses are provided as sources/celio-*-source.tar.gz. Modified 2026-10-08:
bounded word queues and optional room-based Celio relay transport.
src/link/celio-device.js retains GPL-3.0-only; the GPL/AGPL combination follows section 13.
The old AGPL src/link/peer-link.js remains only for the isolated legacy protocol test.

2026-10-09: The same pinned upstream web/celio-serial.js is retained verbatim.
Local/USB coordination from link-session.js is adapted into src/link/direct-link.js;
serial framing is adapted into src/link/celio-serial.js. Both modified files retain
MPL-2.0, additionally offered under AGPL-3.0-or-later under MPL section 3.3.
Changes add bounded validation, cancellable USB cleanup, and deferred shutdown.
New AGPL application modules coordinate two independent cores and atomically
commit their saves. No new core binary, ROM, firmware or artwork is included.

liru55/mgba-celio-web web/link-session.js (58d463ebe2302e4fc70098760dcfc84ca69329db):
MPL-2.0 browser transport adapted into src/link/room-link.js. Original source and license
are retained in sources/celio-web-transport. Modified 2026-10-08: bounded transport,
default WSS relay endpoint, explicit start, separate existing JS device adapter, and
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
bezel, button and control artwork in src/skins/skin-art.js. Four palettes and portrait/
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
src/components/manic-ui.js and native-menu.css. The four unmodified upstream reference files
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
src/rendering/time-stretch.js, shared by all Web core adapters. The independent analysis
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

MPL_SECONDARY_LICENSE.md and src/link/room-link.js clarify the MPL section 3.3
secondary-license offer for this combined distribution, including this port's
MPL modifications. Original MPL source and notices remain intact. The privacy
notice distinguishes dumped proprietary BIOS from licensed replacement code.
No compiled core, user data, storage key or save format changed in this review.


## Application icon — 2026-10-09

assets/icon.svg is original PalmoEMU screen-and-controller artwork, using
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
is PalmoEMU's original icon. Native mascot art, Apple symbols and unsupported
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

Added original AGPL-3.0-or-later browser library modules in src/library/library.js,
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
licenses are unchanged. See src/core/mgba-compatibility.js and RELEASE_VALIDATION.md.

Modified 2026-10-13: extended that correction to the separately reviewed
PokemonStart v0.42.3 ROM hash and instruction location. The same full-hash,
instruction and 6MiB core-capability checks apply independently to each version.
The local diagnostic used synthetic flash reads to inspect the game's capability
function; no user save was read or modified. No ROM or extracted game code is
distributed. This change does not alter or relicense the save migration tool.

Modified 2026-10-13: replaced the per-ROM digest allowlist with an original
Thumb instruction/control-flow recognizer in src/core/mgba-save-probe.js. It locates
the same extended-flash alias test after code/literal relocation, validates the
cartridge signatures, sector pairs, comparison loop, flash read and bank-select
paths, and rejects ambiguous or shared comparison helpers. The loaded core must
still support 6MiB saves. Unknown instruction structures are left unchanged.
Authored assembly fixtures are used in regression tests; no game ROM or user
save is distributed. Existing core and third-party license notices are retained.

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

Modified 2026-10-13 (0.3.19): added development-time local translation and
source extraction, source-hash tracking, missing/stale/unregistered text checks,
and development-server synchronization. New code is AGPL-3.0-or-later.
Acorn 8.15.0 is distributed as a development parser under MIT: Copyright (C)
2012-2022 by various contributors (see AUTHORS). Its unmodified parser, MIT
license, upstream source archive and fixed provenance are retained in
scripts/i18n/vendor/, licenses/Acorn-MIT.txt, sources/acorn-source.tar.gz and
SOURCES.json. The archive includes AUTHORS. No Acorn code, translation model or
translation endpoint is loaded by the browser application. Ollama and Gemma
remain optional local developer prerequisites, not distributed components.
See LOCALIZATION_REVIEW.md for the generation and review process.

The Acorn source archive is repacked with scripts/prepare-acorn.py. Only the two
redundant node_modules/acorn workspace symlinks in acorn-loose and acorn-walk
are omitted; all regular source files, LICENSE and AUTHORS remain unchanged.

## 2026-10-13: upstream feature ports

- ManicEMU (AGPL-3.0-or-later): DSV conversion, FocusKit interaction, controller player assignment and local ROM patch import flow. Original selected Swift references and copyright headers are under sources/manicemu-ui. Browser adapters are marked as modified.
- pm-start/mgba-celio-web (liru55 and contributors, MPL-2.0), 23235bc6: audio buffer/resampler, ARM and mode-0 renderer optimization backports in the mGBA source archive; packed framebuffer export; LCD/CRT/xBRZ driver adaptation in src/rendering/gpu-filter.js. Source files retain notices and dated changes.
- RomPatcher.js (Marc Robledo), 318388408682: unmodified MIT BinFile, HashCalculator and IPS/BPS/UPS modules in vendor/rom-patcher, including full LICENSE. No artwork is reused. The bounded worker and UI are original AGPL code.
- xBRZ Freescale Multipass: unmodified GLSL from libretro/glsl-shaders 435612fe4f10, via liru. Hyllian permissive notice and Zenju GPL-3.0/exception text remain in both shaders, with full GPL text in shaders/COPYING.txt. GPL shader terms are retained alongside the AGPL application (GPLv3 section 13 permits the combination). Shader source is served and included in the corresponding Web source ZIP.

Modified 2026-10-13: the original AGPL libretro bridge registers video/audio/input callbacks after retro_init for Mesen-S. The AGPL jgenesis wrapper explicitly connects the second SNES/MD gamepad and combines aliased MD inputs. Core serialization is unchanged.

Modified 2026-10-13: added DS simulated blowing and boot-time firmware-language
selection in the AGPL Web adapter and NDS-specific libretro bridges. The five-second
interaction follows ManicEMU (Copyright © 2026 Manic EMU; Daiuno),
[PlayViewController.simBlowing at fbaeab79c214d5920bb51afa6f2d786fb2b12a58](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/ManicEmu/ManicEmu/Sources/Business/Play/VIewControllers/PlayViewController.swift#L3481).
The implementation uses the public libretro interfaces in the existing pinned
DeSmuME 2015 and melonDS 0.9.3 sources: DeSmuME L3 with internal microphone noise,
and melonDS L2 with Blow Noise. Their original source and license notices are
retained; no emulator-core source or serialized-state layout is modified.
The generated JS/WASM include the changed frontend bridges. The new settings
view and synthetic regression fixtures are AGPL-3.0-or-later. Device microphone
recording, audio transmission, game ROMs, user saves and external firmware are
not part of this addition. See sources/nds-web/BUILD.md and
sources/alternate-web/BUILD.md for the exact option names and build inputs.


Modified 2026-10-13 (0.3.22): src/rendering/pixel-transfer.js adapts
choosePixelTransfer/drawFrame from liru55 and contributors,
pm-start/mgba-celio-web web/app.js at 23235bc6db1b67009808c0dc7e1f25131eb75e7a.
It retains MPL-2.0 and the secondary-license offer documented in
MPL_SECONDARY_LICENSE.md. This adaptation uses synthetic pixels before any
user cartridge loads and bounds calibration, memory views and fallback.
The LCD/CRT strength control exposes the existing upstream effect parameter.

The new ZIP reader/import path, clock/rumble UI and game-rumble adapter are
original AGPL-3.0-or-later code. sources/mgba-web-port/options.h (MPL-2.0)
uses the pinned mGBA RTC and rumble APIs, with original upstream notices
retained. GB/GBC sensor settings reuse the existing mGBA sensor interface.
No new distributed third-party dependency, network endpoint, user cartridge,
save, firmware or artwork is included in these additions. Core build and
verification results are documented in the bridge BUILD.md files and
FEATURE_REVIEW.md. The changed three cores were independently rebuilt from
their distribution sources and the resulting JS/WASM hashes match.

Modified 2026-10-13 (0.3.22): scoped the app shell's double-tap zoom
policy to the library, import/settings views and dialogs with CSS manipulation.
Scrolling, native text editing and pinch zoom outside play remain available.
The player-specific gesture guards and separate document pages are unchanged.
This is original AGPL-3.0-or-later code; the verification scope is recorded in
MOBILE_INPUT_REVIEW.md.

Modified 2026-10-13 (0.3.22): the MPL-covered mGBA archive version.cmake reads
Git metadata only when the core source has its own .git entry. Extracted sources
no longer inherit unrelated parent-application revisions. Source and changed-file
hashes are in SOURCES.json and sources/build-evidence.json; execution and save
formats are unchanged. Original upstream license notices are retained.

Modified 2026-10-13 (0.3.22): the original AGPL update coordinator exposes
update download and activation stages before safe app actions, retaining
shared version locks and two-phase activation across tabs. No game/save data
or analytics is transmitted. Game startup pauses emulation until a stored
save has been verified and restored.

Modified 2026-10-13 (0.3.24): ROM update/save copying, ROM-only removal,
selective backup restoration and the portable state envelope are original
AGPL-3.0-or-later Web implementations. Individual state selection/import/export
follows the behavior of ManicEMU SaveStateListView; existing source attribution,
authors, original Swift references and license texts are retained. DS lid control
follows the simLid operation in ManicEMU PlayViewController.swift at the pinned
fbaeab79c214d5920bb51afa6f2d786fb2b12a58 revision (lines 4422–4430), adapted
to the distributed DeSmuME 2015 and melonDS libretro interfaces. The modified
DS bridges remain AGPL-3.0-or-later. The underlying DeSmuME and melonDS cores
retain their original GPL notices and corresponding sources.

GB/GBC local link uses the pinned mGBA GBSIOLockstep implementation through
an MPL-2.0 wrapper in sources/mgba-web-port/gb-link.h adapted from
mGBA MultiplayerController.cpp, retaining Jeffrey Pfau's copyright notice. This keeps both
instances inside one WASM module; no network service or new dependency is
introduced. Standard-skin touch options and ROM-free input tests are original
AGPL-3.0-or-later code. Imported artwork and its authored geometry are unchanged.
No ROMs, saves, BIOS files, third-party artwork or new network endpoints are
included in these changes. The changed core build evidence, preservation tests
and distribution review are recorded with this release.


Modified 2026-10-13 (0.3.24): the common camera shortcut, placement helper
and camera SVG path are original AGPL-3.0-or-later work. They reuse the
existing game-image capture and control-layout editor, preserving its
ManicEMU attribution. Captured images are downloaded locally; no user
image, ROM or save is uploaded. Imported skin assets are not modified.

0.3.24では保存履歴の合計サイズ制限と、IndexedDBの同期書き込み失敗時の全体取消を追加しました。既存の保存形式・コア形式を変えないオリジナルのWeb側修正です。

Modified 2026-10-13 (0.3.25): the trainer card adapts SettingsAdventureCardView
(Daiuno, Copyright © 2026 Manic EMU); default-off quick start follows Settings
and Game.handleTapAction (Daiuno / Max, Copyright © 2025 Manic EMU), all from
the pinned fbaeab79c214d5920bb51afa6f2d786fb2b12a58 source under AGPL-3.0-or-later.
Original reference files and headers are retained in sources/manicemu-ui.
The Web version uses its existing original app icon instead of the native mascot.
Per-ROM cumulative statistics, version-grouped rankings and browser date fallback
are original AGPL adaptations. No new artwork, core binary, dependency or network
service is added; profile and gameplay metadata remain on the device.

Modified 2026-10-14 (unpublished maintenance): host Web modules are grouped
by responsibility under src/. Relative module, Worker and asset paths, source
references and diagnostic allowlists follow the new locations. Copyright
headers and license terms are retained. The one-shot Worker lifecycle helper
and the expanded module/resource path checker are original AGPL-3.0-or-later
work. Fixed core binaries, corresponding core archives and supplied converter
files are unchanged; save formats, keys and transaction/session guards remain
unchanged.

## 0.3.29: local backup and runtime protection (2026-10-14)

Original AGPL-3.0-or-later Web changes add selected and bounded split backups,
trainer profile/play records and ROM-update original-save snapshots, v1 imports,
opt-in local timing summaries, Screen Wake Lock, and a generated diagnostic
source allowlist. No new dependency, artwork or cloud upload is added.
The existing MPL-2.0 Celio transport now accepts a validated, explicitly selected
WSS relay origin; upstream copyright and source remain intact. The new original
AGPL metadata checker/workflow reports upstream candidates without adopting code.

The MPL-2.0 mGBA bridge adds save-watch.h and per-core save observer exports.
It uses the pinned core's dirty flags and quiet-frame callbacks; the full source
archive, save/state formats and IDs are unchanged. Both native outputs match
independent builds. Modified bridge source, build instructions and hashes are
distributed in sources/mgba-web-port, SOURCES.json and build-evidence.json.

## 0.3.30: native logging, ROM ownership and cartridge CPU defaults (2026-10-15)

Modified MPL-2.0 bridge: `sources/mgba-web-port/logging.h` follows the native
quiet-logger approach in liru55 and contributors' `pm-start/mgba-celio-web`
commit `23235bc6db1b67009808c0dc7e1f25131eb75e7a`, retaining bounded engine
warnings/errors and fatal messages. Both independent rebuilds match; source,
instructions and hashes are distributed. The native source archive is unchanged.

Original AGPL browser changes add automatic CPU selection by the extended
cartridge hardware signature, using the Celio fork's default of 2 for that
cartridge and 1 for ordinary games. Explicit settings and link restrictions
are retained. No ROM content, game source, user saves or new assets are included.

The modified MPL-2.0 bridge also accepts ownership of a temporary ROM allocation,
avoiding a second full copy. The original copying export remains available.
The compiled GBA save capacity is queried before the existing structurally
verified temporary correction, without changing the stored ROM or save identity.
Original AGPL adapter cleanup releases module references after exit and rejects
late initialization after cancellation. Save/state layouts and link drivers are
unchanged. These changes add no dependency, permission or network endpoint.

Further modified 2026-10-15: the MPL bridge rejects missing mandatory startup
RAM/video/audio allocations before executing a cartridge and distinguishes the
failure in the ownership-transfer API; the original copying ABI stays boolean.
Original AGPL adapter cleanup attempts every owned resource even after an
exception and extends late-initialization cancellation to NDS/Retro/jgenesis.
Corresponding sources, build instructions and allocation/teardown regressions
are included. The pinned upstream archive and license conditions are unchanged.

Follow-up original AGPL changes after reviewing an audit of 92f354e retain one
verified save snapshot, complete independent startup cleanup after an error,
and add opt-in aggregate audio queue/drop measurements. Native binaries, audio
processing, save formats, third-party source, permissions and endpoints remain
unchanged from the preceding self-audit. No PCM or user game data is recorded
by these additional measurements.

Final original AGPL audit follow-up shares the extended-cartridge header guard
between CPU selection and the temporary save-probe correction, matching the
pinned native raw GBA detector and rejecting BIOS-like entry tables. Retained
GBA link IO no longer captures a closed module or invokes it after teardown.
Native binaries, live link protocols and stored game data are unchanged.
