// SPDX-License-Identifier: AGPL-3.0-or-later
// Read the core's serialized hardware state without extending its state ABI.
#include "MMU.h"
extern "C" int local_lid_closed(void) { return (MMU.ARM7_REG[0x136] & 0x80) != 0; }
