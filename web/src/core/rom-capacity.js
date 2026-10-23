// SPDX-License-Identifier: AGPL-3.0-or-later
// Reviewed ROM capacities, independent of save/state sizes and WASM heap limits.
const MiB=1048576;
export const standardGBAROMBytes=32*MiB;
export const mgbaMaxROMBytes=128*MiB;
// Retained for consumers identifying the reviewed 128 MiB boundary.
export const futureGBAROMBytes=128*MiB;
export const defaultMaxROMBytes=64*MiB;
export const ndsMaxROMBytes=512*MiB;
export const development3DSMaxROMBytes=4096*MiB;
const systems=Object.freeze({gba:mgbaMaxROMBytes,gb:defaultMaxROMBytes,gbc:defaultMaxROMBytes,nes:defaultMaxROMBytes,snes:defaultMaxROMBytes,md:defaultMaxROMBytes,nds:ndsMaxROMBytes,'3ds':development3DSMaxROMBytes});
export function maxROMBytes(system){return Object.hasOwn(systems,system)?systems[system]:0;}
export function isROMSizeSupported(size,maxBytes){return Number.isSafeInteger(size)&&size>0&&Number.isSafeInteger(maxBytes)&&size<=maxBytes;}
export function supportsROMSize(system,size){return isROMSizeSupported(size,maxROMBytes(system));}

// Work budgets are separate: a future core capacity increase must not silently
// increase ZIP expansion or simultaneous patch source/result allocations.
export const maxROMZipSize=576*MiB;
export const maxROMZipExpandedSize=512*MiB;
export const patchMaxROMBytes=64*MiB;
export const patchMaxFileBytes=64*MiB;
