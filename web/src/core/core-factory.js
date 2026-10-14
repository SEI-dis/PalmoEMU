// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {MGBACore} from './mgba.js';
import {RetroCore} from './retro.js';
import {NDSCore} from './nds.js';
import {ThreeDSCore} from './three-ds.js';
import {JgenesisCore} from './jgenesis.js';
import {coreFor,supportsGame} from './core-registry.js';
export function createCore(container,game){
 const core=coreFor(game);if(!supportsGame(core,game))throw Error(tr`このROM容量には${core.name}が対応していません。コアを変更してください。`);
 if(core.adapter==='mgba'){const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',game.name);container.append(canvas);return new MGBACore(canvas);}
 if(core.adapter==='nds')return new NDSCore(container);
 if(core.adapter==='3ds')return new ThreeDSCore(container);
 if(core.adapter==='jgenesis')return new JgenesisCore(container);
 return new RetroCore(container);
}
