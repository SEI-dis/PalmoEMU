# 上流更新の確認

<a id="review-2026-11-25"></a>
## 2026-11-25 — 日次検出とPokemonStart 0.77.0の確認

基準は main `2fad295e4a5218e8004cce392e2da29c07546967`（0.3.42）。通常の配布検証CIは成功しており、11月18日から25日の失敗は日次 `Detect upstream updates` の候補ビルドに限られる。[11月25日の実行](https://github.com/SEI-dis/PalmoEMU/actions/runs/45545631047)ではメタデータ取得は成功し、`version.cmake` の変更を未確認のビルド入力として拒否していた。取得エラーではないため、候補レポートの段階名も `source` から `build-input-policy` へ訂正した。

### mGBAと通信

[採用版b397535から9850760までの比較](https://github.com/pm-start/mGBA_celio_edition/compare/b3975350076fbd3d86e7dc6796cdadb0ccdb9a89...9850760732751080044d05c4846c67edd067791b)は6コミット・13ファイル。README等の文書、Qt版のCelioNetとWindow、作者製ROMテスト・配布補助、版情報の変更であり、Webで使用する実行ソースは変わっていない。`version.cmake` はCelioの版をrom128-2からrom128-6にし、その表示を短いコミット表記にも使う変更。版名だけのためのコア差し替えは行わない。

監視設定へ、採用元・ブランチ・採用SHA・確認先SHA・確認日・この記録への参照を保存した。成功した比較がこの組み合わせに完全一致した場合のみ「確認済み・Web版の変更不要」とし、同じ候補を毎日再ビルドしない。次のコミット、別の採用SHAやブランチ、分岐、取得失敗はこの扱いにならない。`SOURCES.json` の採用SHAを先端に偽装せず、ビルド入力・ライセンスの安全検査も変更しない。手動で同じ候補を指定した場合には、従来どおりビルド入力の確認で止まる。

[mgba-celio-webの23235bc](https://github.com/pm-start/mgba-celio-web/commit/23235bc6db1b67009808c0dc7e1f25131eb75e7a)と[Celio-Serverのf4b92bc](https://github.com/Celio-Link/Celio-Server/commit/f4b92bc64a0064ac0c7f60b606c36b0886064ffb)は0.3.42で確認した版から更新なし。通信実装の本文も照合した。pm-start/mgba-celio-webのfix-celio-batch枝はQt側の変更で、Webの追加移植対象はなかった。既存の2人通信を維持する。今回は公開中継サーバーで実ゲームの交換を再確認したものではない。

### PokemonStartと移行ツール

確認時点の最新版は[0.77.0のREADME](https://github.com/pm-start/PokemonStart/blob/aea68ec6d62f569088d325009efe0c396cb52915/README.md)。公式案内では0.67.xから0.76.0のセーブは変換せず引き継ぎ可能で、0.66.x以前は付属ツールでの移行が必要。0.77.0で保存したデータを古い版へ戻さない条件もある。既存の形式E判定と古いROMへの引き継ぎ拒否はこの境界と整合する。合成ROMの0.76/0.77表記でも、0.71.1からはコピー、0.66.1からは変換、逆方向は拒否し、実行条件を壊したROMは未確認とする。ファイル名の版だけでは互換性を承認しない。

[公式変更履歴](https://github.com/pm-start/PokemonStart/blob/aea68ec6d62f569088d325009efe0c396cb52915/CHANGELOG.md)の0.71.2にはネット交換と2台通信の停止修正、0.73.0にはコピーした同一セーブ同士の交換防止がある。これらはROM側の修正・制約であり、エミュレーターからセーブの識別情報を書き換えて回避しない。

公開ツリーは文書とPKS配布で、移行HTMLの単独配布・GitHub Releasesは見つからなかった。手元の提供ファイルは0.71.1のROMと11月17日のHTMLのまま。現在の変換器は提供済みの41鍵を持ち、未知の鍵を拒否する条件を維持する。今回の版番号付き合成入力は、実際の0.77.0のROM・新HTML・実セーブの検証を代替しない。最新ファイルが提供された時点で鍵・形式・補助情報の変更を照合する。PKSの展開処理やROMは組み込み・再配布していない。

### ほかの採用コア・参考実装

| 対象 | 今回の判断 |
| --- | --- |
| ClownMDEmu | [bank境界](https://github.com/Clownacy/clownmdemu/commit/e26b6d9623e070196fc7970e857d1571edf04994)、[SRAMの有効bit](https://github.com/Clownacy/clownmdemu/commit/159d4440ecd9508e27e8a486b8c8f4b4f9e89e11)、[不正FMチャンネル](https://github.com/Clownacy/clownmdemu/commit/5ed9e36d3bdcc0acbe464164dce7e861dbcd553c)の3修正を採用。現WASM／ソースで旧不具合を再現し、2ファイルだけ移植。元のセーブ・ステート形式を維持。Switch 2・Sega CD・内部再構成は一括移植しない。 |
| FCEUmm | 先端e1630deは既確認範囲と同じ。必要なMapper 176修正は採用済み。 |
| melonDS | 先端4081e83まで確認。[a194603](https://github.com/libretro/melonDS/commit/a1946037278d68527655706f866e29b727fba7fb)のパスだけのROM読み込み・cached_info寿命修正は、static game_infoと終了まで保持するROMバッファを使う現Webブリッジには該当しない。任意の不正ROMすべての安全性を保証する判断ではない。 |
| jgenesis | [c00da91までの差分](https://github.com/jsgroth/jgenesis/compare/fc7374ebaac8ce6d8d13b93c75298e54f4ed9bba...c00da91eaf406d7bef8775a498646b2e2db51d6c)を確認。MDのScooby Doo Mystery表示タイミングとSNESのAPU test-register値は今後の個別互換性改善候補。GBのLCD再有効化はステート構造にフィールドを追加するため、既存ステート保全策なしの一括更新はしない。native録画・M3U・GUI等は現Web実行経路にない。 |
| RomPatcher.js | [BPS整数処理の27cd192](https://github.com/marcrobledo/RomPatcher.js/commit/27cd192c3e5e5d138adf709d58c797c28c73936b)を確認。現Web側は64MiB上限、整数・各操作・位置の事前検査を持ち、この修正が必要な値はパーサーに渡らない。BPS作成や追加されたxdelta/LZMAは使用しない。上限や対応形式を変える場合は再確認する。 |
| ManicEMU | [5840a80まで](https://github.com/Manic-EMU/ManicEMU/compare/fbaeab79c214d5920bb51afa6f2d786fb2b12a58...5840a80d333753c22038420da5c111a7fa9103a4)の10コミットを確認。比較APIの300ファイル制限を全tree比較（627変更blob）で補完。採用元のDSセーブ変換・Settings・入力監視・同期本体は不変。UIKitのscene・多窓・AirPlay・外部アプリ・3DS等の差分は現Web DOMの実行経路にない。 |
| Celio-mGBA-Link | [81200bcまで](https://github.com/Celio-Link/Celio-mGBA-Link/compare/5f29daba2a331f721203f430b28750e72e68ac02...81200bc6f14c952d6bea4c6412e7f95485d732d8)の3コミットを確認。51byteとPlayerSettingsは0.3.42の2人範囲で対応済み。Luaの4席キューとSIOMULTI0..3監視は将来の4人対応時に必要。現WASMは32bit SIOMULTI0読み出しで一度処理し、未使用席をFFFFにする。直接USBの64byte契約とLua0.3のJSON WebSocketは異なるため差し替えない。 |
| DeSmuME 2015・Mesen-S・VBA-Next | 日次比較で固定採用SHAと一致。更新なし。 |

実行対象にないnative機能を移植せず、必要な境界修正を選んだ。すべてを上流最新版にそろえたという意味ではない。ClownMDEmuの対応ソース・変更通知・再ビルドの証跡はSOURCES.json、sources/build-evidence.json、NOTICES.mdへ記録した。

### PDFスキンの読み込み

[PDF.js安定版6.5.438](https://github.com/mozilla/pdf.js/releases/tag/v6.5.438)（0a4153349dc473ba950fc17941c5ca7eda43c1de）へ更新。新規の公開RCE advisoryへの緊急対応ではないが、[CFFフォントの繰り返し処理](https://github.com/mozilla/pdf.js/pull/22357)、[不正PostScript lexer](https://github.com/mozilla/pdf.js/pull/22365)、[Type4関数の計算量と再帰制限](https://github.com/mozilla/pdf.js/pull/22231)は、取り込むPDFスキンのJS処理でも関係する。現版でCFFの停止しない処理を隔離テストで確認したため、更新対象とした。

公式npmの2ブラウザバンドルをSHA-512 integrityと照合し、未改変で使用する。対応する344ファイルのライブラリ・ビルド用ソースを固定Git SHAから収集し、各Git blob hashを照合した。Apache-2.0を維持し、Node canvas、テストPDF、フォント・画像資産、追加renderer workerのバンドルは含めない。既存のeval・WASM・外部取得制限を維持し、getDocumentの呼び出しAPIは変更しない。配布元・取得値・収録範囲はsources/pdfjs-build.jsonへ記録した。

## 2026-10-12時点の確認記録（履歴）

0.3.15の配布対象について、固定版と公開ブランチ／リリースの差分を確認しました。
最新版への一括差し替えは行わず、互換性修正を取り込み、既存の保存データを検査しています。
これは公開コードの確認記録です。公開Celioサーバーがどのコミットを実行しているかを示すものではありません。

## rom64-netlink-7の追加確認（2026-10-13）

[Windows版netlink7](https://github.com/pm-start/mGBA_celio_edition/releases/tag/rom64-netlink-7)のタグと`rom64`の先端は`507d4411574be5932edd4e01274aba326eafb4d6`です。[現採用`0ba86121…`からの比較](https://github.com/pm-start/mGBA_celio_edition/compare/0ba86121bd92aa570d38301086d8e8f584238d62...507d4411574be5932edd4e01274aba326eafb4d6)は3コミット・6ファイルで、READMEとQt版のCelioNet／通信設定／Windowの変更です。Web版へ組み込むWASMコアの変更はありません。

- [参加通知の重複修正](https://github.com/pm-start/mGBA_celio_edition/commit/229f94c32f665b5d1d48f383308a8672ce0e57f3)：本版の`src/link/room-link.js`は、接続済みの`partnerJoined`でデバイスを再初期化せず、重複通知にもACKを返します。上流の修正対象だったQt版の遅延リセットも使用していません。既存`tests/room-link.cjs`に、参加通知のACKを落として再送させる検査があります。今回はコード比較での確認で、通信試験は再実行していません。
- [通信サーバーの選択・設定保持](https://github.com/pm-start/mGBA_celio_edition/commit/507d4411574be5932edd4e01274aba326eafb4d6)：Web版は固定WSSを継続します。任意サーバーの選択は未実装の追加機能で、互換性のための必須修正ではありません。導入する場合は通信UI・設定・CSP・プライバシー説明の変更が必要です。
- Windowsのportable設定説明はWeb版に影響しません。Windows ZIPは実行・同梱していません。

今回は上流比較記録だけを追加し、`SOURCES.json`の採用コミット、WASM、既存のライセンス・作者表記を維持します。下表の2026-10-12時点の確認結果は履歴として残します。

## 反映した変更

- **Celio通信**：旧サーバー `d19ad22a0c6a11467c9234c6cacd291eb0f15dbd` と
  新サーバー `8f509bdcf2a8383b936e0f2f31b2f6553ae421ce` の両方に対応。
  新形式では複数パケット、コマンド・セッションイベントの受信確認、番号を維持した再送を扱います。
  データの重複は実行せず、順序を戻し、待ち行列と再送回数に上限を設けます。
  切断時は従来どおり通信前へ戻します。人数は2人のままです。
  [比較](https://github.com/Celio-Link/Celio-Server/compare/d19ad22a0c6a11467c9234c6cacd291eb0f15dbd...8f509bdcf2a8383b936e0f2f31b2f6553ae421ce)
- **FCEUmm**：採用版 `d9d7e141274d07186b6a871ca2919b6f13cfb2f9` に
  Mapper 176の修正 `b6870c3e146105b646e5d3505fcddf34ebaa9603` をバックポート。
  リセット時のバンク、通常／拡張モードのPRGマスク、CHR ROM/RAMの選択を修正します。
  Cファイル1件だけを置き換え、変更通知を追加。ステートの形式は変えていません。
  その他の新規マッパー追加・既存マッパー群の再構成・32bit映像対応は今回採用していません。
  [修正](https://github.com/EmulatorJS/libretro-fceumm/commit/b6870c3e146105b646e5d3505fcddf34ebaa9603)
- **取得先**：mGBA Celioは `pm-start/mGBA_celio_edition`、Web接続部は
  `pm-start/mgba-celio-web` の現URLへ更新。従来の作者名と採用コミットは維持します。

## 確認したコア・参照元

| 対象 | 確認した上流の先端 | 判断 |
| --- | --- | --- |
| [ManicEMU](https://github.com/Manic-EMU/ManicEMU/commit/fbaeab79c214d5920bb51afa6f2d786fb2b12a58) | `fbaeab79c214d5920bb51afa6f2d786fb2b12a58` | 採用版と同じ |
| [ManicEMUSkins](https://github.com/Manic-EMU/ManicEMUSkins/commit/63c04f92febba461d10ea16ef00b0f76199a5b20) | `63c04f92febba461d10ea16ef00b0f76199a5b20` | 採用版と同じ。許諾確認済みの7機種だけを継続 |
| [mGBA Celio rom64](https://github.com/pm-start/mGBA_celio_edition/compare/0ba86121bd92aa570d38301086d8e8f584238d62...abb362c4d782b3b832272ab0cca5bcd45956f04c) | `abb362c4d782b3b832272ab0cca5bcd45956f04c` | 差分はWindowsのportable.iniの説明のみ。コアは採用済みの `0ba86121bd92` を維持 |
| [mGBA Celio Web](https://github.com/pm-start/mgba-celio-web/commit/23235bc6db1b67009808c0dc7e1f25131eb75e7a) | `23235bc6db1b67009808c0dc7e1f25131eb75e7a` | 6MiBセーブ、復帰操作、保存履歴、通信時1倍速は本版で対応済み。ARM・描画・音声の独自最適化は作者のrom64コアとは別の変更で、今回の不具合修正には含めない。既存の[比較記録](README.md#フィルターとコア最適化の比較2026-10-09)も参照 |
| [Celioデバイス](https://github.com/Celio-Link/Celio-mGBA-Link/commit/5f29daba2a331f721203f430b28750e72e68ac02) | `5f29daba2a331f721203f430b28750e72e68ac02` | 採用版と同じ |
| [Celioサーバー](https://github.com/Celio-Link/Celio-Server/commit/8f509bdcf2a8383b936e0f2f31b2f6553ae421ce) | `8f509bdcf2a8383b936e0f2f31b2f6553ae421ce` | 上記の通信形式に対応。productionとmainで確認した人数上限は2人 |
| [FCEUmm](https://github.com/EmulatorJS/libretro-fceumm/compare/d9d7e141274d07186b6a871ca2919b6f13cfb2f9...e1630de02074801eb96f3bc4ff33f69df9554c69) | `e1630de02074801eb96f3bc4ff33f69df9554c69` | 上記のMapper 176修正を採用。全体更新ではない |
| [Mesen-S](https://github.com/libretro/Mesen-S/commit/9e4fdeb9b336470bc96beb8765b2e79c86a2da1e) | `9e4fdeb9b336470bc96beb8765b2e79c86a2da1e` | 採用版と同じ |
| [ClownMDEmu libretro](https://github.com/Clownacy/clownmdemu-libretro/commit/d43c2708b0a31c285ce16724b6c4a2e92af07346) | `d43c2708b0a31c285ce16724b6c4a2e92af07346` | 採用版と同じ。サブモジュールは親の固定版を維持 |
| [DeSmuME 2015](https://github.com/libretro/desmume2015/commit/422b688009ccb9f2917c086a8fe79c8cecb030ae) | `422b688009ccb9f2917c086a8fe79c8cecb030ae` | 採用版と同じ |
| [melonDS libretro](https://github.com/libretro/melonDS/commit/66b5d2634cd0a79030562811e6e05f5532f800ba) | `66b5d2634cd0a79030562811e6e05f5532f800ba` | 採用版と同じ |
| [VBA-Next](https://github.com/libretro/vba-next/commit/788192f215ad0a1413f1625b40ebba3423fa0ade) | `788192f215ad0a1413f1625b40ebba3423fa0ade` | 採用版と同じ |
| [jgenesis](https://github.com/jsgroth/jgenesis/compare/6c0933c0d689dce87b32266ee1c4eacf15e105f2...fc7374ebaac8ce6d8d13b93c75298e54f4ed9bba) | `fc7374ebaac8ce6d8d13b93c75298e54f4ed9bba` | PC Engine関連、PSGの個別ミュート、ネイティブWAV録音とその設定変更。今回使うコアの必須修正は見当たらず、既存ステートを優先して固定版を維持 |
| [PDF.js](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299) | 安定版 `6.4.299`、master `68f5e2182525acc90c030fd839f6cda90d555c17` | 安定版は採用版と同じ。次期6.5の描画ワーカー等は採用しない。公開セキュリティ情報の修正版より新しく、PDF表示ではeval・外部取得・WASMを無効化した設定を継続 |
| [DeltaCore](https://github.com/rileytestut/DeltaCore/commit/633dfa86967816315fe19b482511dab1ce517f28) | `633dfa86967816315fe19b482511dab1ce517f28` | スキン・入力の参照版と同じ |
| [Daiuno/RetroArch manicemu](https://github.com/Daiuno/RetroArch/tree/manicemu) | `00689c83f4d458e061d5fd7b52a181b8d240fe65` | 参照ブランチと同じ。別系列のmasterは移植対象ではない。RetroArch本体は組み込んでいない |

上表は公開Web版の8種類のコアと、そのUI・通信・スキン表示の参照元が対象です。
Emscripten等のビルド環境も再現性のため固定します。公開版で無効な3DSホスト用バイナリは配布・更新していません。

## 互換性・権利・検証

Celio新形式は、バッチ導入後に追加されたACK付きモードコマンドで判別します。
旧形式に余計なACKコールバックを付けると旧サーバーのRxJSが異なる形式の引数として扱うため、
旧サーバーへの送信形式はそのまま維持します。すべての中間開発版を保証する方式ではありません。
上流Webの確認時点のlink-session.jsはまだ旧形式です。同じ中継URLだけで全バージョンと通信できるとは扱いません。
確認した組み合わせと保存保護は [LINK_COMPATIBILITY.md](LINK_COMPATIBILITY.md) に記載しています。

FCEUmmの配布ソースは従来のGPL-2.0-or-later通知を保持し、本版ではGPL-3.0を選択します。
変更日はファイル冒頭に追加。別の場所へ展開した配布ソースから再ビルドし、JS/WASMの一致を確認しました。
旧コアで失敗する合成ROMが修正版で通ること、旧新ステートの相互読込とセーブ保持を確認しています。
Celioの新しい固定サーバーソースもGPL全文付きで同梱します。サーバーはテスト専用で、ブラウザへ組み込みません。

ROM・セーブ・ゲーム名を新たにネットへ送る処理はありません。検査は自作の合成ROMと端末内のテストデータを使用し、
通信試験は127.0.0.1の固定サーバーで実施します。iPhone実機と実ゲームでの交換完了は今回の自動検査に含まれません。

## 0.3.20の機能取り込み（2026-10-13）

本家UIと操作、Celio Webの最適化・映像効果、mGBAの周辺機器APIを追加で確認し、必要な機能を移植しました。
採用コミットと必要性・保存互換性・権利の確認結果は [FEATURE_REVIEW.md](FEATURE_REVIEW.md) に記録しています。
128 MiB ROM・MCP・3人以上の通信は確認時点で利用できる公開実装がなく、追加済みとは扱いません。
コアを無条件に最新版へ切り替えず、4件の最適化の差分も今後の候補更新時に検査します。
