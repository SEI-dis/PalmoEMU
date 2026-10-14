/* Mozilla Public License 2.0; see ../../licenses/mGBA-MPL-2.0.txt. */
#include <emscripten/emscripten.h>
#include <mgba/core/core.h>
#include <mgba/core/cheats.h>
#include <mgba/core/serialize.h>
#include <mgba/internal/gba/savedata.h>
#include <mgba-util/audio-buffer.h>
#include <mgba-util/image.h>
#include <mgba-util/vfs.h>

/* Two GB CPUs share the native lockstep coordinator, not cartridge memory.
 * Existing exports operate on the selected instance; instance zero remains
 * the default for callers using the original single-core ABI. */
static struct WebContext {
  struct mCore* machine;
  mColor framebuffer[256 * 224];
  void* romData;
  void* saveData;
  void* stateData;
  unsigned w, h;
} webContexts[2];
static unsigned webSelected;
static struct mCore* core;
static mColor* pixels = webContexts[0].framebuffer;
static void *rom, *save, *state;
static unsigned width, height;
static int16_t audio[4096 * 2];
static void web_store_context(void) {
  struct WebContext* c = &webContexts[webSelected];
  c->machine=core; c->romData=rom; c->saveData=save; c->stateData=state;
  c->w=width; c->h=height;
}
EMSCRIPTEN_KEEPALIVE int web_select(unsigned instance) {
  if (instance > 1) return 0;
  web_store_context();
  webSelected = instance;
  struct WebContext* c = &webContexts[instance];
  core=c->machine; pixels=c->framebuffer; rom=c->romData;
  save=c->saveData; state=c->stateData; width=c->w; height=c->h;
  return 1;
}
/* 16 MiB extra RAM + 6 MiB flash + core/RTC metadata. */
#define WEB_STATE_LIMIT (32 * 1024 * 1024)
#ifdef GBA_SIZE_FLASH_EXT
#define WEB_GBA_SAVE_LIMIT (GBA_SIZE_FLASH_EXT + sizeof(struct GBASavedataRTCBuffer))
#else
#define WEB_GBA_SAVE_LIMIT (1024 * 1024)
#endif
#include "link.h"
#include "options.h"
#include "gb-link.h"
#include "save-watch.h"

EMSCRIPTEN_KEEPALIVE void web_close(void) {
  web_gb_link_stop();
  if (core) {
    web_link_enable(0);
    linkCallbacksAdded = false;
    mCoreConfigDeinit(&core->config);
    core->deinit(core);
    core = NULL;
  }
  free(rom); rom = NULL;
  free(save); save = NULL;
  free(state); state = NULL;
  webSaveWatches[webSelected] = (struct WebSaveWatch){0};
}

EMSCRIPTEN_KEEPALIVE int web_load(const void* data, size_t size) {
  if (!data || !size || size > 64 * 1024 * 1024) return 0;
  web_close();
  rom = malloc(size);
  if (!rom) return 0;
  memcpy(rom, data, size);
  struct VFile* vf = VFileFromMemory(rom, size);
  if (!vf) { web_close(); return 0; }
  core = mCoreFindVF(vf);
  if (!core) { vf->close(vf); web_close(); return 0; }
  if (!core->init(core)) { free(core); core = NULL; vf->close(vf); web_close(); return 0; }
  mCoreInitConfig(core, "web");
  /* Preserve hardware CPU timing and browser workload; fast-forward is separate. */
  mCoreConfigSetIntValue(&core->config, "overclock", 1);
  core->opts.volume = 256;
  core->opts.useBios = false;
  core->opts.skipBios = true;
  core->loadConfig(core, &core->config);
  core->setVideoBuffer(core, pixels, 256);
  core->setAudioBufferSize(core, 4096);
  if (!core->loadROM(core, vf)) { vf->close(vf); web_close(); return 0; }
  web_options_init();
  core->reset(core);
  web_save_watch_init();
  core->currentVideoSize(core, &width, &height);
  return 1;
}
EMSCRIPTEN_KEEPALIVE unsigned web_width(void) { return width; }
EMSCRIPTEN_KEEPALIVE unsigned web_height(void) { return height; }
EMSCRIPTEN_KEEPALIVE void* web_pixels(void) { return pixels; }
/* Pack the renderer's padded RGB rows for Canvas without changing core pixels. */
EMSCRIPTEN_KEEPALIVE void* web_rgba_pixels(void) {
  static uint32_t rgba[256 * 224];
  for (unsigned y = 0; y < height; ++y) {
    for (unsigned x = 0; x < width; ++x) {
      rgba[y * width + x] = pixels[y * 256 + x] | 0xFF000000u;
    }
  }
  return rgba;
}

EMSCRIPTEN_KEEPALIVE void web_frame(unsigned keys) {
  if (!core) return;
  core->setKeys(core, keys);
  core->runFrame(core);
}
EMSCRIPTEN_KEEPALIVE void web_reset(void) { if (core) { core->reset(core); web_save_watch_baseline(); } }
EMSCRIPTEN_KEEPALIVE double web_fps(void) { return core ? (double) core->frequency(core) / core->frameCycles(core) : 60; }
EMSCRIPTEN_KEEPALIVE unsigned web_audio_rate(void) { return core ? core->audioSampleRate(core) : 32768; }
EMSCRIPTEN_KEEPALIVE void* web_audio(void) { return audio; }
EMSCRIPTEN_KEEPALIVE size_t web_audio_read(void) { return core ? mAudioBufferRead(core->getAudioBuffer(core), audio, 4096) : 0; }
EMSCRIPTEN_KEEPALIVE size_t web_save_export(void) {
  free(save); save = NULL;
  return core ? core->savedataClone(core, &save) : 0;
}
EMSCRIPTEN_KEEPALIVE void* web_save_data(void) { return save; }
EMSCRIPTEN_KEEPALIVE size_t web_save_limit(void) { return core && core->platform(core) == mPLATFORM_GBA ? WEB_GBA_SAVE_LIMIT : 1024 * 1024; }
EMSCRIPTEN_KEEPALIVE int web_save_import(const void* data, size_t size) {
  int ok = core && data && size && size <= web_save_limit() && core->savedataRestore(core, data, size, false);
  if (ok) web_save_watch_baseline();
  return ok;
}

/* Sets belong to the core and are discarded when another ROM is loaded. */
EMSCRIPTEN_KEEPALIVE int web_platform(void) { return core ? core->platform(core) : -1; }
EMSCRIPTEN_KEEPALIVE int web_cheat_add(const char* name, const char* codes, int type) {
  if (!core || !codes || !*codes || strlen(codes) > 16384) return -1000;
  struct mCheatDevice* device = core->cheatDevice(core);
  if (!device || mCheatSetsSize(&device->cheats) >= 100) return -1000;
  struct mCheatSet* set = device->createSet(device, name);
  char* text = strdup(codes);
  if (!set || !text) { if (set) mCheatSetDeinit(set); free(text); return -1000; }
  char* line = text;
  int number = 0, count = 0;
  while (line) {
    ++number;
    char* next = strchr(line, '\n');
    if (next) *next++ = 0;
    while (*line && isspace((unsigned char)*line)) ++line;
    size_t length = strlen(line);
    while (length && isspace((unsigned char)line[length - 1])) line[--length] = 0;
    if (length) {
      if (!mCheatAddLine(set, line, type)) { free(text); mCheatSetDeinit(set); return -number; }
      ++count;
    }
    line = next;
  }
  free(text);
  if (!count) { mCheatSetDeinit(set); return -1000; }
  mCheatAddSet(device, set);
  mCheatRefresh(device, set);
  return (int)mCheatSetsSize(&device->cheats) - 1;
}
EMSCRIPTEN_KEEPALIVE int web_cheat_enable(unsigned index, int enabled) {
  if (!core) return 0;
  struct mCheatDevice* device = core->cheatDevice(core);
  if (!device || index >= mCheatSetsSize(&device->cheats)) return 0;
  struct mCheatSet* set = *mCheatSetsGetPointer(&device->cheats, index);
  set->enabled = !!enabled;
  mCheatRefresh(device, set);
  return 1;
}
EMSCRIPTEN_KEEPALIVE int web_cheat_remove(unsigned index) {
  if (!core) return 0;
  struct mCheatDevice* device = core->cheatDevice(core);
  if (!device || index >= mCheatSetsSize(&device->cheats)) return 0;
  struct mCheatSet* set = *mCheatSetsGetPointer(&device->cheats, index);
  set->enabled = false;
  mCheatRefresh(device, set);
  mCheatRemoveSet(device, set);
  mCheatSetDeinit(set);
  return 1;
}

/* A complete quick state, including save RAM and RTC, stays on this device. */
EMSCRIPTEN_KEEPALIVE size_t web_state_export(void) {
  free(state); state = NULL;
  if (!core) return 0;
  struct VFile* vf = VFileMemChunk(NULL, 0);
  if (!vf) return 0;
  if (!mCoreSaveStateNamed(core, vf, SAVESTATE_SAVEDATA | SAVESTATE_RTC)) { vf->close(vf); return 0; }
  ssize_t size = vf->size(vf);
  if (size <= 0 || size > WEB_STATE_LIMIT) { vf->close(vf); return 0; }
  state = malloc(size);
  if (!state) { vf->close(vf); return 0; }
  vf->seek(vf, 0, SEEK_SET);
  bool ok = vf->read(vf, state, size) == size;
  vf->close(vf);
  if (!ok) { free(state); state = NULL; return 0; }
  return size;
}
EMSCRIPTEN_KEEPALIVE void* web_state_data(void) { return state; }
EMSCRIPTEN_KEEPALIVE int web_state_import(const void* data, size_t size) {
  if (!core || !data || size < core->stateSize(core) || size > WEB_STATE_LIMIT) return 0;
  struct VFile* vf = VFileFromConstMemory(data, size);
  if (!vf) return 0;
  bool ok = mCoreLoadStateNamed(core, vf, SAVESTATE_SAVEDATA | SAVESTATE_RTC);
  vf->close(vf);
  if (ok) web_save_watch_baseline();
  return ok;
}
