// SPDX-License-Identifier: AGPL-3.0-or-later
// Floating communication controls and save ownership; transports do not access storage.
import {tr} from './i18n/index.js';
import {RoomLink} from './room-link.js';
import {diagnostics} from './diagnostics.js';
import {DirectLink} from './direct-link.js';
import {LinkSafety} from './link-safety.js';
import {SaveProtection} from './save-safety.js';
import {LocalLinkCore} from './local-link-core.js';
import {saveLinkPair,secondPlayerGame} from './local-link-save.js';
import {MGBACore} from './mgba.js';
import {coreFor} from './core-registry.js';
import {escapeHTML as esc,icon} from './shared.js';
import * as db from './storage.js';
export function createLinkControls({state,setPause,release,applySettings,updateLinkButton,panel,toast,error,exitGame,download}){
  const $=s=>document.querySelector(s);let mode='room';
  const update=text=>{
    state.message=text;const el=$('#link-status');if(el)el.textContent=text;
    const number=$('#link-room-number');if(number&&state.link)number.value=state.link.room||tr('準備中…');
    const copy=$('#link-copy');if(copy)copy.disabled=!state.link?.joined||!!state.link?.closed;
    updateLinkButton();
  };
  async function start(room=''){
    if(state.link||state.starting)return;
    if(mode==='room'&&room!==''&&!/^\d{4}$/.test(room)){toast(tr('4桁の部屋番号を入力してください。'));return;}
    const selected=mode,source=$('#link-2p-source')?.value,file=$('#link-2p-file')?.files[0];
    if(selected==='local'&&source==='file'&&!file){toast(tr('2P用のセーブファイルを選んでください。'));return;}
    if(selected==='local'&&source==='file'&&(!/\.(sav|srm)$/i.test(file.name)||!file.size||file.size>coreFor(state.current).maxSave)){toast(tr('対応する2Pセーブファイル（.sav / .srm）を選んでください。'));return;}
    state.starting=true;
    const core=state.engine,game=state.current,safety=new LinkSafety(state.protection,core);
    let port,secondary,secondaryProtection,paired,n;
    try{
      // Web Serial permission must originate directly from this button gesture.
      if(selected==='usb')port=await navigator.serial.requestPort();
      setPause(true);update(tr('バックアップを保存しています…'));render();
      await safety.begin();if(state.engine!==core||state.current!==game)throw Error(tr('ゲームが変更されました。'));
      if(selected==='local'){
        secondaryProtection=new SaveProtection(()=>{});
        const previous=await secondaryProtection.open(secondPlayerGame(game),coreFor(game).id);
        let save;
        if(source==='file'){
          save=new Uint8Array(await file.arrayBuffer());
        }else if(source==='saved'&&previous.save)save=await secondaryProtection.verify(previous.save);
        const rom=await db.get('roms',game.id);if(!rom)throw Error(tr('ROMが見つかりません。'));
        secondary=new MGBACore(document.createElement('canvas'));await secondary.load(rom);secondary.pause(true);
        if(save)secondary.restore(save);
        paired=new LocalLinkCore(core,secondary);state.engine=paired;
      }
      const callbacks={onClosing:()=>setPause(true),onStatus:text=>{
        if(n.connected&&document.hidden){n.close(tr('画面を離れたため接続を終了しました。'));return;}update(text);
      },onEnd:async(text,{keep})=>{
        setPause(true);state.starting=false;update(tr('通信を終了しています…'));render();
        try{
          if(keep&&paired)await saveLinkPair([state.protection,secondaryProtection],[core,secondary]);
          else {
            await safety.finish(keep);
            if(secondaryProtection)await db.commitProtection(secondaryProtection.storageKey,secondaryProtection.id,null,null,true);
          }
          state.message=text+(keep?'':selected==='usb'?tr(' ブラウザ側を通信前に戻しました。'):tr(' 通信前に戻しました。'));
        }catch(e){state.blocked=true;state.message=tr('復旧を完了できませんでした。保存済みのバックアップを残して終了します。');error(e);}
        finally{
          if(paired){paired.dispose();state.engine=core;if(keep)core.draw();await secondaryProtection.close();}
          if(state.link===n)state.link=null;core.setCheats(game.cheats||[]);applySettings();
        }
        if(state.blocked){const message=state.message;await exitGame();toast(message);return;}
        if(state.current?.system==='gba')render();toast(state.message);
      }};
      n=selected==='room'?new RoomLink(core.linkIO(),callbacks):new DirectLink(paired?[core.linkIO(),secondary.linkIO()]:[core.linkIO()],{...callbacks,port});
      n.kind=selected;n.paired=paired;if(paired)paired.onError=e=>{diagnostics.record(e,'core');n.close(e.message);};state.link=n;core.setCheats([]);applySettings();
      await n.start(room);
      if(!n.closed){state.starting=false;if(!document.hidden)setPause(false);else await n.close(tr('画面を離れたため接続を終了しました。'));render();}
    }catch(e){
      if(n)await n.close(e.message);
      else{
        if(paired){paired.dispose();state.engine=core;core.draw();}else secondary?.close();
        try{if(secondaryProtection?.id)await db.commitProtection(secondaryProtection.storageKey,secondaryProtection.id,null,null,true);}
        catch(cleanupError){error(cleanupError);}
        finally{await secondaryProtection?.close();}
        if(port)try{await port.close();}catch{}
        state.message=e.name==='NotFoundError'?tr('USB機器の選択をキャンセルしました。'):e.message;
        if(e.name!=='NotFoundError')error(e);
      }
    }finally{state.starting=false;updateLinkButton();if(!state.link&&state.current?.system==='gba')render();}
  }
  function render(){
    const active=state.link,body=$('#link-panel-body'),busy=state.starting||active?.closed,disabled=busy?'disabled':'';
    const selected=active?.kind||mode;
    const message=state.message||(selected==='room'?tr('部屋を作るか、相手の部屋に参加します。'):selected==='local'?tr('同じゲームを2台起動し、1P・2Pを切り替えて操作します。'):tr('Celio対応USB変換器と実機の通信ケーブルを接続します。'));
    const tabs=!active?tr`<div class="segmented" aria-label="通信方式">${[['room',tr('オンライン')],['local',tr('この端末で2台')],['usb',tr('USB実機')]].map(([id,label])=>`<button data-link-mode="${id}" aria-pressed="${selected===id}" class="${selected===id?'active':''}" ${disabled}>${label}</button>`).join('')}</div>`:'';
    let controls;
    if(active){
      controls=selected==='room'?tr`<label for="link-room-number">部屋番号</label><div class="link-room-field"><input class="text-input" id="link-room-number" readonly inputmode="none" value="${esc(active.room||tr('準備中…'))}"><button class="link-copy" id="link-copy" aria-label="部屋番号をコピー" ${active.joined&&!active.closed?'':'disabled'}>${icon('copy')}<span>コピー</span></button></div>`:selected==='local'?tr`<div class="segmented" aria-label="操作するプレイヤー">${[0,1].map(i=>`<button data-link-player="${i}" class="${active.paired.view===i?'active':''}" aria-pressed="${active.paired.view===i}" ${disabled}>${i+1}P</button>`).join('')}</div><button class="secondary" id="link-export-2p" ${disabled}>2Pのセーブを書き出す</button>`:tr('<p class="sheet-note">USB実機に接続しています。</p>');
      controls+=tr`<button class="secondary danger" id="link-stop" ${disabled}>通信を中止</button>`;
    }else if(selected==='room')controls=tr`<button class="primary" id="link-create" ${disabled}>部屋を作る</button><label for="link-input">部屋番号で参加</label><div class="link-room-field"><input class="text-input" id="link-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="4桁の番号" ${disabled}><button class="secondary" id="link-join" ${disabled}>参加</button></div>`;
    else if(selected==='local')controls=tr`<label for="link-2p-source">2Pのセーブ</label><select id="link-2p-source" ${disabled}><option value="saved">前回の2Pセーブ（初回は最初から）</option><option value="file">ファイルから読み込む</option><option value="blank">最初から</option></select><input id="link-2p-file" type="file" aria-label="2Pのセーブファイル" hidden ${disabled}><button class="primary" id="link-local-start" ${disabled}>2台で開始</button>`;
    else controls=tr`<p class="sheet-note">${navigator.serial?tr('PCのChrome / Edgeで、対応するUSB変換器を選んで接続します。'):tr('このブラウザはUSB接続に対応していません。PCのChrome / Edgeを使用してください。')}</p><button class="primary" id="link-usb-start" ${busy||!navigator.serial?'disabled':''}>USB機器を選んで接続</button>`;
    body.innerHTML=tr`${tabs}<p id="link-status" role="status">${esc(message)}</p><div class="stack">${controls}</div><p class="sheet-note">${selected==='room'?tr('開始すると中継サーバーに接続します。ROM・セーブファイルは送信しません。'):selected==='local'?tr('端末内だけで通信します。1Pと2Pのセーブは別々です。'):tr('USB変換器へゲームの通信データを送ります。中継サーバーは使いません。')}</p><details class="sheet-note"><summary>通信について</summary><p>パネル上部をドラッグすると移動できます。閉じても通信は続きます。</p><p>Celio方式に対応するGBAゲーム用です。オンラインの相手も同じ中継サーバーを使ってください。部屋番号はパスワードではありません。</p><p>開始前に端末内へバックアップします。切断や中止時は${selected==='usb'?tr('ブラウザ側だけ'):tr('この端末のゲームが')}通信前に戻ります。${selected==='usb'?tr('実機のセーブを戻すことはできません。'):''}両方のゲーム内で通信を終えると結果を保存します。接続後に別のタブやアプリへ移ると切断します。</p><p>端末内通信の2Pには、1Pと同じROMを使います。「最初から」やファイルを選んでも、以前の2Pセーブを置き換えるのは正常終了時だけです。</p><p><a href="privacy.html" target="_blank" rel="noopener">プライバシー</a></p></details>`;
    body.querySelectorAll('[data-link-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.linkMode;state.message='';render();});
    body.querySelectorAll('[data-link-player]').forEach(b=>b.onclick=()=>{release();active.paired.select(Number(b.dataset.linkPlayer));render();});
    if($('#link-create'))$('#link-create').onclick=()=>start('');
    if($('#link-join'))$('#link-join').onclick=()=>{const room=$('#link-input').value.trim();if(!/^\d{4}$/.test(room)){toast(tr('4桁の部屋番号を入力してください。'));return;}return start(room);};
    if($('#link-input'))$('#link-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#link-join').click();}};
    if($('#link-2p-source'))$('#link-2p-source').onchange=e=>{$('#link-2p-file').hidden=e.target.value!=='file';panel.place();};
    if($('#link-local-start'))$('#link-local-start').onclick=()=>start();
    if($('#link-usb-start'))$('#link-usb-start').onclick=()=>start();
    if($('#link-copy'))$('#link-copy').onclick=async()=>{if(!state.link?.joined||state.link.closed)return;try{await navigator.clipboard.writeText(state.link.room);toast(tr('コピーしました。'));}catch{const input=$('#link-room-number');input?.focus();input?.select();toast(tr('部屋番号を選択してコピーしてください。'));}};
    if($('#link-stop'))$('#link-stop').onclick=async()=>{renderClosing();await state.link?.close();};
    if($('#link-export-2p'))$('#link-export-2p').onclick=()=>{try{const bytes=active.paired.cores[1].save();if(!bytes?.length){toast(tr('2Pのゲーム内でセーブしてから書き出してください。'));return;}download(bytes,state.current.name+'-2P.sav');}catch(e){error(e);}};
    updateLinkButton();panel.place();
  }
  function renderClosing(){const button=$('#link-stop');if(button)button.disabled=true;}
  return {render};
}
