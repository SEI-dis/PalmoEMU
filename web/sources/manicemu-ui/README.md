# ManicEMU UI port references

The unmodified Swift files here are from Manic-EMU/ManicEMU commit
fbaeab79c214d5920bb51afa6f2d786fb2b12a58, licensed under AGPL-3.0-or-later.
Copyright © 2024–2026 Manic EMU. Created by Aoshuang Lee, Max, Daiuno and other credited authors; original headers are retained.
Full license: ../../licenses/ManicEMU-AGPL-3.0.txt.
Upstream: https://github.com/Manic-EMU/ManicEMU/tree/fbaeab79c214d5920bb51afa6f2d786fb2b12a58

## Source-to-port mapping (modified 2026-10-09)

| Upstream source | Web implementation |
| --- | --- |
| GameListView.shouldSelectItemAt / Game.handleTapAction / GameInfoDetailView.startGameButton | src/views/library.js and src/app.js: default-off quick start follows Settings.quickGame. Ordinary selection opens details unless enabled; the ellipsis, history and missing-ROM entries always open details. Selection mode never starts a core. |
| FlexSkinSettingViewController / FlexItemView / SkinSettingsView | src/control-editor.js, src/control-layout.js, style.css and src/app.js: separate screen/button editing modes, inactive-layer dimming, drag/pinch, aspect-preserving corner resize, reset and skin-settings entry. Web slider, keyboard access and explicit save/cancel retain draft persistence. |
| GameInfoView / GameInfoNavigationView / GameInfoDetailView / GameInfoCoverView | src/views/game-info.js, src/manic-ui.js, native-menu.css and index.html: game-detail sheet, info/more tools, cover, editable title, played time, fixed play/safe-mode header and independently scrolling options. |
| GameOption.defaultGroupAndSort | src/manic-ui.js: gameOptionGroups preserves the source group/order after unsupported entries are removed. src/app.js: showGameMenu supplies the available controls. |
| GameOption.Shortcut default list; GameOptionsView.getListPage(.gaming) | MENU title and quit/reload/saveState/quickLoadState navigation shortcuts. No custom resume banner or action-tile grid. Close resumes the game. |
| ASListPage / ASListItemView / ASNavigationView | Shared grouped rows, leading icons, trailing value/switch/chevron, compact navigation tools and close button in native-menu.css, style.css, index.html and src/app.js. |
| SaveStateListView.getSaveStatesSection / segmented control / editing actions | src/manic-ui.js: stateRow. src/app.js: showStates. Manual/automatic tabs, thumbnail, number, date, Continue button; editing replaces Continue with selection checkboxes. Select-all and confirmed deletion. Automatic tab opens first when no manual state exists. |
| GameOptionPerform | Browser equivalents for save, quick load, volume, speed, screenshot, skin, cheat, restart and exit actions. |
| ImportServiceListView / ImportMottoCollectionViewCell / ImportFileCollectionViewCell / ImportServiceListCollectionViewCell / ImportFooterCollectionReusableView | src/app.js and style.css: the top artwork, full-width Files card, two-column local-service cards and dashed drop hint. Skin settings and per-game save import reuse existing local flows. Cloud/LAN/download, clipboard and multi-disc services are omitted. Local IPS/BPS/UPS patching was added on 2026-10-13. Artwork and vector icons are original Web replacements. Original references and credits are retained. |
| SettingsListView / SettingItem | General, advanced, support and other groups; appearance controls, automatic states, controller skins and grouped settings rows in src/app.js and style.css. |

UIKit layout and Realm persistence are replaced with HTML/CSS/JavaScript and
IndexedDB. This is a source-based port, not the execution of Swift/UIKit in a browser.
Each upstream filename can be located in the pinned repository; the three AS*
files are from ManicEmu/ManicEmu/Sources/Business/Common (Models and Views).
The Web source archive contains these references,
the editable implementation, modification notices and the license.

## Subtractions and necessary Web adaptations

- Native purchases, iCloud/account features, achievements and unsupported
  per-core/device options are omitted. State-file import/export is not exposed.
- Native importSave/shareSave have their own rows, also available before play.
  Existing local battery-save backups remain available from the additional
  save-data row while playing. Checkpoints use the native automatic-state tab.
- Manual saves append instead of overwriting. Existing numbered slots remain
  readable. Selected manual records are deleted in one transaction only after
  confirmation. Automatic checkpoints stay read-only to preserve crash recovery.
- Recovery prompts, corruption checks, cross-tab locks and restart confirmations
  preserve the existing Web safety features. Loading checkpoints remains local.
- The native Japanese manual/automatic tab labels are shortened to 手動 / 自動
  under the セーブステート title. Continue remains 続ける. Narrow views reflow
  controls below labels instead of squeezing text into vertical columns.
- Browser-only full-screen and FPS controls use the same row component. The
  local save-data page uses the same grouping, without a separate tile layout.
- Native images and Apple system symbols are not copied. Replacement vector
  icons and standard-skin source artwork are authored for this AGPL Web port.
  No third-party skin, game ROM, dumped proprietary BIOS, game image or downloaded
  font is bundled. Open-source replacement BIOS implementations keep their licenses.

## Game-detail behavior (modified 2026-10-09)

GameInfo references are from ManicEmu/ManicEmu/Sources/Business/GameInfo/VIews/.
The source views guide spacing, the red accent, rounded groups, switches
and the pinned header. Native-only controls are filtered by available capabilities.
Safe mode suppresses cheats and automatic state recovery for the launch; saved
data remains intact. Preferences for audio, video and input remain global in the
Web model (skin/control-layout overrides retain their existing per-game behavior).
Played duration is recorded from this version onward; older playtime is not inferred.
Option sorting and navigation shortcut choices persist locally. ROM sharing and
its file-download fallback were removed on 2026-10-09. Save-data export remains.
The launch link identifies a game already stored in the same browser.

## Layout editor (modified 2026-10-09)

FlexSkinSettingViewController is from Business/Skin/ViewControllers; FlexItemView
and SkinSettingsView are from Business/Skin/Views at the same pinned revision.
Unmodified files and original notices are retained. The Web editor applies sizes
to artwork and hit rectangles together, stores positions/sizes by orientation and
keeps the previous per-game/shared preference model. Unlike upstream free-form
screen edge resizing, this port preserves aspect ratio and clamps to the viewport.
NDS moves/resizes each screen independently and retains legacy grouped layouts.
Imported skins stay unmodified.

The editor styles now live in control-editor.css. Screen and button layers are
explicit in editing, preview and gameplay; buttons keep their saved opacity while
overlapping video. Unlike upstream mode dimming, inactive items retain their
actual opacity so the overlap can be judged. src/control-alignment.js adds original
Web grid/snapping, guides, centering, level and mirror placement helpers.

## Shared controls and local artwork (modified 2026-10-09)

Settings rows/groups/switches use src/components/rows.js, settings pages use
src/views/settings.js, skin selection/layout settings use src/views/skins.js,
and state dialogs use src/views/states.js. controls.css defines the shared red
buttons and inputs.
Screen-specific styles retain placement; the bottom tabs retain their gradient.

The cover-change sheet retains GameInfoCoverView's local image selection. External
catalog/search/automatic download code has been removed from the publication
candidate. Existing cover pixels remain local; no third-party cover is shipped.
Game Info identifies the selected core and offers compatible alternate cores.
The switch is unavailable during play; save/state records are isolated per core. Native purchase/cloud/account/3DS-only controls remain omitted.

## Game selection (reviewed 2026-10-09)

The selection/start split was rechecked against the same pinned revision:
[GameListView.swift](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/ManicEmu/ManicEmu/Sources/Business/Games/Views/GameListView.swift)
calls `game.handleTapAction()` for normal selection;
[Game.swift](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/ManicEmu/ManicEmu/Sources/Business/Play/Models/Game.swift)
opens GameInfoView unless quick-start is enabled/forced. GameInfoDetailView's Play
button explicitly passes `forceQuick: true`. As of 0.3.25, this port includes the
default-off quick-start switch. Enabled ordinary library selections start through
the existing protected launch path. The ellipsis, history and missing-ROM entries
still open details. Bulk selection never starts gameplay.

The retained GameOptionsView `.gameInfo` / `.gaming` scene split and
GameOption.defaultGroupAndSort / availableOptions were also rechecked. The Web
port shares grouped-option components between the two scenes, includes only the
available core/browser controls, and retains the separate title/play section.

## Trainer card (modified 2026-10-13, 0.3.25)

SettingsAdventureCardView.swift (Daiuno, Copyright © 2026 Manic EMU) and
Settings.swift (Daiuno, Copyright © 2025 Manic EMU) are retained unmodified from
the same pinned revision, with their original headers and AGPL license.
src/components/trainer-card.js ports the grouped title, accented information
rows, nickname tap-to-edit (30 characters) and rounded avatar arrangement.
The original PalmoEMU icon replaces the native mascot; no native avatar is copied.

Upstream resolvedJoinDate uses stored metadata, otherwise the earlier of sandbox
creation and oldest import. Browsers cannot recover a past sandbox creation date:
existing installations use the oldest remaining valid game import date, or the
date recording begins when no import remains. Fresh databases record creation.
The displayed label is simply 参加日; internal provenance is retained and the
stored date does not change when ROMs are updated or deleted. This is local usage
metadata, not an account-registration date or a claim to know deleted history.

The lightweight per-ROM ledger, explicit update graph and ranking are original
AGPL Web adaptations. Each ROM's own duration is counted once; related versions
are aggregated only for display. Deletion retains metadata, re-import restores
that ROM's own counter, and unrelated games with similar names are not merged.
Game save payloads and core formats are unchanged. Profile and play records stay
local and are excluded from the existing save-backup format; their failed writes
must not prevent read-only access to the library and save-export tools.

## Publication audit (2026-10-09)

The bundled Swift references were compared byte-for-byte with the pinned Git
objects. Additional library/navigation references retain their original authors
and notices. Web settings preserve the native general/advanced/support/other
grouping; Web-only storage, offline/update, recovery and accessibility controls
use the same row components. Framework bindings, geometry, original skin art,
network safeguards and browser audio/video code remain deliberate Web adaptations.


## Follow-up review (2026-10-09)

The original Web import hero and hardware chips were replaced by the source's
compact Files service card. Supported extensions are in a collapsible helper.
The redundant About entry is omitted; credits and licenses remain in Other.
Shared native row
builders now live in ui.js and are re-exported by manic-ui.js for its callers;
their DOM and escaping behavior are unchanged. The original Swift references
remain byte-identical. Local recovery, offline updates and file validation are
browser adaptations; they do not add cloud/account/upload services.

## Skin library (modified 2026-10-09)

SkinSettingsView, SkinCollectionViewCell, AddSkinCollectionViewCell and
SkinPreviewViewController guide the two-column library, current-selection marker,
portrait/landscape preview tabs, separate enlarged preview and Add card.
The three additional Swift files are retained unmodified at the same revision.
Implementation: src/views/skins.js, src/skin-preview.js and style.css.
Imported records remain in IndexedDB when selection or a standard palette changes.
The last platform is retained so reopening cannot silently hide another platform.
The simplified Web preference still selects one skin for both orientations;
orientation tabs change previews. Per-game inheritance and standard layout editing
remain. Deletion is an edit action followed by confirmation, without multi-delete,
cloud synchronization or bundled third-party skin artwork. Preview image URLs
and screen renderers have independent lifetimes from gameplay.

## Library organization (reviewed 2026-10-10)

The same pinned ManicEMU revision informed the independent browser modules
src/library.js, src/views/library.js and library.css. References not already
bundled as Swift originals are recorded by URL and hash in SOURCES.json under
browserLibraryOrganization; no additional native source or artwork is copied.

| Upstream behavior | Web implementation |
| --- | --- |
| GameListView.selectionMode / GamesToolView selection controls | Explicit selection mode, current-results select-all / clear, contextual batch actions; ordinary card activation still opens Game Info. Changing a filter clears the Web selection. |
| Theme.GameSortType / GameListStyleCollectionViewCell / GameListView.sortDatas | Name ascending/descending, recent play, newest import and longest play duration; persisted sort and grouping preferences. Web labels state the actual direction, and Japanese/numeric comparison has stable ID tie-breaking. |
| GameOption.availableOptions(games:) / GameOptionPerform.delete | Explicitly scoped category/favorite/delete batches; confirmed deletion locks every selected game before a single IndexedDB transaction. No native cloud deletion, ROM sharing or unsupported batch options are ported. |
| CategorySelectionView selectedIndex for agreeing targets | A common choice is marked only when selected games share it. PalmoEMU's unclassified / playing / completed / backlog categories are manually assigned progress metadata, not the upstream platform-variant categories. The upstream cover-matching side effect is omitted. |

ROMs and saves are unchanged by category/favorite edits. Backups include these
optional metadata fields; older files without them preserve current values.
Classification/filtering creates no network requests or external metadata lookup.
Existing authors, AGPL license terms and byte-identical Swift references remain.


Modified 2026-10-12: grouped view modules under src/views and shared row
components under src/components. The paths above reflect this organization.
Retained original authorship/license headers while adding local Japanese/English
message calls. Storage settings were extracted from the settings view into a
component; input bindings, save keys and ManicEMU-derived menu semantics remain.

## Additional ports (2026-10-13)

NDSSaveConverter.swift guides footer-aware DSV import in src/nds-save.js. FocusEngine,
FocusSystem and FocusKeyObserver guide idle/paused UI input routing in src/ui-navigation.js.
ControllersSettingView guides separate player assignments. RomPatcherView guides the
local import service; native WebView/server code is replaced by a bounded Web Worker.
The Web implementation preserves text editing and uses browser permission prompts for sensors.

## Local cover crop (modified 2026-10-16)

The same pinned ManicEMU revision opens an image editor from
[GameCoverModifyView.swift](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/ManicEmu/ManicEmu/Sources/Business/GameInfo/VIews/GameCoverModifyView.swift)
through [ImageFetcher.swift](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/ManicEmu/ManicEmu/Sources/Tools/Others/ImageFetcher.swift).
PalmoEMU follows this selection/edit/save flow with original AGPL Canvas code in
`src/views/cover.js` and `src/components/cover-crop*.js`. HXPhotoPicker and other
native editor code or artwork are not copied or bundled. The square crop matches
the Web library's existing square covers, rather than asserting that ManicEMU
requires a square crop. The editor supports drag, pinch, a zoom slider and keyboard
positioning, with explicit save/cancel and local-only image processing.
