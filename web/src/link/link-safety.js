// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep the last durable state outside the transport. No network API.
import {tr} from '../i18n/index.js';
export class LinkSafety {
  constructor(protection,core){this.protection=protection;this.core=core;}
  async begin(){
    this.core.pause(true);
    const {recovery}=await this.protection.save(this.core,{checkpoint:true,reason:'before-link'});
    if(!recovery)throw new Error(tr('通信前のバックアップを保存できませんでした。'));
    this.backup=recovery;
  }
  async finish(keep){
    this.core.pause(true);
    if(!keep)await this.protection.restoreState(this.core,this.backup);
    await this.protection.save(this.core,{checkpoint:true,reason:keep?'link-complete':'link-rollback'});
  }
}
