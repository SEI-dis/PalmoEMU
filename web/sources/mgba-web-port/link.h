/* SPDX-License-Identifier: MPL-2.0
 * Browser callbacks for the Celio hooks in mGBA celio edition.
 * Modified for this Web port on 2026-10-08. No network or file access here.
 */
#include <mgba/core/interface.h>
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/io.h>

static bool linkActive;
static bool linkCallbacksAdded;
static struct mSioMask linkMask;
static struct mSioMask* previousMask;
EM_JS(void, web_link_event, (int kind), {
  if (Module['webLinkEvent']) Module['webLinkEvent'](kind);
});
static void linkRead(void* ctx) { if (linkActive) web_link_event(0); }
static void linkVblank(void* ctx) { if (linkActive) web_link_event(1); }
static void linkTimer(void* ctx) { if (linkActive) web_link_event(2); }

EMSCRIPTEN_KEEPALIVE int web_link_enable(int enable) {
  if (!core || core->platform(core) != mPLATFORM_GBA) return 0;
  struct GBA* gba = core->board;
  if (!!enable == linkActive) return 1;
  if (enable) {
    GBASetOverclock(gba,1);
    if (!linkCallbacksAdded) {
      struct mCoreCallbacks callbacks = {0};
      callbacks.vblankIRQ = linkVblank;
      callbacks.timer3IRQ = linkTimer;
      core->addCoreCallbacks(core, &callbacks);
      linkCallbacksAdded = true;
    }
    previousMask = gba->sioMask;
    linkMask.mask = 0xFFFF;
    gba->sioMask = &linkMask;
    gba->sioReadHook = linkRead;
    gba->sioReadHookContext = NULL;
    linkActive = true;
  } else {
    linkActive = false;
    gba->sioMask = previousMask;
    gba->sioReadHook = NULL;
    gba->sioReadHookContext = NULL;
  }
  return 1;
}
EMSCRIPTEN_KEEPALIVE int web_link_read(unsigned port) {
  if (!linkActive) return 0;
  struct GBA* gba = core->board;
  switch (port) {
    case 0x12A: case 0x200: case 0x202: return gba->memory.io[port >> 1];
    default: return 0;
  }
}
EMSCRIPTEN_KEEPALIVE void web_link_write(unsigned port, unsigned value) {
  if (!linkActive) return;
  struct GBA* gba = core->board;
  switch (port) {
    case 0x120: case 0x122: case 0x124: case 0x126: case 0x202:
      gba->memory.io[port >> 1] = value; break;
    case 0x10C: case 0x10E: GBAIOWrite(gba, port, value); break;
  }
}
EMSCRIPTEN_KEEPALIVE void web_link_mask(unsigned mask) {
  if (linkActive && (mask == 0x600B || mask == 0x601F)) linkMask.mask = mask;
}
