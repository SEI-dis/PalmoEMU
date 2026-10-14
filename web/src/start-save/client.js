// SPDX-License-Identifier: AGPL-3.0-or-later
import {language,tr} from '../i18n/index.js';
import {runWorkerTask} from '../workers/task.js';
export function startSaveTask(options,onProgress){
 return runWorkerTask(
  ()=>new Worker(new URL('./worker.js',import.meta.url),{type:'module'}),
  {...options,language},
  {onProgress,errorMessage:()=>tr('セーブを変換できませんでした。元のデータは残っています。')},
 );
}
