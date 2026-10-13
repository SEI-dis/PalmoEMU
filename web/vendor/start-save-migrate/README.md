# START Save Migrate: PalmoEMU migration component

Original author: **くりーぱー** (Discord: `ajillo0112`, identified by the user-provided author screenshot). Source: user-provided `START-Save-Migrate.html`, tool version 1.0.5, destination game version 0.42.3.

[PokemonStart](https://github.com/pm-start/PokemonStart) game developer: **[onikoro334274-cell](https://github.com/onikoro334274-cell)**. This identifies the game developer, not an additional author of the migration tool.

The user explicitly authorized incorporating this attachment into PalmoEMU and identified the author as くりーぱー. The attachment does not state an upstream license. **No AGPL, MIT, or other upstream license is asserted for this component.** Retain this author/provenance notice; the permission recorded for this project must not be represented as a general third-party license.

Original attachment SHA-256: `6b3aece19d09e42dff7242924db19de0b654924b8b907de91a796d833d04e4e8`.

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

The original metadata reports sample saves tested for 0.18–0.42.3, no sample coverage for 0.1–0.17, and **no complete gameplay verification**. These are upstream statements, not independently verified claims. PalmoEMU tests use synthetic fixtures only. CRC32 is a compatibility hint, not an authenticity or security guarantee.

Compatibility updates intentionally change save-version variables, newly introduced variables and resume/warp fields. Structural checksums and preservation tests cannot prove that every game event remains playable. The original input must remain separately recoverable; do not overwrite it automatically.

## Destination compatibility (2026-10-14)

The tool still emits 0.42.3-format saves; the host no longer equates that with
an exact destination ROM version. `src/start-rom-profile.js` reads the native
version writer and minimum-save gate, using the provided Source package's
`analysis/extract-compat.py` as identification evidence. Actual local 0.42.3
and 0.42.5 ROMs were inspected read-only: both reject save versions below
0.36.2. Compatible newer targets can receive the intermediate output; a
changed/unreadable gate or a minimum above that output prevents application.
Tests contain only authored instructions and synthetic save layouts. They
cover both slots, RTC, original backups, future boundary changes and generic
copy bypass rejection. The supplied conversion engine has not been changed.
