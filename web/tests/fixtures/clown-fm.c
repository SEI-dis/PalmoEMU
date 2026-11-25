// SPDX-License-Identifier: AGPL-3.0-or-later
// Compile with undefined-behaviour/bounds sanitizers against the pinned core.
// Invalid YM2612 channel-6 addresses must be ignored before pointer formation.
#include <assert.h>
#include <string.h>
#include "fm.h"
int main(void) {
    FM fm;
    FM_ChannelMetadata before[FM_TOTAL_CHANNELS];
    const unsigned registers[] = {0x33,0x43,0x53,0x63,0x73,0x83,0x93,0xA3,0xB3};
    memset(&fm,0,sizeof(fm));
    FM_Initialise(&fm);
    memcpy(before,fm.state.channels,sizeof(before));
    for (unsigned i=0;i<sizeof(registers)/sizeof(registers[0]);i++) {
        FM_DoAddress(&fm,1,registers[i]);
        FM_DoData(&fm,0xFF);
        assert(memcmp(before,fm.state.channels,sizeof(before))==0);
    }
    FM_DoAddress(&fm,1,0xB6); // Valid channel 5, stereo panning.
    FM_DoData(&fm,0xC0);
    assert(fm.state.channels[5].pan_left && fm.state.channels[5].pan_right);
    return 0;
}
