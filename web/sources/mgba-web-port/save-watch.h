/* SPDX-License-Identifier: MPL-2.0
 * Browser save-completion observer, 2026-10-14.
 * Uses mGBA's dirty flags and cleanup threshold, without copying cartridge RAM.
 * No file or network storage is performed here.
 */
#include <mgba/internal/defines.h>
#include <mgba/internal/gb/gb.h>

static struct WebSaveWatch {
  struct mCore* machine;
  uint32_t revision;
  uint32_t baselineAge;
  bool baselinePending;
} webSaveWatches[2];

static int* web_save_dirty(struct mCore* machine, uint32_t** age, uint32_t* frame) {
  if (machine->platform(machine) == mPLATFORM_GBA) {
    struct GBA* gba = machine->board;
    *age = &gba->memory.savedata.dirtAge;
    *frame = gba->video.frameCounter;
    return &gba->memory.savedata.dirty;
  }
  struct GB* gb = machine->board;
  *age = &gb->sramDirtAge;
  *frame = gb->video.frameCounter;
  return &gb->sramDirty;
}

static void web_save_settled(void* context) {
  struct WebSaveWatch* watch = context;
  uint32_t* age;
  uint32_t frame;
  web_save_dirty(watch->machine, &age, &frame);
  /* State/import operations are not cartridge writes. Their old pending dirty
   * batch is ignored; a later game write assigns a new frame age. */
  if (!watch->baselinePending || *age != watch->baselineAge) ++watch->revision;
  watch->baselinePending = false;
}

static void web_save_frame_ended(void* context) {
  struct WebSaveWatch* watch = context;
  struct mCore* machine = watch->machine;
  uint32_t* age;
  uint32_t frame;
  int* dirty = web_save_dirty(machine, &age, &frame);
  /* Fresh browser cartridges have no VFile. Native cleanup normally returns
   * early there. Run exactly its dirty-age helper, with no sync or clone.
   * Imported saves have a memory VFile and use normal native callbacks. */
  if (machine->platform(machine) == mPLATFORM_GBA) {
    struct GBA* gba = machine->board;
    if (!gba->memory.savedata.vf) mSavedataClean(dirty, age, frame);
    /* GBAFrameEnded invokes savedataUpdated after this frame callback. */
  } else {
    struct GB* gb = machine->board;
    if (!gb->sramVf && mSavedataClean(dirty, age, frame)) web_save_settled(watch);
  }
}

static void web_save_watch_baseline(void) {
  struct WebSaveWatch* watch = &webSaveWatches[webSelected];
  watch->machine = core;
  watch->revision = 0;
  if (!core) return;
  uint32_t* age;
  uint32_t frame;
  int* dirty = web_save_dirty(core, &age, &frame);
  /* Consume only NEW into SEEN, as normal end-of-frame housekeeping would.
   * Keep pending writeback intact and distinguish future cartridge writes. */
  if (*dirty & mSAVEDATA_DIRT_NEW) mSavedataClean(dirty, age, frame);
  watch->baselinePending = *dirty != 0;
  if (watch->baselinePending) *age = frame;
  watch->baselineAge = *age;
}

static void web_save_watch_init(void) {
  web_save_watch_baseline();
  struct mCoreCallbacks callbacks = {0};
  callbacks.context = &webSaveWatches[webSelected];
  callbacks.savedataUpdated = web_save_settled;
  callbacks.videoFrameEnded = web_save_frame_ended;
  core->addCoreCallbacks(core, &callbacks);
}

EMSCRIPTEN_KEEPALIVE unsigned web_save_revision(void) {
  return core ? webSaveWatches[webSelected].revision : 0;
}

EMSCRIPTEN_KEEPALIVE int web_save_pending(void) {
  if (!core) return 0;
  uint32_t* age;
  uint32_t frame;
  int* dirty = web_save_dirty(core, &age, &frame);
  if (*dirty) return 1;
  if (core->platform(core) == mPLATFORM_GBA) {
    struct GBA* gba = core->board;
    struct GBASavedata* data = &gba->memory.savedata;
    if (mTimingIsScheduled(&gba->timing, &data->dust)) return 1;
    if (data->type == GBA_SAVEDATA_FLASH512 || data->type == GBA_SAVEDATA_FLASH1M) {
      return data->flashState != FLASH_STATE_RAW || data->command == FLASH_COMMAND_PROGRAM ||
        data->command == FLASH_COMMAND_ERASE || data->command == FLASH_COMMAND_SWITCH_BANK;
    }
    if (data->type == GBA_SAVEDATA_EEPROM || data->type == GBA_SAVEDATA_EEPROM512) {
      return data->command == EEPROM_COMMAND_PENDING || data->command == EEPROM_COMMAND_WRITE;
    }
  }
  return 0;
}
