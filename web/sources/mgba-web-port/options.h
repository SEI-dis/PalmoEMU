/* SPDX-License-Identifier: MPL-2.0
 * Modified 2026-10-13: optional CPU clock and local cartridge sensors.
 * mGBA peripheral interfaces and GBA_LUX_LEVELS: Jeffrey Pfau and contributors.
 */
#include <mgba/gba/interface.h>
#include <mgba/internal/gba/cart/gpio.h>
static int32_t tiltX, tiltY, gyroZ;
static unsigned sunlight;
static int32_t readTiltX(struct mRotationSource* source) { return tiltX; }
static int32_t readTiltY(struct mRotationSource* source) { return tiltY; }
static int32_t readGyroZ(struct mRotationSource* source) { return gyroZ; }
static uint8_t readSunlight(struct GBALuminanceSource* source) {
  return sunlight ? 0xFF - GBA_LUX_LEVELS[sunlight - 1] : 0xFF;
}
static struct mRotationSource rotation = { .readTiltX=readTiltX, .readTiltY=readTiltY, .readGyroZ=readGyroZ };
static struct GBALuminanceSource luminance = { .readLuminance=readSunlight };
static void web_options_init(void) {
  tiltX=tiltY=gyroZ=0; sunlight=0;
  core->setPeripheral(core,mPERIPH_ROTATION,&rotation);
  if(core->platform(core)==mPLATFORM_GBA)core->setPeripheral(core,mPERIPH_GBA_LUMINANCE,&luminance);
}
EMSCRIPTEN_KEEPALIVE int web_overclock(int multiplier) {
  if(!core||core->platform(core)!=mPLATFORM_GBA)return 0;
  if(multiplier!=1&&multiplier!=2&&multiplier!=4&&multiplier!=8)return 0;
  GBASetOverclock(core->board,linkActive?1:multiplier);return 1;
}
EMSCRIPTEN_KEEPALIVE void web_sensors(int32_t x,int32_t y,int32_t z,unsigned light) {
  tiltX=x;tiltY=y;gyroZ=z;sunlight=light<=10?light:10;
}
