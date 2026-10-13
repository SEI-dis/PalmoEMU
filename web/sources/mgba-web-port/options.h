/* SPDX-License-Identifier: MPL-2.0
 * Modified 2026-10-13: optional CPU clock, local cartridge sensors,
 * game-clock offset and opt-in gamepad rumble output.
 * mGBA peripheral interfaces and GBA_LUX_LEVELS: Jeffrey Pfau and contributors.
 */
#include <mgba/gba/interface.h>
#include <mgba/internal/gba/cart/gpio.h>
#include <math.h>
/* Each linked GB has independent peripherals. Callbacks use their owner,
 * because the lockstep scheduler runs both cores inside one exported call. */
static struct WebOptions {
  int32_t tiltX, tiltY, gyroZ;
  unsigned sunlight;
  struct mRumbleIntegrator rumble;
  bool rumbleEnabled;
  float rumbleStrength;
  struct mRotationSource rotation;
  struct GBALuminanceSource luminance;
} webOptions[2];
#define WEB_OWNER(source, member) ((struct WebOptions*)((char*)(source)-offsetof(struct WebOptions, member)))
static void updateRumble(struct mRumbleIntegrator* source, float value) {
  struct WebOptions* o=WEB_OWNER(source,rumble);
  o->rumbleStrength = o->rumbleEnabled && isfinite(value) ? fmaxf(0.0f, fminf(1.0f, value)) : 0.0f;
}
static int32_t readTiltX(struct mRotationSource* source) { return WEB_OWNER(source,rotation)->tiltX; }
static int32_t readTiltY(struct mRotationSource* source) { return WEB_OWNER(source,rotation)->tiltY; }
static int32_t readGyroZ(struct mRotationSource* source) { return WEB_OWNER(source,rotation)->gyroZ; }
static uint8_t readSunlight(struct GBALuminanceSource* source) {
  unsigned sunlight=WEB_OWNER(source,luminance)->sunlight;
  return sunlight ? 0xFF - GBA_LUX_LEVELS[sunlight - 1] : 0xFF;
}
static void web_options_init(void) {
  struct WebOptions* o=&webOptions[webSelected];
  memset(o,0,sizeof(*o));
  o->rotation=(struct mRotationSource){ .readTiltX=readTiltX, .readTiltY=readTiltY, .readGyroZ=readGyroZ };
  o->luminance.readLuminance=readSunlight;
  mRumbleIntegratorInit(&o->rumble);
  o->rumble.setRumble=updateRumble;
  core->setPeripheral(core,mPERIPH_ROTATION,&o->rotation);
  core->setPeripheral(core,mPERIPH_RUMBLE,&o->rumble.d);
  if(core->platform(core)==mPLATFORM_GBA)core->setPeripheral(core,mPERIPH_GBA_LUMINANCE,&o->luminance);
}
EMSCRIPTEN_KEEPALIVE int web_overclock(int multiplier) {
  if(!core||core->platform(core)!=mPLATFORM_GBA)return 0;
  if(multiplier!=1&&multiplier!=2&&multiplier!=4&&multiplier!=8)return 0;
  GBASetOverclock(core->board,linkActive?1:multiplier);return 1;
}
EMSCRIPTEN_KEEPALIVE void web_sensors(int32_t x,int32_t y,int32_t z,unsigned light) {
  struct WebOptions* o=&webOptions[webSelected];
  o->tiltX=x;o->tiltY=y;o->gyroZ=z;o->sunlight=light<=10?light:10;
}
/* mode: 0 = real clock, 1 = real clock plus whole seconds (at most ten years).
 * mGBA's existing RTC metadata stores milliseconds; no save/state layout changes.
 * A loaded state restores its RTC mode, so the frontend reapplies game settings.
 */
EMSCRIPTEN_KEEPALIVE int web_rtc_set(int mode, double offsetSeconds) {
  if(!core || (mode!=0 && mode!=1) || !isfinite(offsetSeconds) ||
     trunc(offsetSeconds)!=offsetSeconds || fabs(offsetSeconds)>315576000.0)return 0;
  core->rtc.override=mode ? RTC_WALLCLOCK_OFFSET : RTC_NO_OVERRIDE;
  core->rtc.value=mode ? (int64_t)offsetSeconds * 1000 : 0;
  return 1;
}
EMSCRIPTEN_KEEPALIVE int web_rtc_mode(void) {
  return core && core->rtc.override==RTC_WALLCLOCK_OFFSET ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE double web_rtc_offset(void) {
  return core && core->rtc.override==RTC_WALLCLOCK_OFFSET ? core->rtc.value/1000.0 : 0.0;
}
EMSCRIPTEN_KEEPALIVE int web_rumble_enable(int enable) {
  if(!core || (enable!=0 && enable!=1))return 0;
  /* Output preference must not erase the cartridge's current motor state. */
  struct WebOptions* o=&webOptions[webSelected];
  if(o->rumbleEnabled != !!enable || !enable)o->rumbleStrength=0;
  o->rumbleEnabled=!!enable;
  return 1;
}
EMSCRIPTEN_KEEPALIVE float web_rumble_strength(void) {
  struct WebOptions* o=&webOptions[webSelected];
  return core && o->rumbleEnabled ? o->rumbleStrength : 0.0f;
}
