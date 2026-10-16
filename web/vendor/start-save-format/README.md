# PokemonStart 0.50.1 save-format component

**Permission clarification (2026-10-16).** Following an explicit explanation of
modification, offline distribution and modified-source publication on GitHub/in
ZIPs, the maintainer reported permission conditional on credit attribution, and
confirmed that the developer is already credited. Retain the existing PokemonStart
developer and project/tool credits in `licenses.html`; do not add an invented
individual tool author. This records the maintainer confirmation, not a separately
inspected rights-holder message. `component.json` records the scope and condition.

Source distribution: [pm-start/PokemonStart](https://github.com/pm-start/PokemonStart),
`PokemonStart_v0.50.1.pks`, bundled `セーブデータ移行ツール.html`.
The maintainer supplied the 0.50.1 HTML separately for this update. Its decoded
JavaScript was reviewed statically; the original HTML/UI is not distributed.
This identifies the distributor, **not a verified individual author**. This is
separate from the earlier くりーぱー START Save Migrate component; its author credit
and permission must not be attributed to this different attachment.

On 2026-10-16 the project maintainer confirmed that incorporation, Web publication, modification, offline distribution and redistribution of modified source on GitHub and in source ZIPs are permitted with credit attribution. The maintainer also confirmed the developer is already credited. This records the maintainer report, not an independently inspected rights-holder message. Retain the existing PokemonStart developer and project credits and this provenance. No standardized upstream or general third-party license is asserted; do not attribute this separate tool to the earlier START Save Migrate author.
The host facade AGPL notice does not relicense this component.

Original HTML SHA-256:
`96c1a970b2c65661db40237f8f3f0609faf6759d066bacbe887a8767b9d88ebc`.
Statically decoded JavaScript SHA-256:
`4517db68a1ad4a31c0e402501d6c828502656bdf1902382bd5f7b69767eb5332`.

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

## 0.50.1: expanded-flash probe after conversion

Adopt the supplied 0.50.1 forward writer's two additions: write the other main
bank with the same payload and counter minus one when the counter is nonzero;
and, only when physical sector 16 does not hold a mapped box page, write a
page-zero backup there with counter `max(counter - 1, 0)`. This makes the low
flash sectors used by the game's read-only alias probe distinguishable from
unused extended flash. No box page, unselected slot, RTC tail or non-layout
region is overwritten by the new rule.

The format boundary remains 0.50.0 and the conversion guard remains `0x31ff`;
the tool revision is not a new save format or a reason to stamp 0.50.1 early.
Already valid L saves remain byte-identical, as in the supplied tool. To recreate
an old 0.50.0 conversion with the new standalone writer, its original old-format
input is needed; this component does not silently reconstruct existing L saves.

The runtime-only, structure/capacity-gated correction in
`src/core/mgba-compatibility.js` remains necessary for blank/new-game flash and
earlier conversions. The supplied 0.50.1 ROM still contains the exact recognized
probe. It is not removed based on a version number, and a future changed probe
is not forced through the recognizer. No further runtime or save-byte workaround
was added. These are separate protections: the writer corrects its output;
the runtime correction applies only to the verified core's temporary ROM copy.

Independent synthetic checks cover both slots, sparse/dense boxes, odd/even/zero
and maximum counters, preservation of the real sector-16 box page, raw probe
results and original/RTC bytes. Ten fixtures match the supplied 0.50.1 forward
converter byte for byte. Original HTML, decoded source and actual ROM remain
outside the distribution. This does not certify real gameplay or iPhone use.
