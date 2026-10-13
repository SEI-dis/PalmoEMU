/* Copyright (c) 2013-2015 Jeffrey Pfau
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Cooperative Web scheduler, modified 2026-10-13 from mGBA's
 * src/platform/qt/MultiplayerController.cpp lockstep cycle accounting.
 * Uses the unmodified GB SIO lockstep driver in the pinned mGBA source.
 * Two independent cores run on one thread; no network, threads or storage.
 */
#include <mgba/internal/gb/gb.h>
#include <mgba/internal/gb/sio/lockstep.h>

static struct GBSIOLockstep webGBLink;
static struct GBSIOLockstepNode webGBNodes[2];
static struct {
  int32_t cycles;
  unsigned waitMask;
  bool awake;
} webGBPlayers[2];
static bool webGBLinked;

/* The internal-clock player can change each transfer. Resolve native node
 * IDs each time, keeping UI player identities and cartridge memory fixed. */
static unsigned web_gb_player(int id) {
  return webGBLink.players[id] == &webGBNodes[1] ? 1 : 0;
}
static bool web_gb_signal(struct mLockstep* link, unsigned mask) {
  unsigned i=web_gb_player(0);
  bool asleep=!webGBPlayers[i].awake;
  webGBPlayers[i].waitMask &= ~mask;
  if (!webGBPlayers[i].waitMask) webGBPlayers[i].awake=true;
  return asleep && webGBPlayers[i].awake;
}
static bool web_gb_wait(struct mLockstep* link, unsigned mask) {
  unsigned i=web_gb_player(0);
  bool awake=webGBPlayers[i].awake;
  webGBPlayers[i].waitMask |= mask;
  webGBPlayers[i].awake=false;
  return awake;
}
static void web_gb_add_cycles(struct mLockstep* link, int id, int32_t cycles) {
  unsigned i=web_gb_player(id ? id : 1);
  webGBPlayers[i].cycles += cycles;
  if (!id) {
    if (!webGBPlayers[i].awake) webGBNodes[i].nextEvent += webGBPlayers[i].cycles;
    webGBPlayers[i].awake=true;
  }
}
static int32_t web_gb_use_cycles(struct mLockstep* link, int id, int32_t cycles) {
  unsigned i=web_gb_player(id);
  webGBPlayers[i].cycles -= cycles;
  if (webGBPlayers[i].cycles<=0) webGBPlayers[i].awake=false;
  return webGBPlayers[i].cycles;
}
static int32_t web_gb_unused_cycles(struct mLockstep* link, int id) {
  return webGBPlayers[web_gb_player(id)].cycles;
}
static void web_gb_unload(struct mLockstep* link, int id) {
  /* Both CPUs are already paused during detach; no thread to wake. */
  webGBPlayers[0].awake=webGBPlayers[1].awake=true;
}
EMSCRIPTEN_KEEPALIVE void web_gb_link_stop(void) {
  if (!webGBLinked) return;
  webGBLinked=false;
  for (unsigned i=0;i<2;++i) {
    struct GB* gb=webContexts[i].machine->board;
    GBSIOSetDriver(&gb->sio,NULL);
  }
  for (unsigned i=0;i<2;++i) GBSIOLockstepDetachNode(&webGBLink,&webGBNodes[i]);
  mLockstepDeinit(&webGBLink.d);
}
EMSCRIPTEN_KEEPALIVE int web_gb_link_start(void) {
  web_store_context();
  if (webGBLinked) return 0;
  for (unsigned i=0;i<2;++i) {
    struct mCore* c=webContexts[i].machine;
    if (!c || c->platform(c)!=mPLATFORM_GB || ((struct GB*)c->board)->sio.driver) return 0;
  }
  memset(&webGBLink,0,sizeof(webGBLink));
  memset(webGBNodes,0,sizeof(webGBNodes));
  memset(webGBPlayers,0,sizeof(webGBPlayers));
  mLockstepInit(&webGBLink.d);GBSIOLockstepInit(&webGBLink);
  webGBLink.d.signal=web_gb_signal;webGBLink.d.wait=web_gb_wait;
  webGBLink.d.addCycles=web_gb_add_cycles;webGBLink.d.useCycles=web_gb_use_cycles;
  webGBLink.d.unusedCycles=web_gb_unused_cycles;webGBLink.d.unload=web_gb_unload;
  for (unsigned i=0;i<2;++i) {
    webGBPlayers[i].awake=true;
    GBSIOLockstepNodeCreate(&webGBNodes[i]);
    if (!GBSIOLockstepAttachNode(&webGBLink,&webGBNodes[i])) return 0;
  }
  for (unsigned i=0;i<2;++i) {
    struct GB* gb=webContexts[i].machine->board;
    GBSIOSetDriver(&gb->sio,&webGBNodes[i].d);
    /* Preserve SB written before the cable was connected. */
    webGBLink.pendingSB[i]=gb->memory.io[1];
  }
  webGBLinked=true;
  return 1;
}
EMSCRIPTEN_KEEPALIVE unsigned web_gb_link_busy(void) {
  if (!webGBLinked) return 0;
  if (webGBLink.d.transferActive!=TRANSFER_IDLE) return 1;
  for (unsigned i=0;i<2;++i) {
    struct GB* gb=webContexts[i].machine->board;
    if (gb->sio.remainingBits || (gb->memory.io[2]&0x80)) return 1;
  }
  return 0;
}
EMSCRIPTEN_KEEPALIVE unsigned web_frame_count(void) { return core ? core->frameCounter(core) : 0; }
EMSCRIPTEN_KEEPALIVE int web_gb_link_frame(unsigned firstKeys, unsigned secondKeys) {
  if (!webGBLinked) return 0;
  struct mCore *a=webContexts[0].machine,*b=webContexts[1].machine;
  uint32_t before[2]={a->frameCounter(a),b->frameCounter(b)};
  a->setKeys(a,firstKeys);b->setKeys(b,secondKeys);
  /* runFrame would wait forever while the other CPU is asleep. runLoop
   * yields at the upstream driver's scheduled serial synchronization event. */
  for (unsigned steps=0;steps<200000;++steps) {
    bool done[2]={a->frameCounter(a)!=before[0],b->frameCounter(b)!=before[1]};
    if (done[0]&&done[1]) return 1;
    bool ran=false;
    for (unsigned n=0;n<2;++n) {
      unsigned i=(steps+n)&1;
      if (!webGBPlayers[i].awake || (done[i]&&webGBPlayers[1-i].awake&&!done[1-i])) continue;
      struct mCore* c=webContexts[i].machine;
      c->runLoop(c);ran=true;
    }
    if (!ran) return -1;
  }
  return -1; /* Bounded failure lets JS pause and restore its durable backup. */
}
