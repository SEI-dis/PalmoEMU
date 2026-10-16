# PokemonStart 0.50 save-format component

Source distribution: [pm-start/PokemonStart](https://github.com/pm-start/PokemonStart),
`PokemonStart_v0.50.0.pks`, bundled `セーブデータ移行ツール.html`.
This identifies the distributor, **not a verified individual author**. This is
separate from the earlier くりーぱー START Save Migrate component; its author credit
and permission must not be attributed to this different attachment.

The project maintainer explicitly confirmed permission to incorporate this
officially bundled HTML tool and publish its integration on the Web on
2026-10-16. This records the maintainer's permission confirmation, not an
independently inspected message from the rights holder. No standardized upstream
license was supplied. **No MIT, GPL, AGPL, or general third-party license is
asserted for this extracted/adapted component.** The host facade's AGPL notice
does not relicense this directory. Preserve this provenance and permission scope.

Original HTML SHA-256:
`3a6c4378e32ff3d975d4d3ba15fbd88955baec20c08b9ce6c05f9846cbd35b88`.
Statically decoded JavaScript SHA-256:
`61c4e1bc7d64e7c49b3cb4f5569fa2339a60dc0f2fcadac90ed60d568d72a195`.

## Scope

`engine.js` extracts and adapts SaveCrypt and the **old → L** part of LFormat.
The original tool's DOM, downloads, historical 14-sector migration, reverse
conversion, value-rounding code and unrelated packaged files are not included.
The existing historical migration component remains responsible for older game
versions before this separate layout conversion. No ROM, game assets, patch or
user save is bundled here. No network or storage API is used.

The forward rules are those in the supplied tool: 58-byte boxed records become
60-byte records, all 50 × 30 logical positions are remapped, and the high met-level
flag moves into the new extension field. No forward rounding or invented
species/item/move rule is added. Party records are preserved unchanged. The last
saved-version variable is raised to `0x31ff` (0.49.255) only under the source
tool's rule (nonzero and older); it is deliberately **not** stamped 0.50.0, so the
game's initial update still runs. Existing L data is validated without rewriting.

## PalmoEMU safeguards and intentional differences

- Work on an owned copy. Accept 128KiB or 6MiB saves, with an optional 16-byte RTC
  tail. The full save has two independent 3MiB slots. A short file can grow to 6MiB
  if the new layout requires extension pages. Return new bytes; never persist or
  overwrite the caller's original.
- Distinguish a completely erased (`0xff`) unused slot from unreadable data.
  Explicit slot selection preserves every byte in the other slot. Selecting all
  skips only erased slots and rejects any unreadable populated slot.
- Reject duplicate/missing main section IDs, bad checksums, mixed main counters,
  a mismatching shelf-map counter, and ambiguous equal-counter main contents.
  Select main banks and overflow pages with uint32 wrap-aware serial comparison;
  reject a half-range counter difference rather than guessing.
- Require the selected page zero. Validate every referenced shelf, extension and
  overflow page, including physical ranges, unique physical assignments, logical
  IDs, signatures and checksums. Explicit `0xff` no-page entries remain normal
  empty pages. Never silently replace a broken referenced page with zeroes, as
  the standalone tool does. An equal-counter overflow with differing data is
  rejected instead of silently choosing one.
- Retain the tool's owned layout ranges (sectors 0–31 and 40–85 in each converted
  slot). Preserve other extension sectors (32–39 and 86–767) as original **raw
  bytes**, including their encryption state; the tool's whole-file re-encoding
  otherwise changes plaintext non-layout sectors. Unselected slots, existing L
  slots and RTC bytes are not re-encoded.
- Re-read converted output and verify all 1,500 boxed records, non-box main
  section bytes, party bytes, region data, page-zero metadata and extension
  metadata. The shelf pointer structure, vacated old box locations and the
  explicitly transformed level/version fields are the defined layout changes.
- Cancellation and progress callbacks are host-only controls. Errors have stable
  codes; `src/start-save/format-l.js` supplies localized user messages.

`containsFormatL` is an inexpensive header hint, including encrypted headers. It
is not a checksum/integrity check and must never authorize conversion or applying
a save by itself. `inspectFormatSave` performs the actual structural inspection.

Synthetic and source-tool comparison tests establish structural preservation,
not full gameplay compatibility. The original save must remain recoverable.
When replacing this component, compare forward rules and constants against the
new supplied tool, re-review each safeguard, update source and component hashes,
and run both independent logical-record tests and the supplied-tool oracle.
