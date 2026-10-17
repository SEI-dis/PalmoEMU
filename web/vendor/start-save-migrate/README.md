# START Save Migrate: PalmoEMU migration component

Original author: **くりーぱー** (Discord: `ajillo0112`, identified by the user-provided author screenshot). Current source: user-provided `START-Save-Migrate-0.49.0.html`, tool version 1.0.9, destination game version 0.49.0. The earlier 1.0.5 extraction and local safeguards are retained as described below.

[PokemonStart](https://github.com/pm-start/PokemonStart) project development and contributions: **[onikoro334274-cell](https://github.com/onikoro334274-cell)** and **[liru55](https://github.com/liru55)**. Both accounts appear in the upstream contributor list (checked 2026-10-16); [the 0.50.1 publication commit](https://github.com/pm-start/PokemonStart/commit/62ebfdded673b10fa4450b94494166da8147d2bd) is by liru55. This credits the game project separately from the migration-tool author くりーぱー; repository contribution does not establish authorship of each bundled tool.

The project maintainer identified the author as くりーぱー and, on 2026-10-14, explicitly confirmed that the author has permitted incorporation into PalmoEMU, Web publication, modification, and redistribution of the modified source. The maintainer also confirmed that the author's stated condition is credit attribution. This is the maintainer's confirmation of author permission; the original author's permission message was not independently inspected in this review. The attachment does not state an upstream license. **No AGPL, MIT, or other upstream license is asserted for this component.** Retain this author/provenance notice; the permission recorded for this project must not be represented as a general third-party license.

Original 1.0.5 attachment SHA-256: `6b3aece19d09e42dff7242924db19de0b654924b8b907de91a796d833d04e4e8`.

Additional user-supplied packages reviewed on 2026-10-13:

- Browser ZIP SHA-256: `b40f08152d94ba7197da3fd4b28295d8b41983b4347dfa51ab631112c27b9e6c`.
- Source ZIP SHA-256: `d231361de0613d4d6c57bcfc4d3c088b59d81fb2ca8498e292d6357c8bd1bd6b`.

The Browser package's HTML is byte-identical to the original attachment. Concatenating the Source package's engine files in the order specified by its `build.py` reproduces the HTML's embedded ENGINE exactly; the manifest matches as well. This comparison was performed as a source-text check, without running the supplied build or verification scripts. The extracted PalmoEMU component has the modifications listed below and is not described as an unmodified copy.

Verification scripts and reports supplied with these packages describe the tool author's sample-save and native-game checks, including packed-item and record-preservation checks. These are author-reported results, not independent PalmoEMU test results or proof of complete gameplay compatibility. No supplied ROM, user save or verification output is included in this component. The source-identity checks do not establish a general public license, and the request to credit PokemonStart's developer does not relicense the tool.

PalmoEMU changes (2026-10-13):

- Extracted the embedded worker into an ES module with no DOM, network, or worker message handler.
- Removed species/item/move names, stats, sprites, ROM icon decoding, flags/editor actions and edit/undo sessions. Retained character decoding, numeric record bounds, box pointers, save layout and version definitions needed by migration.
- Retained the original adjacent-version migration, per-sector SaveCrypt, checksums, slot/RTC preservation and compatibility field handling.
- Made the old-bank selector reject duplicate section IDs and mixed save counters, consistent with the outer save reader.
- Added a separate PalmoEMU facade for bounded inputs, ROM CRC32 lookup, source stamp checks, cancellation, immutable inputs and post-conversion checks.

The original 1.0.5 metadata reports sample saves tested for 0.18–0.42.3 and no sample coverage for 0.1–0.17. The 1.0.8 definitions add 0.42.4–0.48.0, with some entries based on supplied save markers or inferred adjacent markers rather than a corresponding ROM. `saveSampleTested` and `tableEvidence` are retained author-supplied metadata, not independent PalmoEMU results. **Complete gameplay verification remains unavailable.** PalmoEMU tests use synthetic fixtures only. CRC32 is a compatibility hint, not an authenticity or security guarantee.

Compatibility updates intentionally change save-version variables, newly introduced variables and resume/warp fields. Structural checksums and preservation tests cannot prove that every game event remains playable. The original input must remain separately recoverable; do not overwrite it automatically.

## Destination compatibility (2026-10-14)

The 2026-10-14 integration emitted 0.42.3-format saves; the host stopped equating that with
an exact destination ROM version. `src/start-save/rom-profile.js` reads the native
version writer and minimum-save gate, using the provided Source package's
`analysis/extract-compat.py` as identification evidence. Actual local 0.42.3
and 0.42.5 ROMs were inspected read-only: both reject save versions below
0.36.2. Compatible newer targets can receive the intermediate output; a
changed/unreadable gate or a minimum above that output prevents application.
Tests contain only authored instructions and synthetic save layouts. They
cover both slots, RTC, original backups, future boundary changes and generic
copy bypass rejection. That change did not modify the supplied conversion engine.

## Component updates

PalmoEMU host integration is grouped under `src/start-save/`; `provider.js` is the only application entry to the conversion engine. `definition.js` derives versions from this manifest, while `contract.js` rejects unsupported output layouts. `component.json` records source provenance and extracted-file hashes. The 2026-10-14 refactor did not change `engine.js` or `manifest.js`.

See the [update procedure](../../scripts/start-save-migrate/README.md) for candidate review, extraction boundaries, required regressions and release steps. Candidate checks do not execute the supplied JavaScript and do not establish behavioral compatibility or grant a license.

### Separate provider extraction and PalmoEMU corrections (2026-10-16)

The executable `engine.js` is now generated from `scripts/start-save-migrate/base/engine.template.txt` and the five named corrections in `scripts/start-save-migrate/patches.json`. The template is the previously reviewed migration-only extraction, with correction sites replaced by named anchors; it is **not** an unmodified original HTML/ENGINE. The patches isolate strict old-bank validation, version aliases, native resume handling, per-source numeric bounds and the explicit destination migration. They include modified author-derived code and retain the attribution and project-specific permission above; they are not reclassified as entirely original AGPL code. The original supplied manifest remains unchanged.

This separation reproduced the previous executable source exactly except for a generated-file comment. The generator checks both extraction and supplied-manifest hashes and refuses missing or duplicate patch sites. Builds and component verification check regeneration. When a new author version arrives, compare each local correction with it, retire resolved patches and review retained patches before changing the pins. Never replace the runtime file directly or infer a migration rule from a newer ROM version alone. Public-ROM review evidence is maintained separately in `scripts/start-save-migrate/ROM_REVIEW.md`.

## Updated definitions and fixes (2026-10-16)

The maintainer supplied `START-Save-Migrate-0.48.0.html` (tool 1.0.8) and authorized incorporation and correction of this update. Attachment SHA-256: `c75944e71e02566671ef5b04e19144e0733a32c526448558d48a7fa4b87e5cf2`. The author and project-specific permission notice above remain applicable; no new standardized license was supplied.

Static JSON extraction found that the embedded ENGINE, including its asset/profile data, is byte-identical to the original 1.0.5 ENGINE after removing the embedded manifest. The new manifest adds twelve source versions and changes the final output to 0.48.0. PalmoEMU retains its existing migration-only engine and imports those numeric definitions; the HTML application, game names/assets and editor are not bundled.

PalmoEMU corrections to this update:

- Validate species, move and held-item IDs against the selected source version's numeric bounds. The supplied HTML retained profile limits of 1004 moves and 858 items even though its 0.48.0 definition specifies 1006 and 869; this would incorrectly reject new IDs. Older source bounds remain strict and unknown versions are not accepted implicitly.
- Normalize omitted `.0` suffixes through the manifest instead of a list ending at 0.42. Historical identifiers such as `0.30` remain canonical.
- Preserve existing bank validation, encrypted-sector handling, immutable originals, slot/RTC preservation and the host's post-conversion verification.
- Match the native resume-location validity check using both map-header bytes. A map with bank 0, nonzero map number and coordinates (0, 0) remains a valid recovery location; checking only the bank byte incorrectly skipped its warp update.
- Accept an explicit reviewed destination as the optional fifth `migrateSave` argument. Adjacent steps stop at that definition and the report names the actual output. Unknown destinations and downgrades are rejected before transformation; omission keeps the latest output as the default.

The new definitions retain the v23 / 50-box / SaveCrypt layout. Beyond 0.42.5, the supplied adjacent steps set version markers without adding new variable initializers or resume/warp adjustments. This is not independent proof that every game-side update routine is reproduced. In the 1.0.8 integration, the upstream-compatible low-level default carried the 0.48.0 stamp, but PalmoEMU always supplies an explicit endpoint. To preserve the game's own later update routines, host conversion advances only through definitions with reviewed resume-update metadata accepted by the destination; currently the last such entry is 0.42.5. This cap is derived from definition evidence, not from the newest game version. Newer compatible source saves are copied unchanged rather than downgraded or stamped forward. A read-only inspection of the local 0.44.0 ROM confirmed that its resume-position adjustment runs for a 0.42.5 bridge stamp but is skipped for a 0.44.0 or 0.48.0 stamp. Complete gameplay and re-save testing was not performed. Neither metadata checks nor synthetic preservation tests establish full gameplay compatibility.


## 0.49.0 definitions (2026-10-16)

The maintainer supplied `START-Save-Migrate-0.49.0.html` (tool 1.0.9). Attachment SHA-256: `dffa63e76abf9f9bac865e24643139bd09f8ef3927a26a0dc37b5bf0be7df795`. The existing author, PokemonStart developer and project-specific permission notices remain unchanged.

Static JSON extraction confirms that the embedded ENGINE logic is byte-identical to the 1.0.8 attachment after excluding the PROFILE and MANIFEST data. The profile expands its species tables from 1494 to 1506, move tables from 1004 to 1006 and item table from 858 to 869; game names, stats and editor data remain excluded from PalmoEMU. All previous manifest entries and native-compatibility metadata are unchanged. The only new entry describes 0.49.0 with the same v23 / 50-box / SaveCrypt layout, 1506 species, 1006 moves, 869 items, CRC32 3735236845 and save stamp 0x3100. Its sample-save/16-byte-RTC evidence is supplied by the author, not an independent PalmoEMU gameplay test.

Only the numeric definitions are imported. The corrected PalmoEMU engine is unchanged, including source-specific ID bounds, old-bank validation, immutable input, both-slot/RTC preservation and explicit migration endpoints. The reviewed bridge remains at most 0.42.5; adding a definition does not bypass destination-ROM validation or stamp newer saves forward. Compatible newer saves are retained without conversion and downgrades remain rejected. This component update does not repeat the earlier read-only 0.49.0 ROM inspection recorded in `scripts/start-save-migrate/ROM_REVIEW.md`; the ROM and real saves were unavailable on this checkout for the update. Full gameplay/re-save compatibility is not asserted. No HTML application, game assets, ROM or save is bundled.
