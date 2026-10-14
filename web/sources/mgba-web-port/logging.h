/* SPDX-License-Identifier: MPL-2.0
 * Browser logging policy, 2026-10-14.
 * Suppress instruction/DMA traces before formatting or crossing into JS.
 * The upstream Web bridge uses a quiet native logger; this port retains a
 * bounded set of engine warnings/errors and never suppresses fatal messages.
 */
#include <mgba/core/log.h>

#define WEB_LOG_LIMIT 8
static unsigned webLogCount;

static void web_log(struct mLogger* logger, int category, enum mLogLevel level,
                    const char* format, va_list args) {
  (void)logger;
  if (!(level & (mLOG_FATAL | mLOG_ERROR | mLOG_WARN))) return;
  if (!(level & mLOG_FATAL)) {
    if (webLogCount >= WEB_LOG_LIMIT) return;
    ++webLogCount;
  }
  fprintf(stderr, "%s: ", mLogCategoryName(category));
  vfprintf(stderr, format, args);
  fputc('\n', stderr);
}

static struct mLogger webLogger = {.log = web_log};

static void web_log_init(void) {
  webLogCount = 0;
  mLogSetDefaultLogger(&webLogger);
}
