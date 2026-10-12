// SPDX-License-Identifier: AGPL-3.0-or-later
// System-specific control contracts. Artwork is original, not a bundled skin.
import {tr} from './i18n/index.js';
export const builtins=[['classic',tr('機種標準')],['purple',tr('パープル')],['graphite',tr('グラファイト')],['mint',tr('ミント')],['sunset',tr('サンセット')]];
const theme=(light,face,edge,dark,ink,accent)=>({light,face,edge,dark,ink,accent});
const palettes={
 purple:theme('#d0c8fa','#9383d0','#55437e','#2c2346','#292039','#c8b2ff'),
 graphite:theme('#9facbb','#566374','#303c4b','#161f2b','#f1f4f6','#a9d2ec'),
 mint:theme('#dcf0df','#9bc7b7','#528878','#2b5048','#233e37','#b6ffdc'),
 sunset:theme('#ffe0c3','#dfa58f','#a06760','#603c3e','#4d2629','#ffdbc0')
};
export const skinProfiles={
 gb:{name:tr('GB ポケット'),mark:'POCKET / MONO',design:'pocket',ratio:160/144,faces:'diagonal',wing:140,controlsHeight:284,mainY:58,
  description:tr('正方形に近い画面、斜めのA/B、十字キー。落ち着いたグレーと深い赤の携帯機スタイル。'),
  classic:theme('#eeeee4','#c7c9bf','#96998e','#404840','#303832','#8b354f'),buttons:{a:'#9b3050',b:'#9b3050'}},
 gbc:{name:tr('GBC クリア'),mark:'POCKET / COLOR',design:'clear',ratio:160/144,faces:'diagonal',wing:140,controlsHeight:284,mainY:58,
  description:tr('色付きのクリアケースをイメージした携帯機スタイル。斜めのA/Bと大きい十字キー。'),
  classic:theme('#c5b5ef','#8976be','#584778','#322942','#ece8f6','#d1b7ff'),buttons:{a:'#46404f',b:'#46404f'}},
 gba:{name:tr('GBA ワイド'),mark:'ADVANCE / WIDE',design:'advance',ratio:3/2,faces:'diagonal',wing:140,shoulders:true,controlsHeight:324,mainY:100,
  description:tr('横長の3:2画面、斜めのA/Bと独立したL/R。丸みのあるワイド携帯機スタイル。'),
  classic:palettes.purple,buttons:{a:'#57566b',b:'#57566b'}},
 nes:{name:tr('FC クラシック'),mark:'8-BIT / CLASSIC',design:'classic',ratio:4/3,faces:'horizontal',wing:140,controlsHeight:270,mainY:48,
  description:tr('横並びのB/A、十字キー、SELECT/START。クリーム色と赤のシンプルな2ボタン構成。'),
  classic:theme('#fff7df','#e1d9bf','#b4a88a','#6e2633','#582b32','#a52d43'),buttons:{a:'#c13248',b:'#c13248'}},
 snes:{name:tr('SFC カラー'),mark:'16-BIT / FOUR',design:'four',ratio:4/3,faces:'diamond',wing:148,shoulders:true,controlsHeight:324,mainY:100,
  description:tr('青X・緑Y・赤A・黄Bをひし形に配置。L/Rも独立した4ボタン構成。'),
  classic:theme('#f1f1f5','#c6c8cf','#999ca8','#464954','#353844','#787d96'),buttons:{x:'#397ec4',y:'#259a6b',a:'#cf4552',b:'#e1b943'}},
 md:{name:tr('MD 6ボタン'),mark:'16-BIT / SIX',design:'six',ratio:4/3,faces:'six',wing:156,controlsHeight:304,mainY:76,
  description:tr('大きいA/B/Cと小さいX/Y/Zを2段に配置。MODE/STARTと丸い十字キーを備えた6ボタン構成。'),
  classic:theme('#44484f','#25282e','#15171d','#08090d','#d5d8df','#7e98c2'),buttons:{a:'#494e58',b:'#494e58',c:'#494e58',x:'#8b91a0',y:'#8b91a0',z:'#8b91a0'}}
};
export const skinProfile=system=>skinProfiles[system]||skinProfiles.gba;
export const skinTheme=(system,palette)=>palettes[palette]||skinProfile(system).classic;
// These profiles recolor the case; the NDS artwork has a fixed body color.
export const builtinColors=system=>Object.hasOwn(skinProfiles,system)?builtins:[];
