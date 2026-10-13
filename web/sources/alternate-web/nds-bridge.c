// SPDX-License-Identifier: AGPL-3.0-or-later
// NDS adapter derived from ../libretro-web/bridge.c. Modified 2026-10-09.
// Fixed native resolution, touch pointer and optional render skipping.
// Modified 2026-10-13: boot-time firmware language and microphone simulation
// through melonDS 0.9.3's public libretro L2 / Blow Noise interface.
#include <emscripten.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdio.h>
#include "libretro.h"
#define EXPORT EMSCRIPTEN_KEEPALIVE
static uint32_t pixels[1024*512];
static int16_t audio[16384*2];
static unsigned width=256,height=240,format=RETRO_PIXEL_FORMAT_0RGB1555,keys,audio_frames;
static struct retro_system_av_info av;
static bool loaded,initialized,options_changed;
static bool blowing;
static const char *firmware_language;
static const char *languages[]={"Japanese","English","French","German","Italian","Spanish"};
static int16_t touch_x,touch_y;static bool touching;static unsigned frame_serial;
static void *rom,*snapshot;
static struct retro_game_info game;
static size_t snapshot_size;
static struct {char *key,*value;} vars[256];
static unsigned var_count;
static void logger(enum retro_log_level level,const char *fmt,...) {(void)level;(void)fmt;}
static void variable(const char *key,const char *value){
 if(var_count>=256||!key||!value)return;
 for(unsigned i=0;i<var_count;i++)if(!strcmp(vars[i].key,key)){free(vars[i].value);vars[i].value=strdup(value);return;}
 vars[var_count].key=strdup(key);vars[var_count].value=strdup(value);var_count++;
}
static bool environment(unsigned cmd,void *data){
 switch(cmd){
 case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: format=*(unsigned*)data;return format<=RETRO_PIXEL_FORMAT_RGB565;
 case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool*)data=true;return true;
 case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:case RETRO_ENVIRONMENT_GET_CORE_ASSETS_DIRECTORY: *(const char**)data="/";return true;
 case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback*)data)->log=logger;return true;
 case RETRO_ENVIRONMENT_GET_VARIABLE:{struct retro_variable *v=data;for(unsigned i=0;i<var_count;i++)if(!strcmp(v->key,vars[i].key)){v->value=vars[i].value;return true;}v->value=NULL;return false;}
 case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:*(bool*)data=options_changed;options_changed=false;return true;
 case RETRO_ENVIRONMENT_SET_VARIABLES:{const struct retro_variable *v=data;for(;v&&v->key;v++){const char *start=strstr(v->value,"; ");if(!start)continue;char *value=strdup(start+2),*end=strchr(value,'|');if(end)*end=0;variable(v->key,!strcmp(v->key,"melonds_touch_mode")?"Touch":!strcmp(v->key,"melonds_screen_layout")?"Top/Bottom":!strcmp(v->key,"melonds_language")&&firmware_language?firmware_language:!strcmp(v->key,"melonds_mic_input")?"Blow Noise":value);free(value);}return true;}
 case RETRO_ENVIRONMENT_GET_LANGUAGE:*(unsigned*)data=RETRO_LANGUAGE_ENGLISH;return true;
 case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:return true;
 case RETRO_ENVIRONMENT_SET_GEOMETRY:av.geometry=*(struct retro_game_geometry*)data;return true;
 case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO:av=*(struct retro_system_av_info*)data;return true;
 default:return false;
 }
}
static void video_callback(const void *data,unsigned w,unsigned h,size_t pitch){
 if(!data||data==RETRO_HW_FRAME_BUFFER_VALID||!w||!h||w>1024||h>512)return;
 width=w;height=h;frame_serial++;
 for(unsigned y=0;y<h;y++)for(unsigned x=0;x<w;x++){
  uint32_t p,r,g,b;const unsigned char *row=(const unsigned char*)data+y*pitch;
  if(format==RETRO_PIXEL_FORMAT_XRGB8888){memcpy(&p,row+x*4,4);r=p>>16&255;g=p>>8&255;b=p&255;}
  else {uint16_t s;memcpy(&s,row+x*2,2);if(format==RETRO_PIXEL_FORMAT_RGB565){r=(s>>11)*255/31;g=(s>>5&63)*255/63;b=(s&31)*255/31;}else{r=(s>>10&31)*255/31;g=(s>>5&31)*255/31;b=(s&31)*255/31;}}
  pixels[y*w+x]=r|(g<<8)|(b<<16)|0xff000000;
 }
}
static size_t audio_batch(const int16_t *data,size_t frames){size_t n=frames;if(n>16384-audio_frames)n=16384-audio_frames;memcpy(audio+audio_frames*2,data,n*4);audio_frames+=n;return frames;}
static void audio_sample(int16_t l,int16_t r){int16_t data[2]={l,r};audio_batch(data,1);}
static void input_poll(void){}
static int16_t input_state(unsigned port,unsigned device,unsigned index,unsigned id){if(port||index)return 0;if(device==RETRO_DEVICE_POINTER){if(id==RETRO_DEVICE_ID_POINTER_PRESSED)return touching;if(id==RETRO_DEVICE_ID_POINTER_X)return touch_x;if(id==RETRO_DEVICE_ID_POINTER_Y)return touch_y;return 0;}if(device!=RETRO_DEVICE_JOYPAD)return 0;if(id==RETRO_DEVICE_ID_JOYPAD_L2)return blowing;return id<16?!!(keys&(1u<<id)):0;}
EXPORT void web_close(void){blowing=false;if(loaded)retro_unload_game();if(initialized)retro_deinit();loaded=initialized=false;free(rom);rom=NULL;free(snapshot);snapshot=NULL;snapshot_size=0;for(unsigned i=0;i<var_count;i++){free(vars[i].key);free(vars[i].value);}var_count=0;}
/* -1 preserves the upstream English default. The setting is captured before
 * the core creates firmware; changing it cannot reset an active game. */
EXPORT int web_set_language(int language){if(initialized||language < -1||language > 5)return 0;firmware_language=language<0?NULL:languages[language];return 1;}
EXPORT void web_blow(int enabled){blowing=loaded&&enabled!=0;}
EXPORT int web_load(const void *data,size_t size){
 web_close();format=RETRO_PIXEL_FORMAT_0RGB1555;audio_frames=0;keys=0;
 retro_set_environment(environment);retro_set_video_refresh(video_callback);retro_set_audio_sample(audio_sample);retro_set_audio_sample_batch(audio_batch);retro_set_input_poll(input_poll);retro_set_input_state(input_state);retro_init();initialized=true;
 if(size<512||size>512*1024*1024)return 0;
 rom=malloc(size);if(!rom)return 0;memcpy(rom,data,size);
 game=(struct retro_game_info){"/game.nds",rom,size,NULL};
 loaded=retro_load_game(&game);if(!loaded)return 0;
 retro_set_controller_port_device(0,RETRO_DEVICE_JOYPAD);retro_get_system_av_info(&av);width=av.geometry.base_width;height=av.geometry.base_height;return 1;
}
EXPORT void web_frame(unsigned mask){keys=mask;audio_frames=0;if(loaded)retro_run();}
EXPORT unsigned web_width(void){return width;} EXPORT unsigned web_height(void){return height;}
EXPORT const void *web_pixels(void){return pixels;}
EXPORT double web_fps(void){return av.timing.fps>0?av.timing.fps:60;}
EXPORT double web_audio_rate(void){return av.timing.sample_rate>0?av.timing.sample_rate:48000;}
EXPORT unsigned web_audio_read(void){return audio_frames;} EXPORT const void *web_audio(void){return audio;}
EXPORT size_t web_state_export(void){size_t n=retro_serialize_size();if(!n||n>64*1024*1024)return 0;if(n!=snapshot_size){void *next=realloc(snapshot,n);if(!next)return 0;snapshot=next;snapshot_size=n;}return retro_serialize(snapshot,n)?n:0;}
EXPORT void *web_state_data(void){return snapshot;}
EXPORT int web_state_import(const void *data,size_t size){blowing=false;return loaded&&size==retro_serialize_size()&&retro_unserialize(data,size);}
EXPORT void web_reset(void){blowing=false;if(loaded)retro_reset();}
// The upstream cheat reset is not implemented; keep cheats disabled in this port.
EXPORT void web_cheat_reset(void){}
EXPORT void web_cheat_set(unsigned index,int enabled,const char *code){(void)index;(void)enabled;(void)code;}

EXPORT void web_touch(int x,int y,int pressed){touch_x=x;touch_y=y;touching=pressed!=0;}
EXPORT unsigned web_frame_serial(void){return frame_serial;}
EXPORT void web_render_limit(int enabled){variable("desmume_frameskip",enabled?"1":"0");options_changed=true;}
