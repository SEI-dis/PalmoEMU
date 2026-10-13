// SPDX-License-Identifier: AGPL-3.0-or-later
#include "NDS.h"
extern "C" int local_lid_closed(void) { return NDS::IsLidClosed(); }
